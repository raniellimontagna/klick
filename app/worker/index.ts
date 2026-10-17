// O Worker do Klick (spec 8.1): /api para a conta e o sync (router.ts); o resto, os arquivos do app (env.ASSETS), como antes. Uma vez por
// dia, o Cron Trigger (wrangler.jsonc, triggers.crons) roda a limpeza que a política promete (spec 10): os pedidos de código com mais de
// uma hora e os códigos vencidos. Ela não depende de nenhuma conta nem da cópia diária no R2 (a revisão final, I5).
import { forgetExpired } from './abuse';
import type { Env } from './env';
import { defaultDeps, handle } from './router';

export { AccountStore } from './account-store';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx, defaultDeps(env));
  },
  async scheduled(_controller, env) {
    const started = Date.now();
    await forgetExpired(env.DB, started);
    console.log(JSON.stringify({ evt: 'cleanup', ms: Date.now() - started }));
  },
} satisfies ExportedHandler<Env>;
