// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// O que não é /api são os arquivos do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import type { Env } from './env';

export interface Deps {
  now: () => number;
}

export function defaultDeps(_env: Env): Deps {
  return { now: () => Date.now() };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string): Response => json({ error }, status);
export const accountsOn = (env: Env): boolean => env.ACCOUNTS_ENABLED === 'true';

export async function handle(request: Request, env: Env, _ctx: ExecutionContext, _deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');
  return fail(404, 'not-found');
}
