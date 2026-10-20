import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

// Os ponta a ponta da conta e do sync (spec 11), com o Worker local (wrangler dev): o app, o Durable Object, o D1 e o R2 do Miniflare,
// num estado novo a cada rodada (.wrangler/e2e). O código do e-mail fica na caixa local (E2E_MAILBOX) e o Turnstile aceita o token de teste:
// nada sai da máquina. Em localhost (não 127.0.0.1), para o navegador guardar o cookie de sessão.
const PORT = 4339;
const ORIGIN = `http://localhost:${PORT}`;
const vars = [
  'ACCOUNTS_ENABLED:true',
  'E2E_MAILBOX:true',
  'RESTORE_MAX_RECORDS:10', // as mudanças acima de 10 vão pelo aparelho (copies.spec.ts); o de produção é 5000
  `APP_ORIGIN:${ORIGIN}`,
  'TURNSTILE_SITE_KEY:1x00000000000000000000BB',
  'TURNSTILE_SECRET:1x0000000000000000000000000000000AA',
  `BETTER_AUTH_SECRET:${randomBytes(24).toString('hex')}`, // um segredo novo por rodada, só deste processo
].map((v) => `--var ${v}`);

export default defineConfig({
  testDir: 'tests/e2e-sync',
  timeout: 90_000,
  workers: 1,
  use: { baseURL: ORIGIN, trace: 'retain-on-failure' },
  webServer: {
    command: [
      // Sem a conferência das dependências do pnpm: as builds do workerd (ignoradas de propósito) a fariam parar antes do build.
      'pnpm --config.verify-deps-before-run=false build',
      'rm -rf .wrangler/e2e',
      'npx wrangler d1 migrations apply DB --local --persist-to .wrangler/e2e',
      // --local-upstream: sem ele, o wrangler dev troca o host dos pedidos (a URL e o Origin) pelo da rota do beta, e o Better Auth e a caixa
      // local (só em localhost) os recusam.
      `npx wrangler dev --port ${PORT} --ip localhost --local-upstream localhost:${PORT} --persist-to .wrangler/e2e ${vars.join(' ')}`,
    ].join(' && '),
    url: `${ORIGIN}/api/health`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }],
});
