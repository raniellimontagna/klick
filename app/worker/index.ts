// O Worker do Klick (spec 8.1): /api para a conta e o sync (router.ts); o resto, os arquivos do app (env.ASSETS), como antes. Uma vez por
// dia, o Cron Trigger (wrangler.jsonc, triggers.crons) roda a limpeza que a política promete (spec 10): os pedidos de código com mais de
// uma hora e os códigos vencidos. Ela não depende de nenhuma conta nem da cópia diária no R2 (a revisão final, I5): vai primeiro. Depois,
// a recontagem do espaço das cópias (endurecimento 4.2, budget.ts): lista snap/ e tira da conta o que a regra de 30 dias do bucket apagou.
// Ela roda às 03:15 UTC, depois das cópias do dia (03:05 UTC, no alarme de cada conta). `storage`, no log: o total recontado, ou null
// (sem operações A no mês, o valor ficou). A recontagem lê as tabelas da migração 0003: num D1 ainda sem ela (a raiz publicada antes de
// migrar), ela falha sozinha, com um código fixo no log ('recount-failed'), e a limpeza e o log dela seguem.
import { forgetExpired } from './abuse';
import { recountStorage } from './budget';
import type { Env } from './env';
import { defaultDeps, handle } from './router';

export { AccountStore } from './account-store';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx, defaultDeps(env));
  },
  async scheduled(_controller, env, _ctx) {
    const started = Date.now();
    await forgetExpired(env.DB, started);
    let storage: number | null = null;
    try {
      storage = await recountStorage(env, started);
    } catch {
      console.log(JSON.stringify({ evt: 'recount-failed' }));
    }
    console.log(JSON.stringify({ evt: 'cleanup', storage, ms: Date.now() - started }));
  },
} satisfies ExportedHandler<Env>;
