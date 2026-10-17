// Apoio dos testes da conta: um AppState ligado a um servidor falso, com gatilhos e canal falsos. Não é um arquivo de teste.
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { ApiError, type CloudCopy, type Health, type SyncApi } from '../../src/sync/api';
import type { AuthClientLike, PasskeyInfo, SendResult } from '../../src/sync/auth';
import type { Captcha } from '../../src/sync/captcha';
import { createServerClock, type ServerClock } from '../../src/sync/engine';
import type { LocksLike, TriggerEnv } from '../../src/sync/triggers';
import { AppState } from '../../src/ui/state/app.svelte';
import { FakeServer } from './sync-fakes';

let n = 0;

// Os gatilhos falsos: o teste dispara o "5 s depois" (e as novas tentativas e esperas do motor, e o prazo de parar, que usam o mesmo
// schedule), o voltar online e o ficar visível na mão.
export function manualEnv() {
  const delayed: (() => void)[] = [];
  const online = new Set<() => void>();
  const visible = new Set<() => void>();
  const listen = (set: Set<() => void>) => (fn: () => void) => {
    set.add(fn);
    return () => void set.delete(fn);
  };
  const env: TriggerEnv = {
    onOnline: listen(online),
    onVisible: listen(visible),
    schedule: (fn) => {
      delayed.push(fn);
      return () => {
        const i = delayed.indexOf(fn);
        if (i >= 0) delayed.splice(i, 1);
      };
    },
    every: () => () => undefined,
  };
  return {
    env,
    pending: () => delayed.length,
    fireDelayed: () => delayed.splice(0).forEach((fn) => fn()),
    fire: { online: () => [...online].forEach((fn) => fn()), visible: () => [...visible].forEach((fn) => fn()) },
  };
}

// A API falsa: /api/health e /api/sync, com o servidor falso de uma conta, e as cópias na nuvem e o apagar da conta (`cloud` anota o que
// foi restaurado e apagado). Depois de apagada, a conta responde 401 ao sync e às cópias, como o objeto marcado da Task 17.
export function fakeApi(server: FakeServer, health: Health | null = { accounts: true, turnstileSiteKey: '1x00000000000000000000BB' }) {
  let failure: Error | null = null;
  const cloud = { copies: [] as CloudCopy[], restored: [] as string[], deleted: [] as string[] };
  const check = (): void => {
    if (failure) throw failure;
    if (cloud.deleted.length > 0) throw new ApiError('auth', 401);
  };
  const api: SyncApi = {
    health: async () => health,
    sync: async (req: SyncRequest): Promise<SyncResponse> => {
      check();
      return structuredClone(server.sync(structuredClone(req)));
    },
    cloudCopies: async () => {
      check();
      return structuredClone(cloud.copies);
    },
    restoreCloudCopy: async (name) => {
      check();
      cloud.restored.push(name);
    },
    deleteAccount: async (email) => {
      check();
      cloud.deleted.push(email);
    },
  };
  return { api, cloud, fail: (e: Error | null) => (failure = e) };
}

// Duas contas atrás do mesmo cookie, como o Worker as vê: `session.user` é quem tem a sessão agora (null: nenhuma, 401), e cada conta tem
// o próprio servidor falso. `strict`: o servidor confere a conta que o aparelho espera (o `account` do pedido) contra a da sessão e
// responde 401 quando não bate, como o Worker depois da correção C1; sem ele, como antes: o pedido vai para a conta da sessão.
// `signIn(auth)` liga o cliente de login falso à sessão: entrar troca o cookie, e sair o apaga.
export function twoAccounts(strict = true) {
  const servers = new Map<string, FakeServer>([
    ['conta-1', new FakeServer()],
    ['conta-2', new FakeServer()],
  ]);
  const session = { user: null as string | null };
  const requests: SyncRequest[] = [];
  const api: SyncApi = {
    ...fakeApi(new FakeServer()).api,
    sync: async (req: SyncRequest): Promise<SyncResponse> => {
      requests.push(structuredClone(req));
      const user = session.user;
      if (user === null || (strict && req.account !== user)) throw new ApiError('auth', 401);
      return structuredClone(servers.get(user)!.sync(structuredClone(req)));
    },
  };
  const signIn = (auth: AuthClientLike): AuthClientLike => ({
    ...auth,
    async verifyCode(email, code) {
      const result = await auth.verifyCode(email, code);
      if (result.ok) session.user = result.user.id;
      return result;
    },
    async signOut() {
      await auth.signOut();
      session.user = null;
    },
  });
  return { api, servers, session, requests, signIn };
}

// Um canal entre "abas" na memória. `mute(ch)`: a aba daquele canal está suspensa (não recebe nem manda nada); `unmute(ch)`: ela volta.
export function bus() {
  const members: ChannelLike[] = [];
  const muted = new Set<ChannelLike>();
  const make = (): ChannelLike => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage(data) {
        if (muted.has(ch)) return;
        for (const m of members) if (m !== ch && !muted.has(m)) m.onmessage?.({ data: structuredClone(data) });
      },
    };
    members.push(ch);
    return ch;
  };
  return Object.assign(make, { mute: (ch: ChannelLike) => void muted.add(ch), unmute: (ch: ChannelLike) => void muted.delete(ch) });
}

// O cliente de login falso: o código certo é 123456; `user` é quem entra. `state` muda o que ele responde (o envio do código, a passkey
// de entrar, sair de todos os aparelhos, a renovação da sessão); `calls` anota o que foi pedido.
export function fakeAuth(user = { id: 'conta-1', email: 'ranielli@exemplo.com' }) {
  const calls: string[] = [];
  const state = {
    passkeys: [] as PasskeyInfo[],
    send: 'sent' as SendResult,
    passkeyUser: user as { id: string; email: string } | null,
    revokeOk: true,
    renew: null as Error | null,
  };
  const auth: AuthClientLike = {
    async sendCode(email, token) {
      calls.push(`send:${email}:${token}`);
      return state.send;
    },
    async verifyCode(email, code) {
      calls.push(`verify:${email}:${code}`);
      return code === '123456' ? { ok: true, user } : { ok: false, reason: 'bad-code' };
    },
    async passkeySignIn() {
      calls.push('passkey-sign-in');
      return state.passkeyUser;
    },
    async addPasskey() {
      calls.push('add-passkey');
      state.passkeys.push({ id: `pk${state.passkeys.length + 1}`, name: null, createdAt: 1_791_500_000_000 });
      return true;
    },
    async listPasskeys() {
      return [...state.passkeys];
    },
    async removePasskey(id) {
      calls.push(`remove-passkey:${id}`);
      state.passkeys = state.passkeys.filter((p) => p.id !== id);
      return true;
    },
    async signOut() {
      calls.push('sign-out');
    },
    async signOutEverywhere() {
      calls.push('sign-out-everywhere');
      return state.revokeOk;
    },
    async renewSession() {
      calls.push('get-session');
      if (state.renew) throw state.renew;
    },
  };
  return { auth, calls, state };
}

export interface AccountOptions {
  now?: () => number; // a hora do aparelho
  signedIn?: boolean; // o aparelho já está na conta 'conta-1' (sem primeiro login)
  sessionFirst?: boolean; // com signedIn: a "Sessão 1" padrão já existe antes de entrar (não vai para a fila, nem mexe no relógio)
  env?: TriggerEnv;
  repo?: Repository;
  clock?: ServerClock;
  locks?: LocksLike | null;
  channel?: ChannelLike | null;
  auth?: AuthClientLike; // o cliente de login (padrão: um fakeAuth() só desta aba)
  loadAuth?: () => Promise<AuthClientLike>; // no lugar de `auth`: o carregamento do cliente, que pode falhar
  captcha?: Captcha; // o Turnstile (padrão: um falso que devolve `token-de-<site key>`, sem rede)
}

// Um AppState com conta, já com a conta começada (a liderança disputada e /api/health perguntado). O repositório tira as datas do
// relógio do servidor, como em boot.ts.
export async function appWithAccount(api: SyncApi, o: AccountOptions = {}): Promise<{ app: AppState; repo: Repository; clock: ServerClock }> {
  const now = o.now ?? (() => Date.now());
  const clock = o.clock ?? createServerClock(now);
  const repo = o.repo ?? createRepository(await openKlickDb(`conta-${++n}`), { now: clock.now, channel: null });
  if (o.sessionFirst) {
    const session = await repo.createSession({ event: '333', id: defaultSessionId('333') });
    await repo.saveProfile({ currentSessionId: session.id });
  }
  if (o.signedIn) await repo.saveSyncState({ accountId: 'conta-1', email: 'ranielli@exemplo.com', signedIn: true });
  const auth = o.auth ?? fakeAuth().auth;
  const app = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async () => 'R U' }),
    now,
    storage: null,
    storageManager: null,
    account: {
      api,
      clock,
      env: o.env ?? manualEnv().env,
      locks: o.locks ?? null,
      channel: o.channel ?? null,
      auth: o.loadAuth ?? (async () => auth),
      captcha: o.captcha ?? { token: async (siteKey) => `token-de-${siteKey}` },
    },
  });
  await app.init();
  await app.account!.start();
  return { app, repo, clock };
}
