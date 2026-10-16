// Abuso no pedido de código (spec 7.5): o Turnstile, uma rajada por IP (binding de rate limiting) e os limites por hora no D1: 5 códigos por
// e-mail e 20 pedidos por IP. As respostas não dizem se o e-mail tem conta, e os logs levam só códigos fixos: nem o e-mail, nem o IP
// (spec 8.5).
import { CAPTCHA_HEADER } from '../src/core/sync/types';
import type { Env } from './env';
import type { FetchLike } from './mail';

export const CODES_PER_EMAIL_HOUR = 5;
export const CODES_PER_IP_HOUR = 20;
const HOUR = 3_600_000;

export type VerifyCaptcha = (token: string, ip: string) => Promise<boolean>;

// O token de teste do Turnstile: o ponta a ponta local (E2E_MAILBOX) o aceita sem falar com a Cloudflare.
export const E2E_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX';

const log = (entry: Record<string, string>): void => console.log(JSON.stringify(entry));
const ipOf = (request: Request): string => request.headers.get('cf-connecting-ip') ?? 'sem-ip';

function limited(route: string, by: 'burst' | 'email' | 'ip'): Response {
  log({ evt: 'limited', route, by });
  return Response.json({ code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' }, { status: 429 });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// A chave do e-mail no D1: um hash, nunca o endereço. Apagar a conta (spec 7.7) também tira os pedidos de código do e-mail.
export async function emailKeyOf(email: string): Promise<string> {
  return `e:${await sha256(email.trim().toLowerCase())}`;
}

// null: pode seguir para o Better Auth. Sem o Turnstile, nada é contado.
export async function guardSendCode(request: Request, env: Env, deps: { now: () => number; verifyCaptcha: VerifyCaptcha }): Promise<Response | null> {
  const ip = ipOf(request);
  if (!(await env.OTP_BURST.limit({ key: `ip:${ip}` })).success) return limited('send-code', 'burst');
  let email = '';
  try {
    const body = (await request.clone().json()) as { email?: unknown };
    email = typeof body.email === 'string' ? body.email : '';
  } catch {
    return Response.json({ code: 'BAD_REQUEST' }, { status: 400 });
  }
  const token = request.headers.get(CAPTCHA_HEADER) ?? '';
  if (token === '' || !(await deps.verifyCaptcha(token, ip))) {
    log({ evt: 'captcha-refused' });
    return Response.json({ code: 'CAPTCHA', message: 'Confirme que você é uma pessoa.' }, { status: 403 });
  }
  const now = deps.now();
  const since = now - HOUR;
  const emailKey = await emailKeyOf(email);
  const ipKey = `i:${ip}`;
  const [, byEmail, byIp] = await env.DB.batch<{ n: number }>([
    env.DB.prepare('DELETE FROM otp_requests WHERE at < ?').bind(since),
    env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ? AND at >= ?').bind(emailKey, since),
    env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ? AND at >= ?').bind(ipKey, since),
  ]);
  if ((byEmail.results[0]?.n ?? 0) >= CODES_PER_EMAIL_HOUR) return limited('send-code', 'email');
  if ((byIp.results[0]?.n ?? 0) >= CODES_PER_IP_HOUR) return limited('send-code', 'ip');
  await env.DB.batch([
    env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind(emailKey, now),
    env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind(ipKey, now),
  ]);
  return null;
}

// As opções da passkey, sem sessão, gravam um desafio no D1 a cada pedido: a mesma rajada por IP, numa chave própria (não gasta a do
// código).
export async function guardPasskeyOptions(request: Request, env: Env): Promise<Response | null> {
  return (await env.OTP_BURST.limit({ key: `passkey:${ipOf(request)}` })).success ? null : limited('passkey-options', 'burst');
}

// A verificação do Turnstile no servidor: o token vale uma vez e por 5 minutos. Sem resposta clara da Cloudflare, recusa.
export function turnstileVerifier(secret: string, fetcher: FetchLike = (i, o) => fetch(i, o)): VerifyCaptcha {
  return async (token, ip) => {
    try {
      const res = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
      });
      if (!res.ok) return false;
      return ((await res.json()) as { success?: unknown }).success === true;
    } catch {
      return false;
    }
  };
}
