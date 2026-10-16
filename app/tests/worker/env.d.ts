// O env dos testes do Worker (`env` de cloudflare:workers): as ligações do wrangler.jsonc, o tipo de worker/env.ts, e a lista de migrações
// do D1 que o vitest.worker.config.ts passa.
type KlickWorkerEnv = import('../../worker/env').Env;

declare namespace Cloudflare {
  interface Env extends KlickWorkerEnv {
    TEST_MIGRATIONS: import('cloudflare:test').D1Migration[];
  }
}
