import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O cubo 3D da Trilha vem dos arquivos do cubing.js em public/vendor/cubing, que o service worker guarda para o offline (spec 9.5).
// Um arquivo acima do limite do workbox ficaria fora do pré-cache em silêncio. A pasta é gerada (node scripts/build-cubing.mjs, que o
// pnpm dev e o pnpm build rodam); sem ela, o teste não tem o que medir e fica de fora.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const vendor = resolve(app, 'public/vendor/cubing');

describe('o cubing.js inteiro cabe no pré-cache do service worker', () => {
  it.skipIf(!existsSync(vendor))('nenhum arquivo de public/vendor/cubing passa do maximumFileSizeToCacheInBytes do vite.config.ts', () => {
    const config = readFileSync(resolve(app, 'vite.config.ts'), 'utf8');
    const limit = config.match(/maximumFileSizeToCacheInBytes:\s*(\d+)\s*\*\s*1024\s*\*\s*1024/);
    expect(limit).not.toBeNull();
    const bytes = Number(limit![1]) * 1024 * 1024;
    const files = readdirSync(vendor).filter((f) => f.endsWith('.js'));
    expect(files.length).toBeGreaterThan(0);
    const largest = Math.max(...files.map((f) => statSync(resolve(vendor, f)).size));
    expect(largest).toBeLessThan(bytes);
  });
});

// O app e o Worker estão na mesma origem (spec 8.1). Uma navegação para /api/ (o link de um e-mail, alguém que abre /api/health) não pode
// receber o index.html do pré-cache: ela vai para o Worker. A política de privacidade (spec 9.5) é uma página própria: também não.
describe('o service worker deixa as navegações para /api/ e /privacidade irem à rede', () => {
  it('navigateFallbackDenylist do vite.config.ts recusa /api/ e /privacidade, e mais nada', () => {
    const config = readFileSync(resolve(app, 'vite.config.ts'), 'utf8');
    const list = config.match(/navigateFallbackDenylist:\s*\[([^\]]*)\]/);
    expect(list).not.toBeNull();
    const patterns = [...list![1].matchAll(/\/((?:\\\/|[^/,\s])+)\//g)].map((m) => new RegExp(m[1]));
    expect(patterns).toHaveLength(2);
    const denied = (path: string) => patterns.some((p) => p.test(path));
    for (const path of ['/api/health', '/api/auth/callback', '/api/sync', '/privacidade', '/privacidade/']) expect(denied(path)).toBe(true);
    for (const path of ['/', '/apiario', '/x/api/', '/x/privacidade', '/evolucao']) expect(denied(path)).toBe(false);
  });
});

// A revisão final (M4): os pedaços do login (o cliente do Better Auth, o da passkey e o que eles dividem) carregam só quando alguém abre o
// fluxo de entrar (sync/auth.ts, import dinâmico). Eles ficam fora do pré-cache: quem nunca entra não baixa uns 70 KB a cada versão. O nome
// de cada pedaço vem dos módulos dele (scripts/pwa-chunks.mjs), não do nome que o bundler escolhe ("client", "plugins", "config").
describe('os pedaços do login ficam fora do pré-cache do service worker', () => {
  const nm = (pkg: string, file = 'dist/index.mjs') => `/repo/node_modules/.pnpm/${pkg.replace('/', '+')}@1.0.0/node_modules/${pkg}/${file}`;

  it('um pedaço só com módulos do login ganha o prefixo "auth-"; um com qualquer outro módulo, não', async () => {
    const { isAuthChunk, chunkFileName } = await import('../../scripts/pwa-chunks.mjs');
    expect(isAuthChunk([nm('better-auth', 'dist/client/index.mjs'), nm('@better-auth/core'), nm('better-call'), nm('@better-fetch/fetch'), nm('nanostores'), nm('defu')])).toBe(true);
    expect(isAuthChunk([nm('@better-auth/passkey', 'dist/client.mjs'), nm('@simplewebauthn/browser'), '\0rolldown/runtime.js'])).toBe(true);
    expect(isAuthChunk([nm('better-auth'), '/repo/src/sync/auth.ts'])).toBe(false); // o código do app vai para o pré-cache
    expect(isAuthChunk([nm('workbox-window')])).toBe(false);
    expect(isAuthChunk(['\0rolldown/runtime.js'])).toBe(false);
    expect(isAuthChunk([])).toBe(false);
    expect(chunkFileName({ moduleIds: [nm('better-auth')] })).toBe('assets/auth-[name]-[hash].js');
    expect(chunkFileName({ moduleIds: ['/repo/src/ui/trilha/TrilhaScreen.svelte'] })).toBe('assets/[name]-[hash].js');
  });

  it('o vite.config.ts nomeia os pedaços pelos módulos e tira os "auth-" do pré-cache', () => {
    const config = readFileSync(resolve(app, 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/chunkFileNames:\s*chunkFileName/);
    expect(config).toMatch(/globIgnores:\s*\[AUTH_CHUNKS\]/);
  });

  // Com um build feito depois da última mudança do vite.config.ts: um pedaço que depende do código do Better Auth (o que tem a marca
  // "better-auth", e quem importa um desses) não está no pré-cache, e o pedaço principal está.
  const dist = resolve(app, 'dist');
  const sw = resolve(dist, 'sw.js');
  const built = existsSync(sw) && statSync(sw).mtimeMs >= statSync(resolve(app, 'vite.config.ts')).mtimeMs;
  it.skipIf(!built)('no build, nenhum pedaço do login está no pré-cache; o principal está', () => {
    const assets = resolve(dist, 'assets');
    const chunks = readdirSync(assets).filter((f) => f.endsWith('.js'));
    const code = new Map(chunks.map((f) => [f, readFileSync(resolve(assets, f), 'utf8')]));
    const imports = (f: string): string[] => [...code.get(f)!.matchAll(/(?:from|import)\s*["'`]\.\/([^"'`]+\.js)["'`]/g)].map((m) => m[1]);
    const marked = new Set(chunks.filter((f) => code.get(f)!.includes('better-auth')));
    expect(marked.size).toBeGreaterThan(0);
    // Quem importa (sem ser por import dinâmico) um pedaço do login também é do login, e o que eles importam também.
    let grew = true;
    while (grew) {
      grew = false;
      for (const f of chunks) {
        const deps = imports(f);
        if (!marked.has(f) && deps.some((d) => marked.has(d))) marked.add(f), (grew = true);
        if (marked.has(f)) for (const d of deps) if (!marked.has(d)) marked.add(d), (grew = true);
      }
    }
    const precached = new Set([...readFileSync(sw, 'utf8').matchAll(/url:"assets\/([^"]+\.js)"/g)].map((m) => m[1]));
    expect([...marked].filter((f) => precached.has(f))).toEqual([]);
    expect([...marked].every((f) => f.startsWith('auth-'))).toBe(true);
    const main = readFileSync(resolve(dist, 'index.html'), 'utf8').match(/src="\/assets\/([^"]+\.js)"/)![1];
    expect(marked.has(main)).toBe(false);
    expect(precached.has(main)).toBe(true);
  });
});
