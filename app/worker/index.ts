// O Worker do Klick (spec 8.1): /api para a conta e o sync (router.ts); o resto, os arquivos do app (env.ASSETS), como antes.
import type { Env } from './env';
import { defaultDeps, handle } from './router';

export { AccountStore } from './account-store';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx, defaultDeps(env));
  },
} satisfies ExportedHandler<Env>;
