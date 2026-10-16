import { mkdirSync } from 'node:fs';
import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Os testes do servidor (spec 11) rodam dentro do workerd, com o wrangler.jsonc de verdade (o ambiente beta, de cima) e os bancos locais
// do Miniflare. O `pnpm test` (vitest.config.ts, jsdom) não os vê: rodam com `pnpm test:worker`.
export default defineConfig(() => {
  mkdirSync('dist', { recursive: true }); // a pasta dos arquivos do app: o plugin pede que ela exista; os testes não precisam do build
  return {
    plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
    test: { include: ['tests/worker/**/*.test.ts'] },
  };
});
