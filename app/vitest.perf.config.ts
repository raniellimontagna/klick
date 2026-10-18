import path from 'node:path';
import { defineConfig } from 'vitest/config';

// A medição de uma conta de 100 mil solves no plano gratuito (endurecimento, Task 11): `vitest run -c vitest.perf.config.ts`. Fica fora do
// `pnpm test` (vitest.config.ts só vê tests/unit) e do `test:worker` (tests/worker). Roda no Node, num processo só, com `gc()` à mão
// (--expose-gc), e escreve docs/superpowers/measurements/2026-10-17-conta-100k.md. O objeto da conta de verdade roda aqui: o import de
// `cloudflare:workers` vira a casca de tests/perf/cloudflare-workers.ts.
export default defineConfig({
  resolve: { alias: { 'cloudflare:workers': path.join(import.meta.dirname, 'tests/perf/cloudflare-workers.ts') } },
  test: {
    environment: 'node',
    include: ['tests/perf/**/*.perf.ts'],
    pool: 'forks',
    execArgv: ['--expose-gc'],
    fileParallelism: false,
    testTimeout: 600_000,
    hookTimeout: 600_000,
  },
});
