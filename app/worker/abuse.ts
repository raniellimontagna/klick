// Abuso no pedido de código (spec 7.5): o Turnstile, uma rajada por IP (binding de rate limiting), os limites por hora no D1 (5 códigos por
// e-mail e 20 pedidos por IP) e, por último, o teto de e-mails do dia e do mês (spec 4.3, worker/budget.ts), abaixo do grátis do Resend. O IP conta por balde: o endereço IPv4, ou o /64 do IPv6 (quem tem um /64 tem 2^64 endereços). As respostas
// não dizem se o e-mail tem conta, e os logs levam só códigos fixos: nem o e-mail, nem o IP (spec 8.5).
import { CAPTCHA_HEADER } from '../src/core/sync/types';
import { releaseMail, reserveMail } from './budget';
import type { Env } from './env';
import { capOf, utcDay } from './limits';
import type { FetchLike } from './mail';

export const CODES_PER_EMAIL_HOUR = 5;
export const CODES_PER_IP_HOUR = 20;
// A parte de um requisitante no teto de e-mails do dia (a auditoria de segurança, NV-2): um quinto do dia, e nunca menos que
// MAIL_SHARE_MIN (no beta, o dia inteiro). O requisitante é o IPv4, ou o /48 do IPv6 (um /64 por pessoa sai barato: quem tem um /48 tem 65
// mil deles). Um IPv4 dividido (CGNAT, Wi-Fi público) divide a parte: na raiz, 16 códigos por dia por IP, contra os 20 por hora de antes.
export const MAIL_SHARE_MIN = 10;
export const mailShareOf = (mailDay: number): number => Math.max(MAIL_SHARE_MIN, Math.ceil(mailDay / 5));
const HOUR = 3_600_000;

export type VerifyCaptcha = (token: string, ip: string) => Promise<boolean>;

// O token de teste do Turnstile: o ponta a ponta local (E2E_MAILBOX) o aceita sem falar com a Cloudflare.
export const E2E_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const log = (entry: Record<string, unknown>): void => console.log(JSON.stringify(entry));
const ipOf = (request: Request): string => request.headers.get('cf-connecting-ip') ?? 'sem-ip';

function limited(route: string, by: 'burst' | 'email' | 'ip' | 'share'): Response {
  log({ evt: 'limited', route, by });
  return Response.json({ code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' }, { status: 429 });
}

// O balde de um IP: o IPv4 como veio; do IPv6, os quatro primeiros grupos (o /64), com o :: expandido. Um IPv4 mapeado (::ffff:a.b.c.d)
// volta a ser IPv4. O que não se lê como IPv6 fica como veio (o cf-connecting-ip vem da Cloudflare, não de quem pede).
export function ipBucket(ip: string, v6Prefix: 64 | 48 = 64): string {
  const raw = ip.trim().toLowerCase().split('%')[0];
  if (!raw.includes(':')) return raw;
  let text = raw;
  const v4 = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(text);
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    if ([a, b, c, d].some((n) => n > 255)) return raw;
    text = `${text.slice(0, v4.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return raw;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return raw;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return raw;
  const n = groups.map((g) => Number.parseInt(g, 16));
  if (n.slice(0, 5).every((x) => x === 0) && n[5] === 0xffff) return `${n[6] >> 8}.${n[6] & 255}.${n[7] >> 8}.${n[7] & 255}`;
  const keep = v6Prefix / 16;
  return `${n.slice(0, keep).map((x) => x.toString(16)).join(':')}::/${v6Prefix}`;
}

// As chaves no D1 são HMAC-SHA-256 com uma chave derivada (HKDF, info 'otp-limits') do BETTER_AUTH_SECRET: sem o segredo, nem o e-mail
// nem o IP saem dali (um hash simples de e-mail se desfaz por dicionário). A chave derivada fica guardada enquanto o isolate vive.
let derived: { secret: string; key: Promise<CryptoKey> } | undefined;
function limitsKey(secret: string): Promise<CryptoKey> {
  if (typeof secret !== 'string' || secret.length < 32) return Promise.reject(new Error('auth-secret-missing'));
  if (derived?.secret !== secret) {
    const utf8 = new TextEncoder();
    const key = crypto.subtle
      .importKey('raw', utf8.encode(secret), 'HKDF', false, ['deriveKey'])
      .then((base) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: utf8.encode('otp-limits') },
          base,
          { name: 'HMAC', hash: 'SHA-256', length: 256 },
          false,
          ['sign'],
        ),
      );
    derived = { secret, key };
  }
  return derived.key;
}

async function hmac(secret: string, text: string): Promise<string> {
  const mac = await crypto.subtle.sign('HMAC', await limitsKey(secret), new TextEncoder().encode(text));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A chave do e-mail no D1. Apagar a conta (spec 7.7) também tira os pedidos de código do e-mail.
export async function emailKeyOf(email: string, secret: string): Promise<string> {
  return `e:${await hmac(secret, email.trim().toLowerCase())}`;
}

// A chave do balde do IP no D1.
export async function ipKeyOf(ip: string, secret: string): Promise<string> {
  return `i:${await hmac(secret, ipBucket(ip))}`;
}

// O que passou da hora sai no pedido do código (dentro do lote) e na limpeza diária do Worker (o Cron Trigger, worker/index.ts; spec 10):
// sem novos pedidos, e sem nenhuma conta, as linhas não ficam paradas no D1. Apagar é global e idempotente.
const FORGET = 'DELETE FROM otp_requests WHERE at <= ?';
// Os códigos vencidos, junto (spec 10). O Better Auth só apaga as linhas vencidas de verification quando alguém digita um código: um código
// pedido e nunca usado, também de quem nunca cria conta, deixaria "sign-in-otp-<e-mail>" no D1. Saem todas as linhas vencidas, como na
// limpeza do próprio Better Auth (expiresAt < agora, sem olhar o identificador): depois de vencer, nenhuma vale mais, nem o desafio de uma
// passkey. O adaptador grava as datas como texto ISO em UTC (toISOString), que se compara como texto.
const FORGET_CODES = 'DELETE FROM verification WHERE expiresAt < ?';
// As partes dos requisitantes no teto de e-mails (mail_sent, `i:<dia>:...`) de dias passados, junto.
const FORGET_SHARES = "DELETE FROM mail_sent WHERE period LIKE 'i:%' AND period < ?";
const forgetStatements = (db: D1Database, now: number): D1PreparedStatement[] => [
  db.prepare(FORGET).bind(now - HOUR),
  db.prepare(FORGET_CODES).bind(new Date(now).toISOString()),
  db.prepare(FORGET_SHARES).bind(`i:${utcDay(now)}`),
];
export async function forgetExpired(db: D1Database, now: number): Promise<void> {
  await db.batch(forgetStatements(db, now));
}

// As duas linhas (e-mail e IP) entram juntas, ou nenhuma: como o SELECT lê a própria tabela, o SQLite o termina antes de inserir.
const COUNT = 'SELECT count(*) FROM otp_requests WHERE key = ?1 AND at > ?3';
const COUNT_IP = 'SELECT count(*) FROM otp_requests WHERE key = ?2 AND at > ?3';
const COUNTS = `SELECT (${COUNT}) AS byEmail, (${COUNT_IP}) AS byIp`;
const INSERT = `INSERT INTO otp_requests (key, at) SELECT k, ?4 FROM (SELECT ?1 AS k UNION ALL SELECT ?2)
  WHERE (${COUNT}) < ?5 AND (${COUNT_IP}) < ?6`;

// O endereço que o Better Auth aceitaria (o z.email dele, por cima): o torto sai aqui, antes de gastar o Turnstile, as linhas da hora e o
// teto de e-mails (a auditoria de segurança, NV-2: o pedido que nada envia gastava o teto do dia).
const EMAIL_SHAPE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
export const emailShapeOk = (email: string): boolean => email.length <= 254 && EMAIL_SHAPE.test(email.trim());

// A chave da parte de um requisitante no teto de e-mails (o IPv4 ou o /48), como as do D1: HMAC, sem o IP em claro.
export async function mailShareKey(ip: string, secret: string): Promise<string> {
  return hmac(secret, `share|${ipBucket(ip, 48)}`);
}

// O que o guarda deixa seguir para o Better Auth: `release` devolve o e-mail reservado quando ele recusa o pedido (router.ts).
export interface SendGrant {
  release: () => Promise<void>;
}
const NOTHING_RESERVED: SendGrant = { release: async () => undefined };

// Uma Response: barrado. Senão, pode seguir para o Better Auth. Sem o Turnstile, nada é contado. Apagar o que passou da hora (e os códigos vencidos), contar e gravar
// vão num lote só, que o D1 roda como uma transação: uma onda de pedidos em paralelo não passa dos limites. A janela é de uma hora exata.
export async function guardSendCode(request: Request, env: Env, deps: { now: () => number; verifyCaptcha: VerifyCaptcha }): Promise<Response | SendGrant> {
  const ip = ipOf(request);
  if (!(await env.OTP_BURST.limit({ key: `ip:${ipBucket(ip)}` })).success) return limited('send-code', 'burst');
  let email = '';
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email : '';
  } catch {
    return Response.json({ code: 'BAD_REQUEST' }, { status: 400 });
  }
  if (!emailShapeOk(email)) return Response.json({ code: 'INVALID_EMAIL', message: 'E-mail inválido.' }, { status: 400 });
  const token = request.headers.get(CAPTCHA_HEADER) ?? '';
  if (token === '' || !(await deps.verifyCaptcha(token, ip))) {
    log({ evt: 'captcha-refused' });
    return Response.json({ code: 'CAPTCHA', message: 'Confirme que você é uma pessoa.' }, { status: 403 });
  }
  const now = deps.now();
  const since = now - HOUR;
  const [emailKey, ipKey] = [await emailKeyOf(email, env.BETTER_AUTH_SECRET), await ipKeyOf(ip, env.BETTER_AUTH_SECRET)];
  const [, , , before, inserted] = await env.DB.batch<{ byEmail: number; byIp: number }>([
    ...forgetStatements(env.DB, now),
    env.DB.prepare(COUNTS).bind(emailKey, ipKey, since),
    env.DB.prepare(INSERT).bind(emailKey, ipKey, since, now, CODES_PER_EMAIL_HOUR, CODES_PER_IP_HOUR),
  ]);
  if (inserted.meta.changes === 0) return limited('send-code', (before.results[0]?.byEmail ?? 0) >= CODES_PER_EMAIL_HOUR ? 'email' : 'ip');
  // O teto de e-mails vem depois da linha da hora: um pedido barrado ali não gasta o teto. Na caixa local do ponta a ponta nada sai de
  // verdade, então nada conta. Um teto torto vale 0 (limits.ts): nenhum código sai.
  if (env.E2E_MAILBOX === 'true') return NOTHING_RESERVED;
  const mailDay = capOf(env, 'MAIL_PER_DAY');
  const share = { key: await mailShareKey(ip, env.BETTER_AUTH_SECRET), cap: mailShareOf(mailDay) };
  if (await reserveMail(env.DB, now, { mailDay, mailMonth: capOf(env, 'MAIL_PER_MONTH') }, share)) {
    return { release: () => releaseMail(env.DB, now, share.key) };
  }
  const mine = await env.DB.prepare('SELECT count FROM mail_sent WHERE period = ?').bind(`i:${utcDay(now)}:${share.key}`).first<{ count: number }>();
  if ((mine?.count ?? 0) >= share.cap) return limited('send-code', 'share');
  log({ evt: 'limited', route: 'send-code', by: 'mail-cap' });
  return Response.json({ code: 'MAIL_CAP', message: 'Muitos pedidos de código hoje. Tente de novo amanhã.' }, { status: 429 });
}

// O código fica preso ao aparelho que o pediu (a auditoria de segurança, NV-1). As 5 tentativas de um código são do e-mail, não de quem
// tenta: sem isso, qualquer um que soubesse o e-mail mandava 5 palpites errados e queimava o código que a pessoa esperava. O pedido do
// código que dá certo leva o cookie OTP_BIND_COOKIE (um número aleatório e o HMAC dele com o e-mail, como as chaves do D1); conferir o
// código sem ele, ou com o de outro e-mail, volta 403 antes do Better Auth, sem gastar tentativa. Quem quisesse queimar o código teria de
// pedir um código para o e-mail, com o Turnstile e os limites de cima, e a pessoa recebe esse código.
export const OTP_BIND_COOKIE = 'klick-otp';
const OTP_BIND_SECONDS = 600; // o código vale 10 minutos (auth.ts)

const bindMac = (secret: string, email: string, nonce: string): Promise<string> => hmac(secret, `bind|${email.trim().toLowerCase()}|${nonce}`);

export async function otpBindCookie(email: string, secret: string, secure: boolean): Promise<string> {
  const nonce = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const value = `${nonce}.${await bindMac(secret, email, nonce)}`;
  return `${OTP_BIND_COOKIE}=${value}; Path=/api/auth; Max-Age=${OTP_BIND_SECONDS}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
}

function cookieOf(request: Request, name: string): string | null {
  for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return null;
}

// Compara sem parar no primeiro caractere diferente.
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// null: pode seguir para o Better Auth.
export async function guardVerifyCode(request: Request, env: Env): Promise<Response | null> {
  let email = '';
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email : '';
  } catch {
    return Response.json({ code: 'BAD_REQUEST' }, { status: 400 });
  }
  const [nonce, mac] = (cookieOf(request, OTP_BIND_COOKIE) ?? '').split('.');
  if (nonce && mac && sameText(mac, await bindMac(env.BETTER_AUTH_SECRET, email, nonce))) return null;
  log({ evt: 'limited', route: 'verify-code', by: 'device' });
  return Response.json({ code: 'OTP_DEVICE', message: 'Peça um código novo neste aparelho.' }, { status: 403 });
}

// As opções da passkey, sem sessão, gravam um desafio no D1 a cada pedido: a mesma rajada por balde de IP, numa chave própria (não gasta
// a do código).
export async function guardPasskeyOptions(request: Request, env: Env): Promise<Response | null> {
  return (await env.OTP_BURST.limit({ key: `passkey:${ipBucket(ipOf(request))}` })).success ? null : limited('passkey-options', 'burst');
}

// Os motivos que a Cloudflare dá para recusar um token: só estes vão para o log; o resto vira 'other'.
const TURNSTILE_CODES = new Set([
  'missing-input-secret',
  'invalid-input-secret',
  'missing-input-response',
  'invalid-input-response',
  'bad-request',
  'timeout-or-duplicate',
  'internal-error',
]);

// A verificação do Turnstile no servidor: o token vale uma vez e por 5 minutos, e só no hostname deste ambiente (um token resolvido no
// beta não vale na raiz). Sem resposta clara da Cloudflare, recusa. O log diz o motivo (um segredo errado não é um robô), nunca o token,
// o IP ou o hostname.
export function turnstileVerifier(secret: string, hostname: string, fetcher: FetchLike = (i, o) => fetch(i, o)): VerifyCaptcha {
  const failed = (codes: string[], extra: Record<string, unknown> = {}): false => {
    log({ evt: 'turnstile-failed', codes, ...extra });
    return false;
  };
  return async (token, ip) => {
    let body: { success?: unknown; hostname?: unknown; 'error-codes'?: unknown } | null;
    try {
      const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
      });
      if (!res.ok) return failed(['http-error'], { status: res.status });
      body = (await res.json()) as typeof body;
    } catch {
      return failed(['fetch-failed']);
    }
    if (body?.success !== true) {
      const reported = Array.isArray(body?.['error-codes']) ? (body['error-codes'] as unknown[]) : [];
      return failed(reported.map((c) => (typeof c === 'string' && TURNSTILE_CODES.has(c) ? c : 'other')));
    }
    return body.hostname === hostname ? true : failed(['hostname-mismatch']);
  };
}
