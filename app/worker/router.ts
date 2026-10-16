// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// As rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos do app. Os logs levam só ids,
// contagens, durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import type { Env } from './env';

export interface User {
  id: string;
  email: string;
}

export interface Deps {
  now: () => number;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

// Em caracteres do corpo. Um lote cheio de verdade, 500 mudanças de até 16 KB (a temporada, até 64 KB) mais o envelope de cada uma, dá
// uns 8,4 MB: com a folga, ele nunca leva 413.
export const MAX_BODY = 10_000_000;

// Ainda sem login (etapa 3 da spec): ninguém tem sessão, e as rotas da conta respondem 401.
export function defaultDeps(_env: Env): Deps {
  return { now: () => Date.now(), resolveUser: async () => null };
}

const json = (data: unknown, status = 200): Response => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (status: number, error: string): Response => json({ error }, status);
const log = (entry: Record<string, string | number>): void => console.log(JSON.stringify(entry));
export const accountsOn = (env: Env): boolean => env.ACCOUNTS_ENABLED === 'true';

// As escritas pedem JSON e a mesma origem (spec 7.3): um formulário de outro site não chega aqui.
function writeGuard(request: Request, env: Env): Response | null {
  if (!(request.headers.get('Content-Type') ?? '').startsWith('application/json')) return fail(415, 'json');
  const origin = request.headers.get('Origin');
  if (origin !== null && origin !== env.APP_ORIGIN) return fail(403, 'origin');
  return null;
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY) return fail(413, 'too-big');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return fail(400, 'json');
  }
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// O pedido de sync (spec 6.1). Uma versão de protocolo que o servidor não conhece pede um app mais novo (426).
export function parseSyncRequest(body: unknown): SyncRequest | 'update' | null {
  if (!isRec(body)) return null;
  if (body.v !== SYNC_PROTOCOL) return 'update';
  const { deviceId, cursor, clock, changes } = body;
  if (typeof deviceId !== 'string' || deviceId === '' || deviceId.length > 64) return null;
  if (!Number.isInteger(cursor) || (cursor as number) < 0 || typeof clock !== 'number' || !Number.isFinite(clock)) return null;
  if (!Array.isArray(changes) || changes.length > SYNC_BATCH) return null;
  return { v: SYNC_PROTOCOL, deviceId, cursor: cursor as number, clock, changes };
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) return fail(401, 'auth');
  // O objeto da conta nasce no leste dos EUA (a página de privacidade diz "servidores nos EUA"); a dica só vale quando ele é criado.
  const account = env.ACCOUNT.get(env.ACCOUNT.idFromName(user.id), { locationHint: 'enam' });

  if (path === '/api/sync' && request.method === 'POST') {
    const guard = writeGuard(request, env);
    if (guard) return guard;
    if (!(await env.API_BURST.limit({ key: user.id })).success) return fail(429, 'limited');
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const req = parseSyncRequest(body);
    if (req === 'update') return fail(426, 'update');
    if (req === null) return fail(400, 'bad-request');
    const started = deps.now();
    // O tipo do stub (RPC) não acompanha `data: unknown`; o objeto que volta é o SyncResponse do Durable Object.
    const res = (await account.syncBatch(user.id, req, started)) as unknown as SyncResponse;
    log({ evt: 'sync', user: user.id, pushed: req.changes.length, rejected: res.rejected.length, pulled: res.changes.length, ms: deps.now() - started });
    return json(res);
  }

  return fail(404, 'not-found');
}
