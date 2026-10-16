// Apoio dos testes da conta: um AppState ligado a um servidor falso, com gatilhos e canal falsos. Não é um arquivo de teste.
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { Health, SyncApi } from '../../src/sync/api';
import { createServerClock, type ServerClock } from '../../src/sync/engine';
import type { LocksLike, TriggerEnv } from '../../src/sync/triggers';
import { AppState } from '../../src/ui/state/app.svelte';
import { FakeServer } from './sync-fakes';

let n = 0;

// Os gatilhos falsos: o teste dispara o "5 s depois" (e as novas tentativas do motor, que usam o mesmo schedule) e o resto na mão.
export function manualEnv() {
  const delayed: (() => void)[] = [];
  const env: TriggerEnv = {
    onOnline: () => () => undefined,
    onVisible: () => () => undefined,
    schedule: (fn) => {
      delayed.push(fn);
      return () => {
        const i = delayed.indexOf(fn);
        if (i >= 0) delayed.splice(i, 1);
      };
    },
    every: () => () => undefined,
  };
  return { env, pending: () => delayed.length, fireDelayed: () => delayed.splice(0).forEach((fn) => fn()) };
}

// A API falsa: /api/health e /api/sync, com o servidor falso de uma conta.
export function fakeApi(server: FakeServer, health: Health | null = { accounts: true, turnstileSiteKey: '1x00000000000000000000BB' }) {
  let failure: Error | null = null;
  const api: SyncApi = {
    health: async () => health,
    sync: async (req: SyncRequest): Promise<SyncResponse> => {
      if (failure) throw failure;
      return structuredClone(server.sync(structuredClone(req)));
    },
  };
  return { api, fail: (e: Error | null) => (failure = e) };
}

// Um canal entre "abas" na memória.
export function bus() {
  const members: ChannelLike[] = [];
  return () => {
    const ch: ChannelLike = {
      onmessage: null,
      postMessage(data) {
        for (const m of members) if (m !== ch) m.onmessage?.({ data: structuredClone(data) });
      },
    };
    members.push(ch);
    return ch;
  };
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
  const app = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async () => 'R U' }),
    now,
    storage: null,
    storageManager: null,
    account: { api, clock, env: o.env ?? manualEnv().env, locks: o.locks ?? null, channel: o.channel ?? null },
  });
  await app.init();
  await app.account!.start();
  return { app, repo, clock };
}
