import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { distProblems } from '../../scripts/check-dist.mjs';

// A revisão final (M3): o vitest.worker.config.ts cria um dist/ vazio (o plugin pede que ele exista). Num clone novo, `test:worker` e depois
// `wrangler deploy` publicariam um site vazio para todo mundo. O wrangler.jsonc roda scripts/check-dist.mjs antes de todo deploy (build.command):
// sem um build de verdade, ele recusa. Os scripts deploy:beta e deploy:production fazem o build antes.
const app = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tmp = (): string => mkdtempSync(join(tmpdir(), 'klick-dist-'));
const PAGE = '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-AbC123.js"></script></head><body></body></html>';

describe('o deploy não sai sem um build de verdade', () => {
  it('um dist/ vazio, ou sem a pasta, é recusado', () => {
    expect(distProblems(tmp())).not.toEqual([]);
    expect(distProblems(join(tmp(), 'nao-existe'))).not.toEqual([]);
  });

  it('um index.html sem o script do app, ou com o script que não está no dist, é recusado', () => {
    const noScript = tmp();
    writeFileSync(join(noScript, 'index.html'), '<!doctype html><title>Klick</title>');
    writeFileSync(join(noScript, 'sw.js'), '');
    expect(distProblems(noScript)).not.toEqual([]);
    const missing = tmp();
    writeFileSync(join(missing, 'index.html'), PAGE);
    writeFileSync(join(missing, 'sw.js'), '');
    expect(distProblems(missing).join(' ')).toContain('assets/index-AbC123.js');
  });

  it('sem o service worker (sw.js) do build, também', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'index.html'), PAGE);
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'assets', 'index-AbC123.js'), 'export {}');
    expect(distProblems(dir).join(' ')).toContain('sw.js');
    writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("install", () => {})');
    expect(distProblems(dir)).toEqual([]);
  });

  it('o wrangler.jsonc roda a conferência antes de todo deploy, nos dois ambientes', () => {
    const text = readFileSync(resolve(app, 'wrangler.jsonc'), 'utf8');
    const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
      build?: { command?: string };
      env: { production: { build?: { command?: string } } };
    };
    for (const build of [config.build, config.env.production.build]) expect(build?.command).toBe('node scripts/check-dist.mjs');
  });

  it('deploy:beta e deploy:production fazem o build antes de publicar', () => {
    const { scripts } = JSON.parse(readFileSync(resolve(app, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(scripts['deploy:beta']).toBe('pnpm run build && wrangler deploy');
    expect(scripts['deploy:production']).toBe('pnpm run build && wrangler deploy --env production');
  });
});
