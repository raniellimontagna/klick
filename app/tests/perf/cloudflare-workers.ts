// A casca de `cloudflare:workers` da medição (vitest.perf.config.ts troca o import por esta): o objeto da conta de verdade
// (worker/account-store.ts) roda no Node só com o que ele usa da classe base, o `ctx` e o `env`. Não é um arquivo de teste.
export class DurableObject<E = unknown> {
  protected ctx: DurableObjectState;
  protected env: E;

  constructor(ctx: DurableObjectState, env: E) {
    this.ctx = ctx;
    this.env = env;
  }
}
