// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// Sem um BETTER_AUTH_SECRET de verdade, as rotas da conta respondem 503. De /api/auth/*, só as rotas do Better Auth que o app usa; as outras
// rotas da conta pedem sessão e falam com o Durable Object dela. O que não é /api são os arquivos do app. Os logs levam só ids, contagens,
// durações e erros (spec 8.5).
import { SYNC_BATCH, SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { E2E_TOKEN, guardPasskeyOptions, guardSendCode, turnstileVerifier, type VerifyCaptcha } from './abuse';
import { authSecretOk, createAuth, sessionUser, type User } from './auth';
import type { Env } from './env';
import { e2eMailbox, e2eMailer, missingMailer, resendMailer, type Mailer } from './mail';

export interface Deps {
  now: () => number;
  mailer: Mailer;
  verifyCaptcha: VerifyCaptcha;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

// Em caracteres do corpo. Um lote cheio de verdade, 500 mudanças de até 16 KB (a temporada, até 64 KB) mais o envelope de cada uma, dá
// uns 8,4 MB: com a folga, ele nunca leva 413.
export const MAX_BODY = 10_000_000;
export const MAX_AUTH_BODY = 65_536; // um pedido de login: e-mail e código, ou a resposta WebAuthn de uma passkey (poucos KB)

// As rotas do Better Auth 1.7.7 que o app usa (Tasks 14 e 15), cada uma com o seu método; o resto de /api/auth/* é 404. A biblioteca
// expõe mais do que o login por código e a passkey precisam: senha, verificação de e-mail, e conferir o código sem consumir a tentativa
// (check-verification-otp, que aceita palpites em paralelo além das 5 tentativas). Uma versão nova pode acrescentar rotas: a lista é
// daqui, não do disabledPaths do Better Auth.
const AUTH_ROUTES = new Map<string, string>([
  ['/api/auth/email-otp/send-verification-otp', 'POST'],
  ['/api/auth/sign-in/email-otp', 'POST'],
  ['/api/auth/get-session', 'GET'],
  ['/api/auth/sign-out', 'POST'],
  ['/api/auth/revoke-sessions', 'POST'],
  ['/api/auth/passkey/generate-register-options', 'GET'],
  ['/api/auth/passkey/verify-registration', 'POST'],
  ['/api/auth/passkey/generate-authenticate-options', 'GET'],
  ['/api/auth/passkey/verify-authentication', 'POST'],
  ['/api/auth/passkey/list-user-passkeys', 'GET'],
  ['/api/auth/passkey/delete-passkey', 'POST'],
]);

// Na nuvem: o Resend e o Turnstile de verdade. No ponta a ponta local (E2E_MAILBOX, só no wrangler dev), a caixa local e o token de teste.
export function defaultDeps(env: Env): Deps {
  const e2e = env.E2E_MAILBOX === 'true';
  const mailer = e2e ? e2eMailer : env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : missingMailer;
  const verifyCaptcha: VerifyCaptcha = e2e ? async (token) => token === E2E_TOKEN : turnstileVerifier(env.TURNSTILE_SECRET);
  return { now: () => Date.now(), mailer, verifyCaptcha, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
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

// O corpo é lido aos pedaços, e a leitura para assim que passa de `max` caracteres: um pedido grande demais nunca fica inteiro na memória,
// nem um corpo em partes, que não tem Content-Length. Quando o Content-Length vem, ele barra antes de ler: um caractere ocupa até 3 bytes
// em UTF-8, então mais de 3 × max bytes não cabem em `max` caracteres.
async function readText(request: Request, max: number): Promise<string | Response> {
  if (Number(request.headers.get('Content-Length')) > 3 * max) return fail(413, 'too-big');
  let text = '';
  if (request.body) {
    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    for (let part = await reader.read(); !part.done; part = await reader.read()) {
      text += decoder.decode(part.value, { stream: true });
      if (text.length > max) {
        await reader.cancel().catch(() => undefined);
        return fail(413, 'too-big');
      }
    }
    text += decoder.decode();
  }
  return text.length > max ? fail(413, 'too-big') : text;
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};

async function readJson(request: Request): Promise<unknown> {
  const text = await readText(request, MAX_BODY);
  if (text instanceof Response) return text;
  const body = parseJson(text);
  return body === undefined ? fail(400, 'json') : body;
}

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Uma rota de /api/auth/* vai ao Better Auth só se está na lista, com o método dela. O corpo de um POST é lido aqui, com limite, e segue
// num pedido novo (sem corpo, se veio sem: um corpo vazio com Content-Type JSON o Better Auth recusa). Pedir o código só vale para entrar:
// os outros tipos (senha, verificação de e-mail) gravam a mais no D1 para um e-mail sem conta, e o tempo da resposta denunciaria quem tem
// conta (spec 7.5). Depois do tipo, o guarda (abuse.ts): o Turnstile e os limites. As opções da passkey, sem sessão, passam pela rajada.
async function authRoute(request: Request, path: string, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  if (AUTH_ROUTES.get(path) !== request.method) return fail(404, 'not-found');
  if (request.method !== 'POST') {
    if (path === '/api/auth/passkey/generate-authenticate-options') {
      const blocked = await guardPasskeyOptions(request, env);
      if (blocked) return blocked;
    }
    return createAuth(env, ctx, deps.mailer).handler(request);
  }
  const text = await readText(request, MAX_AUTH_BODY);
  if (text instanceof Response) return text;
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  const forward = new Request(request.url, { method: 'POST', headers, body: text || null });
  if (path === '/api/auth/email-otp/send-verification-otp') {
    const body = parseJson(text);
    if (!isRec(body) || body.type !== 'sign-in') return fail(400, 'bad-request');
    const blocked = await guardSendCode(forward, env, deps);
    if (blocked) return blocked;
  }
  return createAuth(env, ctx, deps.mailer).handler(forward);
}

// A caixa do ponta a ponta local (E2E_MAILBOX): só com a variável ligada e só em localhost. Na nuvem, 404.
function e2eCode(url: URL, env: Env): Response {
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (env.E2E_MAILBOX !== 'true' || !local) return fail(404, 'not-found');
  return json({ code: e2eMailbox.get((url.searchParams.get('email') ?? '').toLowerCase()) ?? null });
}

// O pedido de sync (spec 6.1). Uma versão de protocolo que o servidor não conhece pede um app mais novo (426); sem versão numérica, o
// pedido é que está torto (400).
export function parseSyncRequest(body: unknown): SyncRequest | 'update' | null {
  if (!isRec(body) || typeof body.v !== 'number') return null;
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
  if (path === '/api/__e2e/otp') return e2eCode(url, env);
  if (!authSecretOk(env)) {
    log({ evt: 'auth-secret-missing' });
    return fail(503, 'unavailable');
  }
  if (path.startsWith('/api/auth/')) return authRoute(request, path, env, ctx, deps);

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
