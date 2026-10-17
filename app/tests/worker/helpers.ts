// Apoio dos testes do Worker: chama o router como o Worker chamaria, com o env do wrangler.jsonc (conta ligada) e as trocas de cada teste.
// Não é um arquivo de teste.
import { createExecutionContext, runInDurableObject, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { sessionUser } from '../../worker/auth';
import type { Env } from '../../worker/env';
import type { Mailer } from '../../worker/mail';
import { handle, type Deps } from '../../worker/router';

export const ORIGIN = 'https://beta.klick.ranimontagna.com';
export const T0 = 1_791_500_000_000;

// O limite de rajada sempre deixa passar nos testes (o binding do Miniflare conta de verdade); os testes de limite passam o deles.
export const allow: RateLimit = { limit: async () => ({ success: true }) };

// Os tetos de e-mail do wrangler.jsonc (10 por dia no beta) ficariam no caminho dos testes que pedem muitos códigos no mesmo dia (o relógio
// deles é fixo): aqui vão para um valor que nunca enche. Os testes do teto passam os deles.
export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, OTP_BURST: allow, MAIL_PER_DAY: '1000000', MAIL_PER_MONTH: '1000000', ...over };
}

// O Turnstile falso: o token 'ok' passa.
export const captchaOk = async (token: string): Promise<boolean> => token === 'ok';

// Um carteiro falso: guarda o que seria enviado.
export function fakeMailer(): Mailer & { sent: { email: string; code: string }[] } {
  const sent: { email: string; code: string }[] = [];
  return {
    sent,
    async sendCode(email, code) {
      sent.push({ email, code });
    },
  };
}

// `user`: quem tem sessão neste pedido, sem passar pelo login; null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return {
    now: () => T0,
    mailer: fakeMailer(),
    verifyCaptcha: captchaOk,
    resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null),
    ...rest,
  };
}

// Com o login de verdade (Better Auth no D1 local) e o carteiro falso.
export function authDeps(): Deps & { mailer: ReturnType<typeof fakeMailer> } {
  const mailer = fakeMailer();
  return { now: () => T0, mailer, verifyCaptcha: captchaOk, resolveUser: (request, e, ctx) => sessionUser(request, e, ctx, mailer) };
}

// Pede o código, entra com ele e devolve o cookie de sessão, pronto para o cabeçalho Cookie. Cada login vem de um IP próprio: os testes
// não dividem o limite de pedidos por IP por hora.
let signIns = 0;
export async function signIn(email: string, deps: ReturnType<typeof authDeps>): Promise<string> {
  const ip = `198.18.${(signIns >> 8) & 255}.${signIns++ & 255}`;
  const headers = { 'x-turnstile-token': 'ok', 'cf-connecting-ip': ip };
  const send = await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, headers), { deps });
  if (send.status !== 200) throw new Error(`pedir o código deu ${send.status}`);
  const code = deps.mailer.sent.at(-1)!.code;
  const res = await call('/api/auth/sign-in/email-otp', postJson({ email, otp: code }), { deps });
  if (res.status !== 200) throw new Error(`entrar deu ${res.status}`);
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
}

// O id da conta de um cookie (get-session): o `account` que o app manda no sync e nas outras rotas da conta (C1).
export async function accountOf(cookie: string, deps: Deps): Promise<string> {
  const res = await call('/api/auth/get-session', { headers: { Cookie: cookie } }, { deps });
  return ((await res.json()) as { user: { id: string } }).user.id;
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await handle(new Request(ORIGIN + path, init), o.env ?? testEnv(), ctx, o.deps ?? testDeps());
  await waitOnExecutionContext(ctx);
  return res;
}

// O objeto da conta de `user`, o mesmo que o router pega.
export const stubOf = (user: string) => env.ACCOUNT.get(env.ACCOUNT.idFromName(user));

// Uma chave da tabela `state` do objeto da conta (os contadores da cota, dos bytes e do orçamento do dia), gravada ou lida direto no
// SQLite dele: os testes partem de uma conta cheia sem gravar 100 mil registros. Um valor que não é texto vai como JSON.
export async function setState(user: string, key: string, value: unknown): Promise<void> {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  await runInDurableObject(stubOf(user), (_o, state) => {
    state.storage.sql.exec('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, text);
  });
}

export const stateOf = (user: string, key: string): Promise<string | null> =>
  runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ value: string }>('SELECT value FROM state WHERE key = ?', key).toArray()[0]?.value ?? null);

export const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
  body: JSON.stringify(body),
});
