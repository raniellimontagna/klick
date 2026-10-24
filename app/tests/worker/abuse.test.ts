import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import {
  CODES_PER_EMAIL_HOUR,
  CODES_PER_IP_HOUR,
  E2E_TOKEN,
  emailKeyOf,
  guardSendCode as guardSendCodeRaw,
  ipBucket,
  ipKeyOf,
  turnstileVerifier,
} from '../../worker/abuse';

// O guarda devolve a Response que barra, ou o que deixa seguir (com a devolução do e-mail): aqui, a Response ou null.
const guardSendCode = async (...args: Parameters<typeof guardSendCodeRaw>): Promise<Response | null> => {
  const result = await guardSendCodeRaw(...args);
  return result instanceof Response ? result : null;
};
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
    for (let i = 0; i < CODES_PER_EMAIL_HOUR; i++) expect(await guardSendCode(ask('limite@exemplo.com', `10.0.0.${i}`), testEnv(), deps)).not.toBeInstanceOf(Response);
    const blocked = await guardSendCode(ask(' Limite@Exemplo.com ', '10.0.1.1'), testEnv(), deps);
    expect(blocked?.status).toBe(429);
    now += 3_599_999; // a janela é de uma hora exata: 1 ms antes, ainda conta
    expect((await guardSendCode(ask('limite@exemplo.com', '10.0.1.1'), testEnv(), deps))?.status).toBe(429);
    now += 1;
    expect(await guardSendCode(ask('limite@exemplo.com', '10.0.1.1'), testEnv(), deps)).not.toBeInstanceOf(Response);
  });

  it(`${CODES_PER_IP_HOUR} pedidos por IP por hora, com e-mails diferentes`, async () => {
    for (let i = 0; i < CODES_PER_IP_HOUR; i++) expect(await guardSendCode(ask(`p${i}@exemplo.com`, '10.9.9.9'), testEnv(), deps)).not.toBeInstanceOf(Response);
    expect((await guardSendCode(ask('mais-um@exemplo.com', '10.9.9.9'), testEnv(), deps))?.status).toBe(429);
    now += 3_599_999;
    expect((await guardSendCode(ask('mais-dois@exemplo.com', '10.9.9.9'), testEnv(), deps))?.status).toBe(429);
    now += 1;
    expect(await guardSendCode(ask('mais-dois@exemplo.com', '10.9.9.9'), testEnv(), deps)).not.toBeInstanceOf(Response);
  });

  it('uma onda de pedidos em paralelo não passa dos limites: contar e gravar é uma transação só', async () => {
    const byEmail = await Promise.all(Array.from({ length: 12 }, (_, i) => guardSendCode(ask('onda@exemplo.com', `10.20.0.${i}`), testEnv(), deps)));
    expect(byEmail.filter((r) => !(r instanceof Response))).toHaveLength(CODES_PER_EMAIL_HOUR);
    expect(byEmail.filter((r) => r?.status === 429)).toHaveLength(12 - CODES_PER_EMAIL_HOUR);
    expect(await countKey(await emailKeyOf('onda@exemplo.com', SECRET))).toBe(CODES_PER_EMAIL_HOUR);
    const byIp = await Promise.all(Array.from({ length: 30 }, (_, i) => guardSendCode(ask(`onda-${i}@exemplo.com`, '10.21.0.1'), testEnv(), deps)));
    expect(byIp.filter((r) => !(r instanceof Response))).toHaveLength(CODES_PER_IP_HOUR);
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
      expect(await guardSendCode(ask(`v6-${i}@exemplo.com`, `2001:db8:1:2::${i + 1}`), testEnv(), deps)).not.toBeInstanceOf(Response);
    }
    expect((await guardSendCode(ask('v6-mais@exemplo.com', '2001:db8:1:2:ffff:ffff:ffff:ffff'), testEnv(), deps))?.status).toBe(429);
    expect(await guardSendCode(ask('v6-mais@exemplo.com', '2001:db8:1:3::1'), testEnv(), deps)).not.toBeInstanceOf(Response);
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

// Spec 10: o Better Auth só apaga as linhas vencidas de verification quando alguém digita um código. Um código pedido e nunca usado
// (também de quem nunca cria conta) deixaria "sign-in-otp-<e-mail>" no D1: a limpeza dos pedidos de código o tira depois de vencer.
describe('os códigos vencidos saem do D1 (spec 10)', () => {
  const SEND = '/api/auth/email-otp/send-verification-otp';
  const codeRow = (email: string) =>
    env.DB.prepare('SELECT expiresAt, typeof(expiresAt) AS kind FROM verification WHERE identifier = ?')
      .bind(`sign-in-otp-${email}`)
      .first<{ expiresAt: string; kind: string }>();

  it('um código pedido pela rota e nunca usado sai no pedido de código seguinte depois de vencer; antes de vencer, fica', async () => {
    const email = 'nunca-usado@exemplo.com';
    const send = await call(SEND, postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok', 'cf-connecting-ip': '198.51.100.7' }), {
      deps: authDeps(),
    });
    expect(send.status).toBe(200);
    // O formato que o adaptador do Better Auth grava no D1 (a data como texto ISO, em UTC): é ele que a limpeza compara.
    const row = await codeRow(email);
    expect(row?.kind).toBe('text');
    expect(row?.expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const expires = Date.parse(row!.expiresAt);
    expect(await guardSendCode(ask('outra-pessoa@exemplo.com', '198.51.100.8'), testEnv(), { now: () => expires - 1, verifyCaptcha: captchaOk })).not.toBeInstanceOf(Response);
    expect(await codeRow(email)).not.toBeNull();
    expect(await guardSendCode(ask('mais-uma@exemplo.com', '198.51.100.9'), testEnv(), { now: () => expires + 1, verifyCaptcha: captchaOk })).not.toBeInstanceOf(Response);
    expect(await codeRow(email)).toBeNull();
  });
});

// O teto de e-mails (spec 4.3 e 7.7): os códigos enviados no dia e no mês UTC ficam abaixo do grátis do Resend. Recusa com a mensagem
// própria, e só depois de passar pelo limite da hora: um pedido barrado ali não gasta o teto.
describe('o teto de e-mails por dia e por mês (spec 4.3)', () => {
  const SEND = '/api/auth/email-otp/send-verification-otp';
  const MAIL_CAP = { code: 'MAIL_CAP', message: 'Muitos pedidos de código hoje. Tente de novo amanhã.' };
  const midnight = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
  const request = (email: string, ip: string) => postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok', 'cf-connecting-ip': ip });
  const mailCount = async (period: string) => (await env.DB.prepare('SELECT count FROM mail_sent WHERE period = ?').bind(period).first<{ count: number }>())?.count ?? 0;
  // Pedidos de IPs e e-mails próprios, para só o teto de e-mails decidir.
  let n = 0;
  const ask1 = (d: ReturnType<typeof authDeps>, e: ReturnType<typeof testEnv>) => call(SEND, request(`teto-${n}@exemplo.com`, `198.19.${(n >> 8) & 255}.${n++ & 255}`), { env: e, deps: d });

  it('o teto do dia: o pedido além dele recebe 429 MAIL_CAP e nenhum código sai', async () => {
    const d = { ...authDeps(), now: () => midnight('2028-01-10') + 1_000 };
    const e = testEnv({ MAIL_PER_DAY: '2' });
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect((await ask1(d, e)).status).toBe(200);
      expect((await ask1(d, e)).status).toBe(200);
      const blocked = await ask1(d, e);
      expect([blocked.status, await blocked.json()]).toEqual([429, MAIL_CAP]);
      expect((await ask1(d, e)).status).toBe(429);
      expect(out.mock.calls.flat().map(String)).toContain(JSON.stringify({ evt: 'limited', route: 'send-code', by: 'mail-cap' }));
    } finally {
      out.mockRestore();
    }
    expect(d.mailer.sent).toHaveLength(2);
    expect(await mailCount('d:2028-01-10')).toBe(2);
  });

  it('o teto do mês vale com o dia livre', async () => {
    const e = testEnv({ MAIL_PER_DAY: '100', MAIL_PER_MONTH: '3' });
    const [d1, d2] = [authDeps(), authDeps()];
    const day1 = { ...d1, now: () => midnight('2028-02-10') + 1_000 };
    const day2 = { ...d2, now: () => midnight('2028-02-11') + 1_000 };
    expect((await ask1(day1, e)).status).toBe(200);
    expect((await ask1(day1, e)).status).toBe(200);
    expect((await ask1(day2, e)).status).toBe(200);
    const blocked = await ask1(day2, e);
    expect([blocked.status, await blocked.json()]).toEqual([429, MAIL_CAP]);
    expect(d1.mailer.sent.length + d2.mailer.sent.length).toBe(3);
    expect([await mailCount('d:2028-02-10'), await mailCount('d:2028-02-11'), await mailCount('m:2028-02')]).toEqual([2, 1, 3]);
  });

  it('um pedido barrado pelo limite da hora não gasta o teto', async () => {
    const d = { ...authDeps(), now: () => midnight('2028-03-10') + 1_000 };
    const e = testEnv({ MAIL_PER_DAY: '100' });
    const same = (i: number) => call(SEND, request('so-este@exemplo.com', `198.20.0.${i}`), { env: e, deps: d });
    for (let i = 0; i < CODES_PER_EMAIL_HOUR; i++) expect((await same(i)).status).toBe(200);
    const blocked = await same(99);
    expect([blocked.status, await blocked.json()]).toEqual([429, { code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' }]);
    expect(await mailCount('d:2028-03-10')).toBe(CODES_PER_EMAIL_HOUR); // 5, não 6
    expect(d.mailer.sent).toHaveLength(CODES_PER_EMAIL_HOUR);
    // Nem a rajada, nem o Turnstile recusado gastam o teto.
    const burst = await call(SEND, request('rajada@exemplo.com', '198.20.1.1'), { env: testEnv({ OTP_BURST: { limit: async () => ({ success: false }) } }), deps: d });
    const captcha = await call(SEND, postJson({ email: 'c@exemplo.com', type: 'sign-in' }, { 'x-turnstile-token': 'recusado', 'cf-connecting-ip': '198.20.1.2' }), { env: e, deps: d });
    expect([burst.status, captcha.status]).toEqual([429, 403]);
    expect(await mailCount('d:2028-03-10')).toBe(CODES_PER_EMAIL_HOUR);
  });

  it('o teto volta no dia seguinte (UTC)', async () => {
    const e = testEnv({ MAIL_PER_DAY: '1', MAIL_PER_MONTH: '100' });
    const d = authDeps();
    const lastMs = { ...d, now: () => midnight('2028-04-11') - 1 }; // 10/04, 23:59:59.999 UTC
    const nextDay = { ...d, now: () => midnight('2028-04-11') };
    expect((await ask1(lastMs, e)).status).toBe(200);
    expect((await ask1(lastMs, e)).status).toBe(429);
    expect((await ask1(nextDay, e)).status).toBe(200);
    expect((await ask1(nextDay, e)).status).toBe(429);
    expect([await mailCount('d:2028-04-10'), await mailCount('d:2028-04-11'), await mailCount('m:2028-04')]).toEqual([1, 1, 2]);
    expect(d.mailer.sent).toHaveLength(2);
  });

  it('com MAIL_PER_DAY torto, nenhum código sai (falha fechada, com o log)', async () => {
    const d = { ...authDeps(), now: () => midnight('2028-05-10') + 1_000 };
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      for (const bad of ['1GB', '', '-5', '1.5']) {
        const res = await ask1(d, testEnv({ MAIL_PER_DAY: bad }));
        expect([res.status, await res.json()], bad).toEqual([429, MAIL_CAP]);
      }
      const logged = out.mock.calls.flat().map(String);
      expect(logged).toContain(JSON.stringify({ evt: 'cap-missing', name: 'MAIL_PER_DAY' }));
      expect(logged.some((l) => l.includes('MAIL_PER_MONTH'))).toBe(false);
    } finally {
      out.mockRestore();
    }
    expect(d.mailer.sent).toHaveLength(0);
    expect(await mailCount('d:2028-05-10')).toBe(0);
  });

  it('com E2E_MAILBOX o teto não conta (nada sai de verdade)', async () => {
    const d = { ...authDeps(), now: () => midnight('2028-06-10') + 1_000 };
    const e = testEnv({ MAIL_PER_DAY: '1', E2E_MAILBOX: 'true' });
    for (let i = 0; i < 3; i++) expect((await ask1(d, e)).status).toBe(200);
    expect(d.mailer.sent).toHaveLength(3);
    expect([await mailCount('d:2028-06-10'), await mailCount('m:2028-06')]).toEqual([0, 0]);
    // Sem a caixa local, o mesmo teto vale.
    expect((await ask1(d, testEnv({ MAIL_PER_DAY: '1' }))).status).toBe(200);
    expect((await ask1(d, testEnv({ MAIL_PER_DAY: '1' }))).status).toBe(429);
  });
});
