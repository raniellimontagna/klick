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
