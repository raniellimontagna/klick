import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import {
  CODES_PER_EMAIL_HOUR,
  CODES_PER_IP_HOUR,
  E2E_TOKEN,
  emailKeyOf,
  guardSendCode,
  ipBucket,
  ipKeyOf,
  turnstileVerifier,
} from '../../worker/abuse';
import { codeEmail, resendMailer } from '../../worker/mail';
import { defaultDeps } from '../../worker/router';
import { authDeps, call, captchaOk, ORIGIN, postJson, signIn, T0, testDeps, testEnv } from './helpers';

let now = T0;
const deps = { now: () => now, verifyCaptcha: captchaOk };
const ask = (email: string, ip: string, token = 'ok') =>
  new Request(`${ORIGIN}/api/auth/email-otp/send-verification-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': ip, 'x-turnstile-token': token },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
const SECRET = testEnv().BETTER_AUTH_SECRET;
const countKey = async (key: string) =>
  (await env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ?').bind(key).first<{ n: number }>())?.n;
// Uma rajada que sempre deixa passar e anota as chaves.
const spyBurst = (keys: string[]): RateLimit => ({
  limit: async ({ key }) => {
    keys.push(key);
    return { success: true };
  },
});

describe('abuso no pedido de código (spec 7.5)', () => {
  it(`${CODES_PER_EMAIL_HOUR} códigos por e-mail por hora; depois de uma hora, libera`, async () => {
    for (let i = 0; i < CODES_PER_EMAIL_HOUR; i++) expect(await guardSendCode(ask('limite@exemplo.com', `10.0.0.${i}`), testEnv(), deps)).toBeNull();
    const blocked = await guardSendCode(ask(' Limite@Exemplo.com ', '10.0.1.1'), testEnv(), deps);
    expect(blocked?.status).toBe(429);
    now += 3_599_999; // a janela é de uma hora exata: 1 ms antes, ainda conta
    expect((await guardSendCode(ask('limite@exemplo.com', '10.0.1.1'), testEnv(), deps))?.status).toBe(429);
    now += 1;
    expect(await guardSendCode(ask('limite@exemplo.com', '10.0.1.1'), testEnv(), deps)).toBeNull();
  });

  it(`${CODES_PER_IP_HOUR} pedidos por IP por hora, com e-mails diferentes`, async () => {
    for (let i = 0; i < CODES_PER_IP_HOUR; i++) expect(await guardSendCode(ask(`p${i}@exemplo.com`, '10.9.9.9'), testEnv(), deps)).toBeNull();
    expect((await guardSendCode(ask('mais-um@exemplo.com', '10.9.9.9'), testEnv(), deps))?.status).toBe(429);
    now += 3_599_999;
    expect((await guardSendCode(ask('mais-dois@exemplo.com', '10.9.9.9'), testEnv(), deps))?.status).toBe(429);
    now += 1;
    expect(await guardSendCode(ask('mais-dois@exemplo.com', '10.9.9.9'), testEnv(), deps)).toBeNull();
  });

  it('uma onda de pedidos em paralelo não passa dos limites: contar e gravar é uma transação só', async () => {
    const byEmail = await Promise.all(Array.from({ length: 12 }, (_, i) => guardSendCode(ask('onda@exemplo.com', `10.20.0.${i}`), testEnv(), deps)));
    expect(byEmail.filter((r) => r === null)).toHaveLength(CODES_PER_EMAIL_HOUR);
    expect(byEmail.filter((r) => r?.status === 429)).toHaveLength(12 - CODES_PER_EMAIL_HOUR);
    expect(await countKey(await emailKeyOf('onda@exemplo.com', SECRET))).toBe(CODES_PER_EMAIL_HOUR);
    const byIp = await Promise.all(Array.from({ length: 30 }, (_, i) => guardSendCode(ask(`onda-${i}@exemplo.com`, '10.21.0.1'), testEnv(), deps)));
    expect(byIp.filter((r) => r === null)).toHaveLength(CODES_PER_IP_HOUR);
    expect(await countKey(await ipKeyOf('10.21.0.1', SECRET))).toBe(CODES_PER_IP_HOUR);
  });

  it('a resposta do limite não diz se o e-mail tem conta', async () => {
    const blocked = await guardSendCode(ask('x@exemplo.com', '10.8.8.8'), testEnv({ OTP_BURST: { limit: async () => ({ success: false }) } }), deps);
    expect(blocked?.status).toBe(429);
    expect(await blocked?.json()).toEqual({ code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' });
  });

  it('sem o token do Turnstile, ou com um token recusado, 403 e nada é contado', async () => {
    expect((await guardSendCode(ask('t@exemplo.com', '10.7.7.7', ''), testEnv(), deps))?.status).toBe(403);
    expect((await guardSendCode(ask('t@exemplo.com', '10.7.7.7', 'recusado'), testEnv(), deps))?.status).toBe(403);
    expect(await countKey(await ipKeyOf('10.7.7.7', SECRET))).toBe(0);
    expect(await countKey(await emailKeyOf('t@exemplo.com', SECRET))).toBe(0);
  });

  it('a rota passa pelo guarda antes do Better Auth', async () => {
    const res = await call('/api/auth/email-otp/send-verification-otp', postJson({ email: 'g@exemplo.com', type: 'sign-in' }), { deps: testDeps() });
    expect(res.status).toBe(403); // sem o cabeçalho do token
  });

  it('o e-mail no D1 é um hash, nunca o endereço', async () => {
    await guardSendCode(ask('privado@exemplo.com', '10.6.6.6'), testEnv(), deps);
    const keys = await env.DB.prepare('SELECT key FROM otp_requests').all<{ key: string }>();
    expect(keys.results.some((r) => r.key.includes('privado'))).toBe(false);
  });

  it('no D1, o e-mail e o IP são HMAC com uma chave derivada do segredo: nem o endereço, nem o IP, e outro segredo dá outra chave', async () => {
    await guardSendCode(ask('reservado@exemplo.com', '10.6.6.7'), testEnv(), deps);
    const keys = (await env.DB.prepare('SELECT key FROM otp_requests').all<{ key: string }>()).results.map((r) => r.key);
    const [emailKey, ipKey] = [await emailKeyOf(' Reservado@Exemplo.com ', SECRET), await ipKeyOf('10.6.6.7', SECRET)];
    expect(keys).toEqual(expect.arrayContaining([emailKey, ipKey]));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('reservado@exemplo.com')));
    const unkeyed = [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
    for (const key of keys) for (const clear of ['reservado', '10.6.6.7', unkeyed]) expect(key).not.toContain(clear);
    const other = 'outro-segredo-so-dos-testes-0123456789';
    expect(await emailKeyOf('reservado@exemplo.com', other)).not.toBe(emailKey);
    expect(await ipKeyOf('10.6.6.7', other)).not.toBe(ipKey);
    await expect(emailKeyOf('reservado@exemplo.com', 'curto')).rejects.toThrow();
  });
});

describe('o balde do IP: IPv6 por /64 (spec 7.5)', () => {
  it('IPv4 fica como veio; IPv6 guarda os quatro primeiros grupos, com o :: expandido; IPv4 mapeado volta a ser IPv4', () => {
    expect(ipBucket('203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('2001:db8:aa:bb:1:2:3:4')).toBe('2001:db8:aa:bb::/64');
    expect(ipBucket('2001:0DB8:00AA:00bb:ffff:0:0:1')).toBe('2001:db8:aa:bb::/64');
    expect(ipBucket('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipBucket('2001:db8:aa::bb')).toBe('2001:db8:aa:0::/64');
    expect(ipBucket('2001:db8:aa:bb::')).toBe('2001:db8:aa:bb::/64');
    expect(ipBucket('::1')).toBe('0:0:0:0::/64');
    expect(ipBucket('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipBucket('::ffff:cb00:7107')).toBe('203.0.113.7');
    expect(ipBucket('2001:db8:aa:1::bb')).not.toBe(ipBucket('2001:db8:aa:2::bb'));
  });

  it('os endereços do mesmo /64 dividem o limite por IP e a rajada; outro /64, não', async () => {
    for (let i = 0; i < CODES_PER_IP_HOUR; i++) {
      expect(await guardSendCode(ask(`v6-${i}@exemplo.com`, `2001:db8:1:2::${i + 1}`), testEnv(), deps)).toBeNull();
    }
    expect((await guardSendCode(ask('v6-mais@exemplo.com', '2001:db8:1:2:ffff:ffff:ffff:ffff'), testEnv(), deps))?.status).toBe(429);
    expect(await guardSendCode(ask('v6-mais@exemplo.com', '2001:db8:1:3::1'), testEnv(), deps)).toBeNull();
    expect(await ipKeyOf('2001:db8:1:2::1', SECRET)).toBe(await ipKeyOf('2001:db8:1:2:abcd::9', SECRET));
    const keys: string[] = [];
    await guardSendCode(ask('v6-rajada@exemplo.com', '2001:db8:1:4::9'), testEnv({ OTP_BURST: spyBurst(keys) }), deps);
    expect(keys).toEqual(['ip:2001:db8:1:4::/64']);
  });
});

describe('Turnstile no servidor e envio pelo Resend', () => {
  it('a verificação manda o segredo, o token e o IP, e só passa com success: true', async () => {
    const seen: unknown[] = [];
    const host = 'beta.klick.ranimontagna.com';
    const verify = turnstileVerifier('segredo', host, async (url, init) => {
      seen.push([url, JSON.parse(String(init?.body))]);
      return Response.json({ success: true, hostname: host });
    });
    expect(await verify('tok', '1.2.3.4')).toBe(true);
    expect(seen).toEqual([['https://challenges.cloudflare.com/turnstile/v0/siteverify', { secret: 'segredo', response: 'tok', remoteip: '1.2.3.4' }]]);
    expect(await turnstileVerifier('s', host, async () => Response.json({ success: false }))('t', 'ip')).toBe(false);
    expect(await turnstileVerifier('s', host, async () => Promise.reject(new Error('rede')))('t', 'ip')).toBe(false);
  });

  it('um token de outro ambiente (hostname diferente) é recusado; os motivos vão para o log como códigos fixos', async () => {
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const answer = (body: unknown) => turnstileVerifier('s', 'klick.ranimontagna.com', async () => Response.json(body))('tok-secreto', '1.2.3.4');
      expect(await answer({ success: true, hostname: 'beta.klick.ranimontagna.com' })).toBe(false); // um token do beta na raiz
      expect(await answer({ success: true })).toBe(false);
      expect(await answer(null)).toBe(false); // uma resposta torta também recusa, sem derrubar o pedido
      expect(await answer({ success: true, hostname: 'klick.ranimontagna.com' })).toBe(true);
      expect(await answer({ success: false, 'error-codes': ['invalid-input-secret'] })).toBe(false); // o segredo errado, não um robô
      expect(await answer({ success: false, 'error-codes': ['timeout-or-duplicate', 'vaza@exemplo.com'] })).toBe(false);
      const logged = out.mock.calls.flat().map(String).join('\n');
      for (const code of ['turnstile-failed', 'hostname-mismatch', 'invalid-input-secret', 'timeout-or-duplicate', '"other"']) {
        expect(logged).toContain(code);
      }
      for (const secret of ['vaza@exemplo.com', '1.2.3.4', 'tok-secreto', 'beta.klick']) expect(logged).not.toContain(secret);
    } finally {
      out.mockRestore();
    }
  });

  it('o Resend recebe o remetente fixo, o texto e o HTML; um erro dele vira exceção sem o e-mail nem o código', async () => {
    let sent: { url: string; init?: RequestInit } | null = null;
    const mailer = resendMailer('re_teste', 'Klick <nao-responda@klick.ranimontagna.com>', async (url, init) => {
      sent = { url, init };
      return Response.json({ id: 'x' });
    });
    await mailer.sendCode('a@exemplo.com', '123456');
    expect(sent!.url).toBe('https://api.resend.com/emails');
    expect(new Headers(sent!.init?.headers).get('Authorization')).toBe('Bearer re_teste');
    const mail = codeEmail('123456');
    expect(JSON.parse(String(sent!.init?.body))).toEqual({ from: 'Klick <nao-responda@klick.ranimontagna.com>', to: ['a@exemplo.com'], subject: mail.subject, text: mail.text, html: mail.html });
    const failing = resendMailer('re_teste', 'x', async () => new Response('', { status: 422 }));
    await expect(failing.sendCode('a@exemplo.com', '123456')).rejects.toThrow('resend 422');
  });

  it('no ponta a ponta local, o token de teste passa sem falar com a Cloudflare', async () => {
    const deps = defaultDeps(testEnv({ E2E_MAILBOX: 'true' }));
    expect(await deps.verifyCaptcha(E2E_TOKEN, '127.0.0.1')).toBe(true);
    expect(await deps.verifyCaptcha('outro', '127.0.0.1')).toBe(false);
  });
});

describe('o guarda pela rota, sem denunciar nada (spec 7.5 e 8.5)', () => {
  const SEND = '/api/auth/email-otp/send-verification-otp';
  const askRoute = (email: string, ip: string, token?: string) =>
    postJson({ email, type: 'sign-in' }, { 'cf-connecting-ip': ip, ...(token === undefined ? {} : { 'x-turnstile-token': token }) });

  it('o Turnstile recusado tem resposta própria; o verificador recebe o token do cabeçalho e o IP', async () => {
    const seen: [string, string][] = [];
    const verifyCaptcha = async (token: string, ip: string) => {
      seen.push([token, ip]);
      return false;
    };
    const res = await call(SEND, askRoute('turnstile@exemplo.com', '10.5.0.1', 'tok-1'), { deps: testDeps({ verifyCaptcha }) });
    expect([res.status, await res.json()]).toEqual([403, { code: 'CAPTCHA', message: 'Confirme que você é uma pessoa.' }]);
    expect(seen).toEqual([['tok-1', '10.5.0.1']]);
  });

  it('o limite por hora responde igual para um e-mail com conta e sem conta', async () => {
    const d = authDeps();
    await signIn('com-conta@exemplo.com', d); // um código desta hora
    const send = (email: string, ip: string) => call(SEND, askRoute(email, ip, 'ok'), { deps: d });
    for (let i = 1; i < CODES_PER_EMAIL_HOUR; i++) expect((await send('com-conta@exemplo.com', `10.4.0.${i}`)).status).toBe(200);
    for (let i = 0; i < CODES_PER_EMAIL_HOUR; i++) expect((await send('sem-conta@exemplo.com', `10.4.1.${i}`)).status).toBe(200);
    const [a, b] = [await send('com-conta@exemplo.com', '10.4.2.1'), await send('sem-conta@exemplo.com', '10.4.2.2')];
    expect(a.status).toBe(429);
    expect([a.status, await a.text()]).toEqual([b.status, await b.text()]);
    expect(d.mailer.sent).toHaveLength(2 * CODES_PER_EMAIL_HOUR);
  });

  it('as opções da passkey, sem sessão, passam pela rajada por IP: no limite, 429 e nada é gravado no D1', async () => {
    const keys: string[] = [];
    const deny: RateLimit = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: false };
      },
    };
    const options = (e = testEnv()) =>
      call('/api/auth/passkey/generate-authenticate-options', { headers: { 'cf-connecting-ip': '10.2.0.1' } }, { env: e });
    const count = async () => (await env.DB.prepare('SELECT count(*) AS n FROM verification').first<{ n: number }>())?.n;
    const before = await count();
    const blocked = await options(testEnv({ OTP_BURST: deny }));
    expect([blocked.status, await blocked.json()]).toEqual([429, { code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' }]);
    expect(keys).toEqual(['passkey:10.2.0.1']);
    expect(await count()).toBe(before);
    expect((await options()).status).toBe(200);
    expect(await count()).toBe((before ?? 0) + 1);
    const v6: string[] = [];
    const v6Env = testEnv({ OTP_BURST: spyBurst(v6) });
    await call('/api/auth/passkey/generate-authenticate-options', { headers: { 'cf-connecting-ip': '2001:db8:9:9::1' } }, { env: v6Env });
    expect(v6).toEqual(['passkey:2001:db8:9:9::/64']);
  });

  it('os logs do guarda e do Resend levam só códigos fixos: nem o e-mail, nem o código, nem o IP', async () => {
    let code = '';
    const mailer = resendMailer('re_teste', 'x', async (_url, init) => {
      code = (JSON.parse(String(init?.body)) as { text: string }).text.match(/\d{6}/)![0];
      return new Response('{"message":"vaza@exemplo.com"}', { status: 422 });
    });
    const d = testDeps({ mailer });
    const send = (token: string, ip: string, e = testEnv()) => call(SEND, askRoute('vaza@exemplo.com', ip, token), { env: e, deps: d });
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await send('recusado', '10.1.0.1')).status).toBe(403);
      expect((await send('ok', '10.1.0.2', testEnv({ OTP_BURST: { limit: async () => ({ success: false }) } }))).status).toBe(429);
      for (let i = 0; i < CODES_PER_EMAIL_HOUR; i++) expect((await send('ok', `10.1.1.${i}`)).status).toBe(200);
      expect((await send('ok', '10.1.2.1')).status).toBe(429);
      const logged = [...out.mock.calls, ...err.mock.calls].flat().map(String).join('\n');
      expect(code).toMatch(/^\d{6}$/);
      for (const evt of ['captcha-refused', '"by":"burst"', '"by":"email"', 'mail-failed', 'ResendFailed', '"status":422']) {
        expect(logged).toContain(evt);
      }
      for (const secret of ['vaza@exemplo.com', code, '10.1.']) expect(logged).not.toContain(secret);
    } finally {
      out.mockRestore();
      err.mockRestore();
    }
  });
});
