import { createExecutionContext } from 'cloudflare:test';
import { getMigrations } from 'better-auth/db/migration';
import { describe, expect, it } from 'vitest';
import type { SyncResponse } from '../../src/core/sync/types';
import { createAuth, SESSION_DAYS } from '../../worker/auth';
import { codeEmail, e2eMailbox } from '../../worker/mail';
import { defaultDeps, handle } from '../../worker/router';
import { authDeps, call, fakeMailer, postJson, signIn, T0, testEnv } from './helpers';

const syncBody = (changes: unknown[] = []) => ({ v: 1, deviceId: 'd1', cursor: 0, clock: T0, changes });
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
    expect((await call('/api/sync', postJson(syncBody([solve('da-a')]), { Cookie: a }), { deps })).status).toBe(200);
    const seen = (await (await call('/api/sync', postJson(syncBody(), { Cookie: b }), { deps })).json()) as SyncResponse;
    expect(seen.changes).toEqual([]);
    expect((await call('/api/sync', postJson(syncBody()), { deps })).status).toBe(401);
  });

  it('com o cookie, uma escrita do Better Auth vinda de outra origem é recusada, e a sessão continua (spec 7.3)', async () => {
    const deps = authDeps();
    const cookie = await signIn('origem@exemplo.com', deps);
    expect((await call('/api/auth/sign-out', postJson({}, { Cookie: cookie, Origin: 'https://outro.site' }), { deps })).status).toBe(403);
    expect((await call('/api/sync', postJson(syncBody(), { Cookie: cookie }), { deps })).status).toBe(200);
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
  });
});
