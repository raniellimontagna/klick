// As rotas do Worker (spec 8.1). /api/health sem sessão; com ACCOUNTS_ENABLED diferente de 'true', o resto de /api responde 404 (spec 8.4).
// Sem um BETTER_AUTH_SECRET de verdade, as rotas da conta respondem 503. De /api/auth/*, só as rotas do Better Auth que o app usa; as outras
// rotas da conta pedem sessão e a conta que o aparelho espera (a da sessão, senão 401), e falam com o Durable Object dela. O que não é /api
// são os arquivos do app. Os logs levam só ids, contagens, durações e erros (spec 8.5).
import { ACCOUNT_HEADER, isFloor, SYNC_PROTOCOL, type RestoreRefusal, type SyncRequest, type SyncResponse } from '../src/core/sync/types';
import { E2E_TOKEN, emailKeyOf, guardPasskeyOptions, guardSendCode, guardVerifyCode, otpBindCookie, turnstileVerifier, type VerifyCaptcha } from './abuse';
import { authSecretOk, createAuth, sessionUser, type User } from './auth';
import { countOps } from './budget';
import type { Env } from './env';
import { MAX_SYNC_REQUEST } from './limits';
import { e2eMailbox, e2eMailer, missingMailer, resendMailer, type Mailer } from './mail';
import { SNAPSHOT_NAME, snapshotPrefix } from './snapshots';

export interface Deps {
  now: () => number;
  mailer: Mailer;
  verifyCaptcha: VerifyCaptcha;
  resolveUser: (request: Request, env: Env, ctx: ExecutionContext) => Promise<User | null>; // a sessão do pedido; os testes passam um falso
}

// Em caracteres do corpo. Um lote cheio de verdade, MAX_SYNC_REQUEST (500) mudanças de até 16 KB (a temporada, até 64 KB) mais o
// envelope de cada uma, dá uns 8,4 MB: com a folga, ele nunca leva 413.
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
  const host = new URL(env.APP_ORIGIN).hostname; // um token do Turnstile só vale no hostname deste ambiente
  const verifyCaptcha: VerifyCaptcha = e2e ? async (token) => token === E2E_TOKEN : turnstileVerifier(env.TURNSTILE_SECRET, host);
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
    if (!isRec(body) || body.type !== 'sign-in' || typeof body.email !== 'string') return fail(400, 'bad-request');
    const guard = await guardSendCode(forward, env, deps);
    if (guard instanceof Response) return guard;
    // O envio sai depois da resposta (auth.ts, waitUntil): o Resend que falha também devolve a vaga do teto.
    const mailer: Mailer = { sendCode: (email, code) => deps.mailer.sendCode(email, code).catch(async (err: unknown) => {
      await guard.release().catch(() => undefined);
      throw err;
    }) };
    const sent = await createAuth(env, ctx, mailer).handler(forward);
    // O Better Auth recusou depois da reserva: o e-mail não saiu, e volta ao teto. Saiu: o código fica preso a este aparelho (abuse.ts).
    if (!sent.ok) {
      await guard.release();
      return sent;
    }
    const res = new Response(sent.body, sent);
    res.headers.append('Set-Cookie', await otpBindCookie(body.email, env.BETTER_AUTH_SECRET, env.APP_ORIGIN.startsWith('https://')));
    return res;
  }
  if (path === '/api/auth/sign-in/email-otp') {
    const blocked = await guardVerifyCode(forward, env);
    if (blocked) return blocked;
  }
  return createAuth(env, ctx, deps.mailer).handler(forward);
}

// As rotas do ponta a ponta local valem só com E2E_MAILBOX ligada e só em localhost. Na nuvem, 404.
const e2eOn = (url: URL, env: Env): boolean => env.E2E_MAILBOX === 'true' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');

// A caixa do ponta a ponta local: o código do e-mail, que o Worker local não envia.
function e2eCode(url: URL, env: Env): Response {
  if (!e2eOn(url, env)) return fail(404, 'not-found');
  return json({ code: e2eMailbox.get((url.searchParams.get('email') ?? '').toLowerCase()) ?? null });
}

// A conta que o aparelho espera, no pedido (o `account` do sync, ou o cabeçalho ACCOUNT_HEADER das outras rotas): um id de até 128 caracteres.
const isAccountId = (v: unknown): v is string => typeof v === 'string' && v !== '' && v.length <= 128;

// O pedido de sync (spec 6.1). Uma versão de protocolo que o servidor não conhece pede um app mais novo (426); sem versão numérica, o
// pedido é que está torto (400). `account` é obrigatório: nenhum app publicado sincroniza sem ele (a conta não estava ligada em nenhum
// ambiente antes dele). Até MAX_SYNC_REQUEST mudanças, o lote de um app de antes da Task 12: o objeto da conta lê só as primeiras
// MAX_WRITES_PER_REQUEST e devolve o resto para já. `floor` (o piso de uma restauração pelo aparelho, o acabamento A1) é opcional, e quando
// vem é um inteiro seguro >= 0. Os campos que o servidor não conhece ficam de fora (um Worker de antes do piso ignora o `floor` assim, sem
// recusar o pedido, e o aparelho, sem a confirmação, o manda de novo).
export function parseSyncRequest(body: unknown): SyncRequest | 'update' | null {
  if (!isRec(body) || typeof body.v !== 'number') return null;
  if (body.v !== SYNC_PROTOCOL) return 'update';
  const { account, deviceId, cursor, clock, changes, floor } = body;
  if (!isAccountId(account)) return null;
  if (typeof deviceId !== 'string' || deviceId === '' || deviceId.length > 64) return null;
  if (!Number.isInteger(cursor) || (cursor as number) < 0 || typeof clock !== 'number' || !Number.isFinite(clock)) return null;
  if (!Array.isArray(changes) || changes.length > MAX_SYNC_REQUEST) return null;
  if (floor !== undefined && !isFloor(floor)) return null;
  return { v: SYNC_PROTOCOL, account, deviceId, cursor: cursor as number, clock, changes, ...(floor === undefined ? {} : { floor }) };
}

// A conta que o aparelho espera não é a da sessão (revisão final, C1): o cookie de outra conta (a pessoa entrou com outro e-mail e o
// aparelho ainda está na conta de antes) nunca lê nem grava na conta deste aparelho. 401, como uma sessão que não vale para esta conta: o
// app mostra "Entrar de novo" e o motor para de pedir (um 409 viraria erro do servidor e nova tentativa a cada 5 minutos). Sem a conta no
// pedido, 400.
function accountGuard(expected: unknown, user: User): Response | null {
  if (!isAccountId(expected)) return fail(400, 'bad-request');
  if (expected === user.id) return null;
  log({ evt: 'account-mismatch', user: user.id });
  return fail(401, 'auth');
}

// Apagar a conta leva as cópias dela no R2 (apagar no R2 não custa operação). Cada listagem conta como operação A do mês, sem recusar: as
// cópias de uma conta apagada não podem ficar porque o mês acabou.
async function deleteCopies(env: Env, userId: string, now: number): Promise<void> {
  for (;;) {
    await countOps(env.DB, 'A', 1, now);
    const page = await env.SNAPSHOTS.list({ prefix: snapshotPrefix(userId), limit: 1000 });
    if (page.objects.length === 0) return;
    await env.SNAPSHOTS.delete(page.objects.map((o) => o.key));
  }
}

// O status de cada recusa da restauração (decisões 1, 2, 3 e 6), com o código no corpo ({ error }): sem espaço para a cópia de antes (409),
// restaurações demais no dia ou o orçamento de gravações de hoje (429), sem operações do R2 no mês (503) e grande demais para um dia (413).
const REFUSAL_STATUS: Record<RestoreRefusal, number> = { 'no-room': 409, 'restore-limit': 429, 'r2-budget': 503, 'too-big': 413, 'write-budget': 429 };

// Os códigos pendentes de um e-mail, por ele exato: o identificador do Better Auth é "<tipo>-otp-<e-mail>", e o tipo não tem "-otp-".
const PENDING_CODES = "DELETE FROM verification WHERE instr(identifier, '-otp-') > 0 AND substr(identifier, instr(identifier, '-otp-') + 5) = ?";

// O nome de uma cópia na rota, ou null: um nome fora do formato (ou que nem se lê como URI) não chega ao R2.
function copyName(raw: string): string | null {
  try {
    const name = decodeURIComponent(raw);
    return SNAPSHOT_NAME.test(name) ? name : null;
  } catch {
    return null;
  }
}

export async function handle(request: Request, env: Env, ctx: ExecutionContext, deps: Deps): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
  if (path === '/api/health') return json({ ok: true, accounts: accountsOn(env), turnstileSiteKey: accountsOn(env) ? env.TURNSTILE_SITE_KEY : null });
  if (!accountsOn(env)) return fail(404, 'not-found');
  if (path === '/api/__e2e/otp') return e2eCode(url, env);
  if (path === '/api/__e2e/snapshot' && !e2eOn(url, env)) return fail(404, 'not-found'); // antes da sessão: na nuvem nem o 401 a revela
  if (!authSecretOk(env)) {
    log({ evt: 'auth-secret-missing' });
    return fail(503, 'unavailable');
  }
  if (path.startsWith('/api/auth/')) return authRoute(request, path, env, ctx, deps);

  const user = await deps.resolveUser(request, env, ctx);
  if (!user) {
    // Apagar a conta sem sessão: o aparelho precisa saber se a conta acabou (apagada em outro aparelho: ele sai dela) ou se só a sessão
    // venceu (ele entra de novo). O id da conta é aleatório e só o aparelho o conhece, então dizer 'gone' ou 'auth' para ele não revela
    // nada de nenhum e-mail; nunca se procura por e-mail aqui. Como nas outras gravações, a origem e a rajada vêm antes de tocar no D1:
    // uma página de outra origem não ganha resposta, e o pedido sem sessão não martela o banco.
    if (path === '/api/account' && request.method === 'DELETE') {
      const guard = writeGuard(request, env);
      if (guard) return guard;
      const id = request.headers.get(ACCOUNT_HEADER);
      if (isAccountId(id)) {
        if (!(await env.API_BURST.limit({ key: id })).success) return fail(429, 'limited');
        if ((await env.DB.prepare('SELECT 1 AS found FROM "user" WHERE id = ?').bind(id).first()) === null) return fail(401, 'gone');
      }
    }
    return fail(401, 'auth');
  }
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
    const mismatch = accountGuard(req.account, user);
    if (mismatch) return mismatch;
    const started = deps.now();
    // O tipo do stub (RPC) não acompanha `data: unknown`; o objeto que volta é o SyncResponse do Durable Object.
    const res = (await account.syncBatch(user.id, req, started)) as unknown as SyncResponse | 'deleted';
    if (res === 'deleted') return fail(401, 'auth'); // a conta foi apagada: o aparelho sai, como numa sessão revogada
    const deferred = res.deferred ?? 0; // o resto do lote que o orçamento do dia deixou para amanhã
    const unread: Record<string, number> = res.readsDeferred ? { unread: 1 } : {}; // o orçamento de leituras do dia acabou: nada foi lido
    log({ evt: 'sync', user: user.id, pushed: req.changes.length, rejected: res.rejected.length, deferred, pulled: res.changes.length, ...unread, ms: deps.now() - started });
    return json(res);
  }

  // A cópia do dia tirada na hora, só para o ponta a ponta local (a de verdade sai no alarme do dia), para a conta da sessão: `ok` diz se
  // uma cópia nova foi gravada.
  if (path === '/api/__e2e/snapshot' && request.method === 'POST') {
    if (!e2eOn(url, env)) return fail(404, 'not-found'); // a conferência de cima já barra; esta não depende dela
    const guard = writeGuard(request, env);
    if (guard) return guard;
    return json({ ok: await account.snapshot(deps.now()) });
  }

  // As cópias na nuvem (spec 8.3). Listar e restaurar passam pela mesma rajada do sync: cada pedido custa operações no R2. A lista vem do
  // objeto da conta, que a guarda por alguns minutos e só lista o R2 com operação no mês; sem ela e sem lista guardada, 503.
  if (path === '/api/snapshots' && request.method === 'GET') {
    const mismatch = accountGuard(request.headers.get(ACCOUNT_HEADER), user);
    if (mismatch) return mismatch;
    if (!(await env.API_BURST.limit({ key: user.id })).success) return fail(429, 'limited');
    const copies = await account.listCopies(deps.now());
    if (copies === 'deleted') return fail(401, 'auth');
    if (copies === 'r2-budget') return fail(503, 'r2-budget');
    return json(copies);
  }

  const restore = /^\/api\/snapshots\/([^/]+)\/restore$/.exec(path);
  if (restore && request.method === 'POST') {
    const guard = writeGuard(request, env);
    if (guard) return guard;
    const name = copyName(restore[1]);
    if (name === null) return fail(400, 'bad-name');
    const mismatch = accountGuard(request.headers.get(ACCOUNT_HEADER), user);
    if (mismatch) return mismatch;
    if (!(await env.API_BURST.limit({ key: user.id })).success) return fail(429, 'limited');
    // O app de antes manda {}: só `device: true` liga a resposta pelo aparelho. Um corpo que falta ou não se lê é o pedido de antes, e
    // nunca recebe o 200 que aquele app não entende (Review Focus 1 das cópias grandes).
    const body = await readJson(request);
    const device = !(body instanceof Response) && isRec(body) && body.device === true;
    const started = deps.now();
    const outcome = await account.restoreSnapshot(name, started, device);
    // O tempo de relógio (`ms`): a restauração roda dentro de blockConcurrencyWhile (30 s), e o portão do README o confere no `wrangler tail`.
    log({ evt: 'restore', user: user.id, ...(typeof outcome === 'object' ? { outcome: 'device', parts: outcome.parts } : { outcome }), ms: deps.now() - started });
    if (outcome === 'deleted') return fail(401, 'auth');
    if (outcome === 'ok') return new Response(null, { status: 204 });
    if (typeof outcome === 'object') return json({ restore: 'device', parts: outcome.parts });
    return outcome === 'not-found' ? fail(404, 'not-found') : fail(REFUSAL_STATUS[outcome], outcome);
  }

  // A cópia que restaura no aparelho (spec das cópias grandes, seção 5), um objeto por pedido: o 0 é o da cópia (o arquivo só ou o
  // manifesto), e 1 a N, as partes. O gzip sai como está no R2; o app o abre. A mesma rajada das outras rotas das cópias: cada pedido custa
  // uma operação B.
  const part = /^\/api\/snapshots\/([^/]+)\/parts\/(\d{1,3})$/.exec(path);
  if (part && request.method === 'GET') {
    const name = copyName(part[1]);
    if (name === null) return fail(400, 'bad-name');
    const mismatch = accountGuard(request.headers.get(ACCOUNT_HEADER), user);
    if (mismatch) return mismatch;
    if (!(await env.API_BURST.limit({ key: user.id })).success) return fail(429, 'limited');
    const got = await account.copyPart(name, Number(part[2]), deps.now());
    if (got === 'deleted') return fail(401, 'auth');
    if (got === 'not-found') return fail(404, 'not-found');
    if (got === 'restore-limit' || got === 'r2-budget') return fail(REFUSAL_STATUS[got], got);
    return new Response(got, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' } });
  }

  // Apagar a conta (spec 7.7): o e-mail digitado confirma; somem na hora o objeto da conta, as cópias no R2 e as linhas no D1, com os
  // códigos pendentes e os pedidos de código do e-mail. O objeto vai primeiro e fica marcado como apagado: dali em diante ele recusa
  // tudo (401), mesmo com a sessão ainda aberta, e só fica pronto depois da cópia em andamento, que então entra na lista do R2. O D1 vai
  // por último: se algo falhar no meio, a sessão continua e o mesmo pedido refaz tudo (cada passo pode rodar de novo).
  if (path === '/api/account' && request.method === 'DELETE') {
    const guard = writeGuard(request, env);
    if (guard) return guard;
    const mismatch = accountGuard(request.headers.get(ACCOUNT_HEADER), user);
    if (mismatch) return mismatch;
    const body = await readJson(request);
    if (body instanceof Response) return body;
    const email = user.email.trim().toLowerCase();
    const typed = isRec(body) && typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (typed !== email) return fail(400, 'confirm');
    await account.wipe();
    await deleteCopies(env, user.id, deps.now());
    await env.DB.batch([
      env.DB.prepare('DELETE FROM passkey WHERE userId = ?').bind(user.id),
      env.DB.prepare('DELETE FROM session WHERE userId = ?').bind(user.id),
      env.DB.prepare('DELETE FROM account WHERE userId = ?').bind(user.id),
      env.DB.prepare(PENDING_CODES).bind(email),
      env.DB.prepare('DELETE FROM otp_requests WHERE key = ?').bind(await emailKeyOf(email, env.BETTER_AUTH_SECRET)),
      env.DB.prepare('DELETE FROM "user" WHERE id = ?').bind(user.id),
    ]);
    log({ evt: 'account-deleted', user: user.id });
    return new Response(null, { status: 204 });
  }

  return fail(404, 'not-found');
}
