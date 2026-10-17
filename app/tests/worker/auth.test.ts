import { createExecutionContext } from 'cloudflare:test';
import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it, vi } from 'vitest';
import { SYNC_PROTOCOL, type SyncResponse } from '../../src/core/sync/types';
import { createAuth, SESSION_DAYS } from '../../worker/auth';
import { codeEmail, e2eMailbox, type Mailer } from '../../worker/mail';
import { defaultDeps, handle, MAX_AUTH_BODY } from '../../worker/router';
import { accountOf, authDeps, call, fakeMailer, ORIGIN, postJson, signIn, T0, testDeps, testEnv } from './helpers';

// `account`: a conta que o aparelho espera (C1), a da sessão quando o teste quer 200.
const syncBody = (changes: unknown[] = [], account = 'qualquer') => ({ v: SYNC_PROTOCOL, account, deviceId: 'd1', cursor: 0, clock: T0, changes });
const solve = (id: string) => ({
  store: 'solves', id, updatedAt: T0, deletedAt: null, deletionStamp: T0,
  data: { sessionId: 's', event: '333', ms: 1, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0 },
});

describe('login por código (spec 7.1 a 7.3)', () => {
  it('o SQL de worker/migrations cobre o esquema do Better Auth', async () => {
    const plan = await getMigrations(createAuth(testEnv(), createExecutionContext(), fakeMailer()).options);
    const { toBeCreated, toBeAdded, toBeAddedIndexes, schemaProblems, compileMigrations } = plan;
    if (toBeCreated.length + toBeAdded.length + toBeAddedIndexes.length > 0) throw new Error(`Falta no worker/migrations/0001_auth.sql:\n${await compileMigrations()}`);
    expect(schemaProblems).toEqual([]);
  });

  it('o código chega com 6 dígitos; entrar dá o cookie de sessão de 90 dias, HttpOnly, Secure e SameSite=Lax', async () => {
    const deps = authDeps();
    const send = await call('/api/auth/email-otp/send-verification-otp', postJson({ email: 'ranielli@exemplo.com', type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    expect(send.status).toBe(200);
    const { code } = deps.mailer.sent.at(-1)!;
    expect(code).toMatch(/^\d{6}$/);
    const res = await call('/api/auth/sign-in/email-otp', postJson({ email: 'ranielli@exemplo.com', otp: code }), { deps });
    expect(res.status).toBe(200);
    const cookie = res.headers.getSetCookie().find((c) => c.includes('session_token'))!;
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(Number(/Max-Age=(\d+)/i.exec(cookie)?.[1])).toBe(SESSION_DAYS * 86_400);
  });

  it('pedir o código responde igual para um e-mail com conta e sem conta', async () => {
    const deps = authDeps();
    await signIn('ja-tem@exemplo.com', deps);
    const ask = (email: string) => call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    const [known, unknown] = await Promise.all([ask('ja-tem@exemplo.com'), ask('nunca-veio@exemplo.com')]);
    expect([known.status, await known.text()]).toEqual([unknown.status, await unknown.text()]);
    // E o código errado também: o erro não diz se o e-mail tem conta (spec 7.5).
    const codes = deps.mailer.sent.slice(-2).map((m) => m.code);
    const wrong = ['000000', '111111', '222222'].find((c) => !codes.includes(c))!;
    const enter = (email: string) => call('/api/auth/sign-in/email-otp', postJson({ email, otp: wrong }), { deps });
    const [knownIn, unknownIn] = await Promise.all([enter('ja-tem@exemplo.com'), enter('nunca-veio@exemplo.com')]);
    expect([knownIn.status, await knownIn.text()]).toEqual([unknownIn.status, await unknownIn.text()]);
  });

  it('5 tentativas erradas esgotam o código (spec 7.1)', async () => {
    const deps = authDeps();
    const email = 'tentativas@exemplo.com';
    await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    const { code } = deps.mailer.sent.at(-1)!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await call('/api/auth/sign-in/email-otp', postJson({ email, otp: wrong }), { deps });
    const res = await call('/api/auth/sign-in/email-otp', postJson({ email, otp: code }), { deps });
    expect(res.status).not.toBe(200);
    expect(await res.text()).toContain('TOO_MANY_ATTEMPTS');
  });

  it('com a sessão, /api/sync funciona; uma conta não lê nem grava na outra', async () => {
    const deps = authDeps();
    const a = await signIn('a@exemplo.com', deps);
    const b = await signIn('b@exemplo.com', deps);
    const [idA, idB] = [await accountOf(a, deps), await accountOf(b, deps)];
    expect((await call('/api/sync', postJson(syncBody([solve('da-a')], idA), { Cookie: a }), { deps })).status).toBe(200);
    const seen = (await (await call('/api/sync', postJson(syncBody([], idB), { Cookie: b }), { deps })).json()) as SyncResponse;
    expect(seen.changes).toEqual([]);
    expect((await call('/api/sync', postJson(syncBody()), { deps })).status).toBe(401);
  });

  it('com o cookie, uma escrita do Better Auth vinda de outra origem é recusada, e a sessão continua (spec 7.3)', async () => {
    const deps = authDeps();
    const cookie = await signIn('origem@exemplo.com', deps);
    expect((await call('/api/auth/sign-out', postJson({}, { Cookie: cookie, Origin: 'https://outro.site' }), { deps })).status).toBe(403);
    expect((await call('/api/sync', postJson(syncBody([], await accountOf(cookie, deps)), { Cookie: cookie }), { deps })).status).toBe(200);
  });

  it('o e-mail tem só o código, a validade e o aviso, em texto e em HTML (spec 7.4)', () => {
    const mail = codeEmail('123456');
    expect(mail.subject).toBe('Seu código do Klick: 123456');
    expect(mail.text).toBe('Seu código para entrar no Klick: 123456\n\nEle vale por 10 minutos.\n\nSe não foi você, ignore este e-mail.\n');
    expect(mail.html).toContain('123456');
  });

  it('a caixa do ponta a ponta só existe com E2E_MAILBOX e em localhost; com ela, nada é enviado', async () => {
    expect((await call('/api/__e2e/otp?email=x@exemplo.com')).status).toBe(404);
    const env = testEnv({ E2E_MAILBOX: 'true' });
    expect((await call('/api/__e2e/otp?email=x@exemplo.com', {}, { env })).status).toBe(404); // beta.klick..., não localhost
    const deps = defaultDeps(env);
    const local = (path: string, init?: RequestInit) => handle(new Request(`http://localhost:8787${path}`, init), env, createExecutionContext(), deps);
    await deps.mailer.sendCode('E2E@exemplo.com', '654321');
    expect(e2eMailbox.get('e2e@exemplo.com')).toBe('654321');
    expect(await (await local('/api/__e2e/otp?email=e2e@exemplo.com')).json()).toEqual({ code: '654321' });
    const off = testEnv(); // em localhost, mas sem E2E_MAILBOX
    expect((await handle(new Request('http://localhost:8787/api/__e2e/otp?email=e2e@exemplo.com'), off, createExecutionContext(), defaultDeps(off))).status).toBe(404);
  });

  it('o código fica no D1 só em hash (decisão 23)', async () => {
    const deps = authDeps();
    const email = 'hash@exemplo.com';
    await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    const { code } = deps.mailer.sent.at(-1)!;
    const rows = await testEnv().DB.prepare('SELECT value FROM verification WHERE identifier LIKE ?').bind(`%${email}`).all<{ value: string }>();
    expect(rows.results).toHaveLength(1);
    expect(rows.results[0].value).not.toContain(code);
  });

  it('a sessão não guarda o IP de quem entrou (spec 10): os limites leem o IP do pedido, sem gravá-lo', async () => {
    const deps = authDeps();
    const email = 'sem-ip@exemplo.com';
    const ip = { 'cf-connecting-ip': '203.0.113.7' };
    await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok', ...ip }), { deps });
    const { code } = deps.mailer.sent.at(-1)!;
    expect((await call('/api/auth/sign-in/email-otp', postJson({ email, otp: code }, ip), { deps })).status).toBe(200);
    const row = await testEnv()
      .DB.prepare('SELECT s.ipAddress FROM session s JOIN "user" u ON u.id = s.userId WHERE u.email = ?')
      .bind(email)
      .first<{ ipAddress: string | null }>();
    expect(row).not.toBeNull();
    expect(row!.ipAddress ?? '').toBe('');
  });

  it('a falha do carteiro vai para o log só com o nome do erro: sem o e-mail, sem o código (spec 8.5)', async () => {
    let code = '';
    const leaky: Mailer = {
      async sendCode(email, otp) {
        code = otp;
        throw new Error(`não entregue para ${email}, código ${otp}`);
      },
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const res = await call('/api/auth/email-otp/send-verification-otp', postJson({ email: 'vaza@exemplo.com', type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), {
        deps: { ...authDeps(), mailer: leaky },
      });
      expect(res.status).toBe(200);
      const logged = spy.mock.calls.flat().map(String).join('\n');
      expect(logged).toContain('mail-failed');
      expect(code).toMatch(/^\d{6}$/);
      expect(logged).not.toContain('vaza@exemplo.com');
      expect(logged).not.toContain(code);
    } finally {
      spy.mockRestore();
    }
  });

  it('um cookie adulterado, ou usado depois de sair, não abre /api/sync (401)', async () => {
    const deps = authDeps();
    const cookie = await signIn('cookie@exemplo.com', deps);
    const id = await accountOf(cookie, deps);
    const sync = (c: string) => call('/api/sync', postJson(syncBody([], id), { Cookie: c }), { deps });
    const tampered = cookie.replace(/(session_token=)(.)/, (_, name: string, c: string) => name + (c === 'A' ? 'B' : 'A'));
    expect(tampered).not.toBe(cookie);
    expect((await sync(tampered)).status).toBe(401);
    expect((await sync(cookie)).status).toBe(200);
    expect((await call('/api/auth/sign-out', postJson({}, { Cookie: cookie }), { deps })).status).toBe(200);
    expect((await sync(cookie)).status).toBe(401);
  });

  it('sair sem corpo funciona: o pedido que o router refaz não leva um corpo vazio ao Better Auth', async () => {
    const deps = authDeps();
    const cookie = await signIn('sem-corpo@exemplo.com', deps);
    const res = await call('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN, Cookie: cookie } }, { deps });
    expect(res.status).toBe(200);
    expect((await call('/api/sync', postJson(syncBody(), { Cookie: cookie }), { deps })).status).toBe(401);
  });
});

describe('/api/auth/*: só as rotas que o app usa (spec 7.1 e 7.2)', () => {
  const notFound = { error: 'not-found' };

  it('conferir o código sem consumir a tentativa não existe: a rajada de palpites dá 404, e o código continua valendo', async () => {
    const deps = authDeps();
    const email = 'rajada@exemplo.com';
    await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok' }), { deps });
    const { code } = deps.mailer.sent.at(-1)!;
    const guesses = Array.from({ length: 41 }, (_, i) => String(i).padStart(6, '0'));
    const burst = await Promise.all(guesses.map((otp) => call('/api/auth/email-otp/check-verification-otp', postJson({ email, type: 'sign-in', otp }), { deps })));
    expect(new Set(burst.map((r) => r.status))).toEqual(new Set([404]));
    expect((await call('/api/auth/sign-in/email-otp', postJson({ email, otp: code }), { deps })).status).toBe(200);
  });

  it('senha, verificação de e-mail, rotas desconhecidas e método errado: 404', async () => {
    const deps = authDeps();
    const cookie = await signIn('fora-da-lista@exemplo.com', deps);
    const post = (path: string, body: unknown) => call(path, postJson(body, { Cookie: cookie }), { deps });
    for (const res of [
      await post('/api/auth/email-otp/verify-email', { email: 'fora-da-lista@exemplo.com', otp: '000000' }),
      await post('/api/auth/email-otp/request-password-reset', { email: 'fora-da-lista@exemplo.com' }),
      await post('/api/auth/forget-password/email-otp', { email: 'fora-da-lista@exemplo.com' }),
      await post('/api/auth/email-otp/reset-password', { email: 'fora-da-lista@exemplo.com', otp: '000000', password: 'senha-nova-123' }),
      await post('/api/auth/update-user', { name: 'x' }),
      await post('/api/auth/x', {}),
      await call('/api/auth/sign-out', { headers: { Cookie: cookie } }, { deps }), // GET numa rota de POST
      await call('/api/auth/GET-SESSION', { headers: { Cookie: cookie } }, { deps }),
    ]) {
      expect([res.status, await res.json()]).toEqual([404, notFound]);
    }
  });

  it('pedir o código só vale para entrar: outro tipo é recusado antes de tocar no D1, e nada é enviado', async () => {
    const deps = authDeps();
    const email = 'outro-tipo@exemplo.com';
    for (const type of ['forget-password', 'email-verification', 'change-email', undefined]) {
      const res = await call('/api/auth/email-otp/send-verification-otp', postJson({ email, type }), { deps });
      expect([res.status, await res.json()]).toEqual([400, { error: 'bad-request' }]);
    }
    expect(deps.mailer.sent).toEqual([]);
    const rows = await testEnv().DB.prepare('SELECT count(*) AS n FROM verification WHERE identifier LIKE ?').bind(`%${email}`).first<{ n: number }>();
    expect(rows?.n).toBe(0);
  });

  it('as rotas da lista chegam ao Better Auth: sessão, sair de todos, e a passkey com o rpID do ambiente (decisão 22)', async () => {
    const deps = authDeps();
    const cookie = await signIn('lista@exemplo.com', deps);
    const get = (path: string) => call(path, { headers: { Cookie: cookie } }, { deps });
    const post = (path: string, body: unknown) => call(path, postJson(body, { Cookie: cookie }), { deps });
    const session = await get('/api/auth/get-session');
    expect(((await session.json()) as { user: { email: string } }).user.email).toBe('lista@exemplo.com');
    const register = await get('/api/auth/passkey/generate-register-options');
    expect(((await register.json()) as { rp: { id: string } }).rp.id).toBe(new URL(ORIGIN).hostname);
    const authenticate = await get('/api/auth/passkey/generate-authenticate-options');
    expect(((await authenticate.json()) as { rpId: string }).rpId).toBe(new URL(ORIGIN).hostname);
    const list = await get('/api/auth/passkey/list-user-passkeys');
    expect([list.status, await list.json()]).toEqual([200, []]);
    // Sem um autenticador de verdade, o Better Auth recusa; o que importa aqui é que o pedido chegou a ele (não é o 404 do router).
    const codes = [];
    for (const res of [
      await post('/api/auth/passkey/verify-registration', { response: {} }),
      await post('/api/auth/passkey/verify-authentication', { response: {} }),
      await post('/api/auth/passkey/delete-passkey', { id: 'nao-existe' }),
    ]) {
      codes.push(((await res.json()) as { code?: string }).code);
    }
    expect(codes).toEqual(['CHALLENGE_NOT_FOUND', 'CHALLENGE_NOT_FOUND', 'PASSKEY_NOT_FOUND']);
    expect((await post('/api/auth/revoke-sessions', {})).status).toBe(200);
    expect((await call('/api/sync', postJson(syncBody(), { Cookie: cookie }), { deps })).status).toBe(401);
  });

  it('o corpo de um pedido de login tem limite (413), sem ser lido inteiro', async () => {
    const deps = authDeps();
    const big = postJson({ email: 'grande@exemplo.com', otp: '0'.repeat(MAX_AUTH_BODY) });
    expect((await call('/api/auth/sign-in/email-otp', big, { deps })).status).toBe(413);
    const declared = { ...postJson({}), headers: { 'Content-Type': 'application/json', Origin: ORIGIN, 'Content-Length': String(3 * MAX_AUTH_BODY + 1) } };
    expect((await call('/api/auth/sign-in/email-otp', declared, { deps })).status).toBe(413);
  });
});

describe('o segredo do Better Auth (spec 8.4)', () => {
  it('sem BETTER_AUTH_SECRET, ou com menos de 32 caracteres, /api/auth/* e /api/sync respondem 503, nunca com um segredo padrão', async () => {
    const bad = [testEnv({ BETTER_AUTH_SECRET: undefined as unknown as string }), testEnv({ BETTER_AUTH_SECRET: '' }), testEnv({ BETTER_AUTH_SECRET: 'x'.repeat(31) })];
    for (const env of bad) {
      expect((await call('/api/auth/get-session', {}, { env, deps: authDeps() })).status).toBe(503);
      expect((await call('/api/auth/email-otp/send-verification-otp', postJson({ email: 'x@exemplo.com', type: 'sign-in' }), { env, deps: authDeps() })).status).toBe(503);
      expect((await call('/api/sync', postJson(syncBody()), { env, deps: testDeps({ user: 'conta-sem-segredo' }) })).status).toBe(503);
      expect(() => createAuth(env, createExecutionContext(), fakeMailer())).toThrow();
    }
    expect(testEnv().BETTER_AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect((await call('/api/health', {}, { env: bad[0] })).status).toBe(200);
  });
});
