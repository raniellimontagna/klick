// O env dos testes do Worker (`env` de cloudflare:workers): as ligações do wrangler.jsonc, o tipo de worker/env.ts.
type KlickWorkerEnv = import('../../worker/env').Env;

declare namespace Cloudflare {
  interface Env extends KlickWorkerEnv {}
}
