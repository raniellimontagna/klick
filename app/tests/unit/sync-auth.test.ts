import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTCHA_HEADER } from '../../src/core/sync/types';
import { loadAuthClient } from '../../src/sync/auth';

// As rotas de /api/auth/* que o Worker deixa passar (worker/router.ts, AUTH_ROUTES), com o método de cada uma: o resto é 404.
const ALLOWED = new Set([
  'POST /api/auth/email-otp/send-verification-otp',
  'POST /api/auth/sign-in/email-otp',
  'GET /api/auth/get-session',
  'POST /api/auth/sign-out',
  'POST /api/auth/revoke-sessions',
  'GET /api/auth/passkey/generate-register-options',
  'POST /api/auth/passkey/verify-registration',
  'GET /api/auth/passkey/generate-authenticate-options',
  'POST /api/auth/passkey/verify-authentication',
  'GET /api/auth/passkey/list-user-passkeys',
  'POST /api/auth/passkey/delete-passkey',
]);

const USER = { id: 'conta-1', email: 'ranielli@exemplo.com', emailVerified: true, name: '', createdAt: '2026-10-16T12:00:00.000Z' };

type Reply = { status: number; body?: unknown } | Error;
interface Seen {
  route: string;
  headers: Headers;
  body: unknown;
}

// O servidor falso: uma resposta por "MÉTODO /caminho"; uma rota sem resposta dá 404, como no Worker. Um Error é a rede caída.
function server(replies: Record<string, Reply>): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const route = `${(init?.method ?? 'GET').toUpperCase()} ${url.pathname}`;
      seen.push({ route, headers: new Headers(init?.headers), body: typeof init?.body === 'string' ? JSON.parse(init.body) : null });
      const reply = replies[route] ?? { status: 404, body: { error: 'not-found' } };
      if (reply instanceof Error) throw reply;
      return Response.json(reply.body ?? null, { status: reply.status });
    }),
  );
  return seen;
}

// Um aparelho com WebAuthn: o navegador "assina" na hora. Sem isso, o jsdom não tem passkey nenhuma.
function webauthn(): void {
  const buf = (s: string): ArrayBuffer => new TextEncoder().encode(s).buffer as ArrayBuffer;
  const base = { id: 'cred-1', rawId: buf('cred-1'), type: 'public-key', authenticatorAttachment: 'platform', getClientExtensionResults: () => ({}) };
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      get: async () => ({ ...base, response: { authenticatorData: buf('a'), clientDataJSON: buf('c'), signature: buf('s'), userHandle: buf('u') } }),
      create: async () => ({ ...base, response: { attestationObject: buf('o'), clientDataJSON: buf('c'), getTransports: () => ['internal'] } }),
    },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { credentials?: unknown }).credentials;
});

const SEND = 'POST /api/auth/email-otp/send-verification-otp';
const VERIFY = 'POST /api/auth/sign-in/email-otp';

describe('o cliente de login (spec 7.2): o adaptador do Better Auth', () => {
  it('pede o código para entrar, com o token do Turnstile no cabeçalho que o guarda do Worker lê', async () => {
    const seen = server({ [SEND]: { status: 200, body: { success: true } } });
    const auth = await loadAuthClient();
    expect(await auth.sendCode('ranielli@exemplo.com', 'token-1')).toBe('sent');
    expect(seen).toHaveLength(1);
    expect(seen[0].route).toBe(SEND);
    expect(seen[0].headers.get(CAPTCHA_HEADER)).toBe('token-1');
    expect(seen[0].body).toEqual({ email: 'ranielli@exemplo.com', type: 'sign-in' });
  });

  it.each([
    ['o limite de pedidos (429)', { status: 429, body: { code: 'TOO_MANY_REQUESTS', message: 'Tente de novo mais tarde.' } }, 'limited'],
    ['o Turnstile recusado (403)', { status: 403, body: { code: 'CAPTCHA', message: 'Confirme que você é uma pessoa.' } }, 'captcha'],
    ['outro 403', { status: 403, body: { code: 'FORBIDDEN' } }, 'failed'],
    ['o servidor caído (500)', { status: 500, body: { error: 'x' } }, 'failed'],
    ['a conta desligada (404)', { status: 404, body: { error: 'not-found' } }, 'failed'],
    ['sem rede', new TypeError('Failed to fetch'), 'failed'],
  ] as const)('o pedido do código com %s responde %s', async (_name, reply, expected) => {
    server({ [SEND]: reply });
    const auth = await loadAuthClient();
    expect(await auth.sendCode('ranielli@exemplo.com', 'token-1')).toBe(expected);
  });

  it('429 MAIL_CAP vira mail-cap; 429 sem código continua limited', async () => {
    server({ [SEND]: { status: 429, body: { code: 'MAIL_CAP', message: 'Muitos pedidos de código hoje. Tente de novo amanhã.' } } });
    expect(await (await loadAuthClient()).sendCode('ranielli@exemplo.com', 'token-1')).toBe('mail-cap');
    server({ [SEND]: { status: 429, body: { error: 'x' } } });
    expect(await (await loadAuthClient()).sendCode('ranielli@exemplo.com', 'token-1')).toBe('limited');
  });

  it('o código certo devolve quem entrou', async () => {
    const seen = server({ [VERIFY]: { status: 200, body: { token: 'sessao', user: USER } } });
    const auth = await loadAuthClient();
    expect(await auth.verifyCode('ranielli@exemplo.com', '123456')).toEqual({ ok: true, user: { id: 'conta-1', email: 'ranielli@exemplo.com' } });
    expect(seen[0].body).toEqual({ email: 'ranielli@exemplo.com', otp: '123456' });
  });

  it.each([
    ['INVALID_OTP', { status: 400, body: { code: 'INVALID_OTP', message: 'Invalid OTP' } }, 'bad-code'],
    ['OTP_EXPIRED', { status: 400, body: { code: 'OTP_EXPIRED', message: 'OTP expired' } }, 'expired'],
    ['TOO_MANY_ATTEMPTS', { status: 403, body: { code: 'TOO_MANY_ATTEMPTS', message: 'Too many attempts' } }, 'too-many'],
    ['500', { status: 500, body: { error: 'x' } }, 'failed'],
    ['uma resposta sem usuário', { status: 200, body: { token: 'sessao' } }, 'failed'],
    ['sem rede', new TypeError('Failed to fetch'), 'failed'],
  ] as const)('o código recusado com %s responde %s', async (_name, reply, reason) => {
    server({ [VERIFY]: reply });
    const auth = await loadAuthClient();
    expect(await auth.verifyCode('ranielli@exemplo.com', '000000')).toEqual({ ok: false, reason });
  });

  it('entrar com a passkey passa por verify-authentication (nunca /sign-in/passkey) e devolve quem entrou', async () => {
    webauthn();
    const seen = server({
      'GET /api/auth/passkey/generate-authenticate-options': { status: 200, body: { challenge: 'AAAA', rpId: 'localhost', allowCredentials: [] } },
      'POST /api/auth/passkey/verify-authentication': { status: 200, body: { session: { id: 's1' }, user: USER } },
    });
    const auth = await loadAuthClient();
    expect(await auth.passkeySignIn()).toEqual({ id: 'conta-1', email: 'ranielli@exemplo.com' });
    expect(seen.map((s) => s.route)).toEqual(['GET /api/auth/passkey/generate-authenticate-options', 'POST /api/auth/passkey/verify-authentication']);
  });

  it('sem passkey (ou sem WebAuthn) neste aparelho, entrar com ela devolve null', async () => {
    server({ 'GET /api/auth/passkey/generate-authenticate-options': { status: 200, body: { challenge: 'AAAA', allowCredentials: [] } } });
    const auth = await loadAuthClient();
    expect(await auth.passkeySignIn()).toBeNull();
    webauthn();
    server({
      'GET /api/auth/passkey/generate-authenticate-options': { status: 200, body: { challenge: 'AAAA', allowCredentials: [] } },
      'POST /api/auth/passkey/verify-authentication': { status: 400, body: { code: 'PASSKEY_NOT_FOUND' } },
    });
    expect(await (await loadAuthClient()).passkeySignIn()).toBeNull();
  });

  it('cria, lista e remove passkeys', async () => {
    webauthn();
    const seen = server({
      'GET /api/auth/passkey/generate-register-options': {
        status: 200,
        body: { challenge: 'AAAA', rp: { name: 'Klick', id: 'localhost' }, user: { id: 'dXNlcg', name: 'ranielli@exemplo.com', displayName: '' }, pubKeyCredParams: [] },
      },
      'POST /api/auth/passkey/verify-registration': { status: 200, body: { id: 'pk1', name: 'Klick' } },
      'GET /api/auth/passkey/list-user-passkeys': {
        status: 200,
        body: [
          { id: 'pk1', name: 'Klick', createdAt: '2026-10-16T12:00:00.000Z' },
          { id: 'pk2', createdAt: '2026-10-15T12:00:00.000Z' },
        ],
      },
      'POST /api/auth/passkey/delete-passkey': { status: 200, body: { status: true } },
    });
    const auth = await loadAuthClient();
    expect(await auth.addPasskey()).toBe(true);
    expect(await auth.listPasskeys()).toEqual([
      { id: 'pk1', name: 'Klick', createdAt: Date.parse('2026-10-16T12:00:00.000Z') },
      { id: 'pk2', name: null, createdAt: Date.parse('2026-10-15T12:00:00.000Z') },
    ]);
    expect(await auth.removePasskey('pk1')).toBe(true);
    expect(seen.at(-1)?.body).toEqual({ id: 'pk1' });
  });

  it('as falhas das passkeys respondem sem lançar', async () => {
    server({}); // tudo 404
    const auth = await loadAuthClient();
    expect(await auth.addPasskey()).toBe(false);
    expect(await auth.listPasskeys()).toEqual([]);
    expect(await auth.removePasskey('pk1')).toBe(false);
    server({ 'GET /api/auth/passkey/list-user-passkeys': new TypeError('Failed to fetch'), 'POST /api/auth/passkey/delete-passkey': new TypeError('x') });
    const offline = await loadAuthClient();
    expect(await offline.listPasskeys()).toEqual([]);
    expect(await offline.removePasskey('pk1')).toBe(false);
  });

  it('sair, sair de todos os aparelhos e a renovação da sessão; sem rede, nenhum deles lança', async () => {
    const seen = server({
      'POST /api/auth/sign-out': { status: 200, body: { success: true } },
      'POST /api/auth/revoke-sessions': { status: 200, body: { status: true } },
      'GET /api/auth/get-session': { status: 200, body: { session: { id: 's1' }, user: USER } },
    });
    const auth = await loadAuthClient();
    await auth.signOut();
    expect(await auth.signOutEverywhere()).toBe(true);
    await auth.renewSession();
    expect(seen.map((s) => s.route)).toEqual(['POST /api/auth/sign-out', 'POST /api/auth/revoke-sessions', 'GET /api/auth/get-session']);
    server({ 'POST /api/auth/revoke-sessions': { status: 500, body: {} } });
    expect(await (await loadAuthClient()).signOutEverywhere()).toBe(false);
    const down = new TypeError('Failed to fetch');
    server({ 'POST /api/auth/sign-out': down, 'POST /api/auth/revoke-sessions': down, 'GET /api/auth/get-session': down });
    const offline = await loadAuthClient();
    await expect(offline.signOut()).resolves.toBeUndefined();
    expect(await offline.signOutEverywhere()).toBe(false);
    await expect(offline.renewSession()).resolves.toBeUndefined();
  });

  it('só usa as rotas que o Worker deixa passar (worker/router.ts)', async () => {
    webauthn();
    const ok = { status: 200, body: { success: true, user: USER, session: { id: 's1' } } };
    const seen = server(Object.fromEntries([...ALLOWED].map((route) => [route, ok])));
    const auth = await loadAuthClient();
    await auth.sendCode('ranielli@exemplo.com', 'token-1');
    await auth.verifyCode('ranielli@exemplo.com', '123456');
    await auth.passkeySignIn();
    await auth.addPasskey();
    await auth.listPasskeys();
    await auth.removePasskey('pk1');
    await auth.renewSession();
    await auth.signOutEverywhere();
    await auth.signOut();
    expect(seen.length).toBeGreaterThanOrEqual(9);
    for (const { route } of seen) expect([...ALLOWED]).toContain(route);
  });
});
