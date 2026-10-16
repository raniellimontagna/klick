import { describe, expect, it, vi } from 'vitest';
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { defaultSessionId } from '../../src/data/ids';
import type { Health, SyncApi } from '../../src/sync/api';
import type { AuthClientLike } from '../../src/sync/auth';
import { type Captcha, CaptchaError } from '../../src/sync/captcha';
import { appWithAccount, fakeApi, fakeAuth } from './sync-account';
import { FakeServer } from './sync-fakes';

const EMAIL = 'ranielli@exemplo.com';
const OTHER = { id: 'conta-2', email: 'outra@exemplo.com' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hasSolve = (server: FakeServer) => [...server.records.keys()].some((k) => k.startsWith('solves/'));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe('entrar (spec 7.2 e 7.6)', () => {
  it('o código errado não muda nada; o certo, num aparelho sem conta, é o primeiro login e leva os dados daqui (spec 6.5)', async () => {
    const server = new FakeServer();
    const { auth, calls } = fakeAuth();
    const { app, repo } = await appWithAccount(fakeApi(server).api, { auth });
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() });
    const account = app.account!;
    expect(await account.verifyCode(EMAIL, '000000')).toEqual({ ok: false, reason: 'bad-code' });
    expect(await account.verifyCode(` ${EMAIL} `, '123456')).toEqual({ ok: true, next: 'first' });
    expect(calls).toContain(`verify:${EMAIL}:123456`);
    expect(account.signedIn).toBe(false); // só depois de continuar: o diálogo ainda pode oferecer a passkey
    expect(await account.continueSignIn('join')).toBe('ok');
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
    await vi.waitFor(() => expect(account.signedIn).toBe(true));
    expect((await repo.getSyncState()).accountId).toBe('conta-1');
  });

  it('o pedido do código devolve o que o cliente respondeu: o Turnstile recusado e o limite são diferentes', async () => {
    const { auth, calls, state } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { auth });
    const host = document.createElement('div');
    expect(await app.account!.sendCode(` ${EMAIL} `, host)).toBe('sent');
    expect(calls).toContain(`send:${EMAIL}:token-de-1x00000000000000000000BB`);
    state.send = 'captcha';
    expect(await app.account!.sendCode(EMAIL, host)).toBe('captcha');
    state.send = 'limited';
    expect(await app.account!.sendCode(EMAIL, host)).toBe('limited');
  });

  it('cada pedido do código pega um token novo do Turnstile, no elemento da tela do e-mail (o servidor gasta o token até no 429)', async () => {
    const { auth, calls, state } = fakeAuth();
    const asked: [string, HTMLElement][] = [];
    let n = 0;
    const captcha: Captcha = {
      token: async (siteKey, host) => {
        asked.push([siteKey, host]);
        return `token-${++n}`;
      },
    };
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { auth, captcha });
    const host = document.createElement('div');
    state.send = 'limited';
    expect(await app.account!.sendCode(EMAIL, host)).toBe('limited');
    state.send = 'sent';
    expect(await app.account!.sendCode(EMAIL, host)).toBe('sent');
    expect(calls).toEqual([`send:${EMAIL}:token-1`, `send:${EMAIL}:token-2`]);
    expect(asked).toEqual([
      ['1x00000000000000000000BB', host],
      ['1x00000000000000000000BB', host],
    ]);
  });

  it('o Turnstile que falha aqui não chega ao servidor: o desafio recusado é "captcha"; sem o script (sem rede), "failed"', async () => {
    const { auth, calls } = fakeAuth();
    let failure: Error = new CaptchaError();
    const captcha: Captcha = {
      token: async () => {
        throw failure;
      },
    };
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { auth, captcha });
    const host = document.createElement('div');
    expect(await app.account!.sendCode(EMAIL, host)).toBe('captcha');
    failure = new Error('o script não veio');
    expect(await app.account!.sendCode(EMAIL, host)).toBe('failed');
    expect(calls).toEqual([]);
  });

  it('sem a site key (o /api/health não respondeu ao abrir), pergunta de novo antes do Turnstile; sem resposta, "failed"', async () => {
    const { auth, calls } = fakeAuth();
    let health: Health | null = null;
    const api: SyncApi = { ...fakeApi(new FakeServer()).api, health: async () => health };
    const asked: string[] = [];
    const captcha: Captcha = {
      token: async (siteKey) => {
        asked.push(siteKey);
        return 'tok';
      },
    };
    const { app } = await appWithAccount(api, { auth, captcha });
    const host = document.createElement('div');
    expect(app.account!.siteKey).toBeNull();
    expect(await app.account!.sendCode(EMAIL, host)).toBe('failed');
    expect(asked).toEqual([]);
    health = { accounts: true, turnstileSiteKey: 'site-key' };
    expect(await app.account!.sendCode(EMAIL, host)).toBe('sent');
    expect(asked).toEqual(['site-key']);
    expect(calls).toEqual([`send:${EMAIL}:tok`]);
  });

  it('o cliente de login que não carrega (sem rede) responde "failed" e carrega de novo na próxima', async () => {
    let loads = 0;
    const loadAuth = async (): Promise<AuthClientLike> => {
      loads += 1;
      if (loads === 1) throw new Error('o pedaço não veio');
      return fakeAuth().auth;
    };
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { loadAuth });
    expect(await app.account!.sendCode(EMAIL, document.createElement('div'))).toBe('failed');
    expect(await app.account!.verifyCode(EMAIL, '123456')).toEqual({ ok: true, next: 'first' });
    expect(loads).toBe(2);
  });

  it('a mesma conta de volta depois de sair só volta a sincronizar, com o que mudou fora dela (decisão 12)', async () => {
    const server = new FakeServer();
    const net = fakeApi(server);
    const { app } = await appWithAccount(net.api, { signedIn: true });
    const account = app.account!;
    await vi.waitFor(() => expect(account.status.phase).toBe('idle'));
    expect(await account.signOut(false)).toBe('ok');
    expect(account.signedIn).toBe(false);
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() }); // fora da conta: fica na fila
    const syncs = vi.spyOn(net.api, 'sync');
    await account.syncNow();
    expect(syncs).not.toHaveBeenCalled();
    expect(await account.verifyCode(EMAIL, '123456')).toEqual({ ok: true, next: 'resume' });
    expect(await account.continueSignIn('resume')).toBe('ok');
    expect(account.signedIn).toBe(true);
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true)); // sem recarregar: o motor saiu da parada de sair
  });

  it('continuar só vale no caminho que o login devolveu; o que não bate é recusado, e nada muda (Task 14)', async () => {
    const first = await appWithAccount(fakeApi(new FakeServer()).api);
    expect(await first.app.account!.verifyCode(EMAIL, '123456')).toEqual({ ok: true, next: 'first' });
    expect(await first.app.account!.continueSignIn('resume')).toBe('refused');
    expect(await first.app.account!.continueSignIn('erase')).toBe('refused');
    expect(await first.repo.getSyncState()).toMatchObject({ accountId: null, signedIn: false });

    const back = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(back.app.account!.status.phase).toBe('idle'));
    expect(await back.app.account!.signOut(false)).toBe('ok');
    expect(await back.app.account!.verifyCode(EMAIL, '123456')).toEqual({ ok: true, next: 'resume' });
    expect(await back.app.account!.continueSignIn('join')).toBe('refused'); // seria um primeiro login, com cópia e tudo na fila
    expect((await back.repo.listBackups()).map((b) => b.reason)).not.toContain('pre-sync');

    // 'resume' depois de outra conta gravaria o e-mail da conta 2 na conta 1, dentro, e sincronizaria a fila da 1 com o cookie da 2.
    const { auth } = fakeAuth(OTHER);
    const other = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(other.app.account!.status.phase).toBe('idle'));
    expect(await other.app.account!.signOut(false)).toBe('ok');
    expect(await other.app.account!.verifyCode(OTHER.email, '123456')).toEqual({ ok: true, next: 'other-account' });
    expect(await other.app.account!.continueSignIn('resume')).toBe('refused');
    expect(await other.repo.getSyncState()).toMatchObject({ accountId: 'conta-1', email: EMAIL, signedIn: false });
    expect(await other.app.account!.continueSignIn('join')).toBe('ok'); // a escolha certa ainda vale
    await vi.waitFor(async () => expect((await other.repo.getSyncState()).accountId).toBe('conta-2'));
  });

  it('entrar relê a lista de passkeys que não tinha carregado (sem rede, ou a sessão expirada) (Task 14)', async () => {
    const { auth, state } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    const account = app.account!;
    await account.loadPasskeys(); // a lista que não veio fica vazia
    expect(account.passkeys).toEqual([]);
    state.passkeys.push({ id: 'pk1', name: null, createdAt: 1_791_500_000_000 });
    expect(await account.verifyCode(EMAIL, '123456')).toEqual({ ok: true, next: 'resume' });
    expect(account.passkeys).toBeNull(); // Ajustes relê
  });

  it('a passkey: sem ela, null; com ela, o mesmo caminho do código', async () => {
    const { auth, state } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { auth });
    state.passkeyUser = null;
    expect(await app.account!.passkeySignIn()).toBeNull();
    state.passkeyUser = { id: 'conta-1', email: EMAIL };
    expect(await app.account!.passkeySignIn()).toBe('first');
  });
});

describe('outra conta neste aparelho (spec 7.6)', () => {
  it('apagar antes de entrar recusa com mudanças esperando para subir (decisão 12); nada muda aqui', async () => {
    const { auth } = fakeAuth(OTHER);
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() }); // na fila, ainda não subiu
    expect(await app.account!.signOut(false)).toBe('ok');
    expect(await app.account!.verifyCode(OTHER.email, '123456')).toEqual({ ok: true, next: 'other-account' });
    expect(await app.account!.continueSignIn('erase')).toBe('pending');
    expect(await repo.listSolves()).toHaveLength(1);
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-1', signedIn: false });
  });

  it('sem mudanças esperando, apagar leva os dados daqui e entra na outra como num aparelho novo', async () => {
    const before = new FakeServer();
    const after = new FakeServer();
    const net = fakeApi(before);
    const { auth } = fakeAuth(OTHER);
    const { app, repo } = await appWithAccount(net.api, { signedIn: true, auth });
    const account = app.account!;
    await vi.waitFor(() => expect(account.status.phase).toBe('idle'));
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() });
    await account.syncNow();
    expect(account.status.pending).toBe(0);
    expect(await account.signOut(false)).toBe('ok');
    net.api.sync = fakeApi(after).api.sync; // a outra conta, no servidor
    expect(await account.verifyCode(OTHER.email, '123456')).toEqual({ ok: true, next: 'other-account' });
    expect(await account.addPasskey()).toBe(true); // o diálogo oferece a passkey antes de continuar
    expect(await account.continueSignIn('erase')).toBe('ok');
    expect(await repo.listSolves()).toHaveLength(0);
    expect(app.solves).toHaveLength(0);
    expect(app.sessions.map((s) => s.id)).toEqual([defaultSessionId('333')]);
    await vi.waitFor(() => expect(account.signedIn).toBe(true));
    await vi.waitFor(() => expect(account.status.phase).toBe('idle'));
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-2', email: OTHER.email, passkey: true });
    expect(hasSolve(after)).toBe(false);
  });

  it('juntar entra na outra conta com os dados daqui', async () => {
    const before = new FakeServer();
    const after = new FakeServer();
    const net = fakeApi(before);
    const { auth } = fakeAuth(OTHER);
    const { app, repo } = await appWithAccount(net.api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() });
    await app.account!.signOut(false);
    net.api.sync = fakeApi(after).api.sync;
    expect(await app.account!.verifyCode(OTHER.email, '123456')).toEqual({ ok: true, next: 'other-account' });
    expect(await app.account!.continueSignIn('join')).toBe('ok');
    await vi.waitFor(() => expect(hasSolve(after)).toBe(true));
    expect((await repo.getSyncState()).accountId).toBe('conta-2');
  });

  it('desistir sai da sessão nova e não muda nada aqui', async () => {
    const { auth, calls } = fakeAuth(OTHER);
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(await app.account!.verifyCode(OTHER.email, '123456')).toEqual({ ok: true, next: 'other-account' });
    await app.account!.cancelSignIn();
    expect(calls).toContain('sign-out');
    expect(await app.account!.continueSignIn('join')).toBe('ok'); // nada mais a continuar
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-1', signedIn: true });
  });
});

describe('sair (spec 7.7)', () => {
  it('espera a rodada em andamento antes de sair no servidor', async () => {
    const { auth, calls } = fakeAuth();
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const real = net.api.sync;
    const gate = deferred();
    const inFlight = deferred();
    net.api.sync = async (req: SyncRequest): Promise<SyncResponse> => {
      inFlight.resolve();
      await gate.promise;
      return real(req);
    };
    const round = app.account!.syncNow();
    await inFlight.promise;
    const leaving = app.account!.signOut(false);
    await sleep(20);
    expect(calls).not.toContain('sign-out'); // a resposta ainda está na rede
    gate.resolve();
    expect(await leaving).toBe('ok');
    expect(calls).toContain('sign-out');
    await round;
    expect(app.account!.signedIn).toBe(false);
  });

  it('apagar com mudanças esperando recusa antes de tudo: continua dentro e sincronizando', async () => {
    const { auth, calls } = fakeAuth();
    const server = new FakeServer();
    const { app, repo } = await appWithAccount(fakeApi(server).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() });
    expect(await app.account!.signOut(true)).toBe('pending');
    expect(calls).not.toContain('sign-out');
    expect(app.account!.signedIn).toBe(true);
    expect(await repo.listSolves()).toHaveLength(1);
    await app.account!.syncNow();
    expect(hasSolve(server)).toBe(true);
  });

  it('apagar sem mudanças esperando leva os dados e as cópias daqui e cria a sessão padrão', async () => {
    const { auth, calls } = fakeAuth();
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    const account = app.account!;
    await vi.waitFor(() => expect(account.status.phase).toBe('idle'));
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() });
    await account.syncNow();
    expect(await account.signOut(true)).toBe('ok');
    expect(calls).toContain('sign-out');
    expect(await repo.listSolves()).toHaveLength(0);
    expect(await repo.listBackups()).toHaveLength(0);
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, signedIn: false });
    expect(app.solves).toHaveLength(0);
    expect(app.sessions.map((s) => s.id)).toEqual([defaultSessionId('333')]);
    expect(account.signedIn).toBe(false);
    expect(account.status.phase).toBe('off');
  });

  it('sair de todos os aparelhos sem rede: continua dentro, e o sync segue', async () => {
    const { auth, state } = fakeAuth();
    const net = fakeApi(new FakeServer());
    const { app, repo } = await appWithAccount(net.api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    state.revokeOk = false;
    expect(await app.account!.signOutEverywhere()).toBe(false);
    expect(app.account!.signedIn).toBe(true);
    const syncs = vi.spyOn(net.api, 'sync');
    await app.account!.syncNow();
    expect(syncs).toHaveBeenCalled();
    state.revokeOk = true;
    expect(await app.account!.signOutEverywhere()).toBe(true);
    expect(app.account!.signedIn).toBe(false);
    expect((await repo.getSyncState()).accountId).toBe('conta-1');
  });
});

describe('passkeys e a sessão', () => {
  it('criar marca o aparelho e relê a lista; remover relê a lista', async () => {
    const { auth } = fakeAuth();
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    const account = app.account!;
    expect(account.passkeys).toBeNull();
    await account.loadPasskeys();
    expect(account.passkeys).toEqual([]);
    expect(await account.addPasskey()).toBe(true);
    expect(account.passkeys).toHaveLength(1);
    expect((await repo.getSyncState()).passkey).toBe(true);
    expect(await account.removePasskey('pk1')).toBe(true);
    expect(account.passkeys).toEqual([]);
    expect(await account.signOut(false)).toBe('ok');
    expect(account.passkeys).toBeNull(); // a lista é da conta: entrar de novo relê
  });

  it('aberto numa conta, renova a sessão uma vez (spec 7.3: o cookie só renova por get-session); sem conta, nada sai', async () => {
    const api = fakeApi(new FakeServer()).api;
    const inside = fakeAuth();
    await appWithAccount(api, { signedIn: true, auth: inside.auth });
    await vi.waitFor(() => expect(inside.calls).toContain('get-session'));
    const outside = fakeAuth();
    await appWithAccount(api, { auth: outside.auth });
    const off = fakeAuth();
    await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api, { signedIn: true, auth: off.auth });
    await sleep(20);
    expect(inside.calls.filter((c) => c === 'get-session')).toHaveLength(1);
    expect(outside.calls).toEqual([]);
    expect(off.calls).toEqual([]);
  });

  it('a renovação que falha não muda nada aqui', async () => {
    const { auth, calls, state } = fakeAuth();
    state.renew = new Error('sem rede');
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(calls).toContain('get-session'));
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(app.account!.signedIn).toBe(true);
  });
});
