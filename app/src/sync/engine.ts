// O motor do sync no app (spec 6): manda a fila em lotes, recebe o que mudou desde o cursor, junta pelo repositório e repete enquanto
// houver fila ou `more`. Cada lote avança o cursor: um sync que cai no meio continua de onde parou. Nunca roda com o timer ocupado.
// Uma rodada por vez: quem pede durante uma rodada ganha mais uma, logo depois dela (decisão 20).
import { SYNC_BATCH, SYNC_PROTOCOL, type Change } from '../core/sync/types';
import type { Repository } from '../data/repository';
import { ApiError, type SyncApi } from './api';

export const RETRY_MS: readonly number[] = Object.freeze([5_000, 30_000, 120_000, 300_000]); // spec 6.6: 5 s, 30 s, 2 min e então a cada 5 min
export const MASS_DELETE = 50; // spec 6.6: um lote que apaga isso ou mais pede uma cópia local antes
const BUSY_POLL_MS = 1000;
const MAX_EXCHANGES = 100_000; // trava de uma rodada que não termina (fila que nunca esvazia): 50 milhões de mudanças

export type SyncPhase = 'off' | 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatus {
  phase: SyncPhase; // off: sem conta, ou fora da conta
  error: 'server' | 'auth' | 'update' | null; // auth: a sessão expirou (401); update: o servidor pede um app mais novo (426)
  pending: number; // mudanças na fila de saída
  lastSyncAt: number | null;
  progress: { sent: number; total: number; received: number } | null; // durante uma rodada
  // Desde que o motor começou (spec 6.6): mudanças que não foram para a conta e saíram da fila, para a tela poder contar. `refused`: o
  // servidor recusaria (ficaram fora da fila, aqui ou no começo do primeiro login) ou recusou; `missing`: entradas da fila cujo registro
  // não existia mais. O conteúdo nunca sai daqui: só o log local, com store, id e motivo.
  refused: number;
  missing: number;
}

export const idleStatus = (): SyncStatus => ({ phase: 'off', error: null, pending: 0, lastSyncAt: null, progress: null, refused: 0, missing: 0 });

// A hora do servidor (decisão do controlador na Task 8). O servidor não recusa datas no futuro, e um aparelho com o relógio adiantado
// venceria toda edição dos outros enquanto ele estivesse à frente. De cada resposta sai quanto este aparelho está adiantado
// (offset = min(0, serverTime − agora)), e o repositório tira as datas de `now()` (createRepository({ now: clock.now })): o aparelho
// adiantado grava na hora do servidor. O atrasado não muda (offset 0): o relógio do sync (spec 5.4) já o segura. O offset vive só na
// memória: até a primeira resposta depois de abrir, as datas são as do aparelho.
export interface ServerClock {
  now(): number; // a hora do aparelho mais o offset
  offset(): number;
  observe(serverTime: number): void; // a hora de uma resposta do servidor
}

export function createServerClock(device: () => number = () => Date.now()): ServerClock {
  let offset = 0;
  return {
    now: () => device() + offset,
    offset: () => offset,
    observe(serverTime) {
      if (!Number.isSafeInteger(serverTime) || serverTime <= 0) return; // uma resposta sem hora não mexe no relógio
      offset = Math.min(0, serverTime - device());
    },
  };
}

export interface EngineDeps {
  repo: () => Repository; // o repositório atual (o AppState troca a conexão quando o iOS a derruba)
  api: Pick<SyncApi, 'sync'>;
  backup: () => Promise<void>; // a cópia local 'pre-sync' (spec 6.5 e 6.6)
  now?: () => number; // o relógio do aparelho, para lastSyncAt
  clock?: Pick<ServerClock, 'observe'>; // recebe a hora de cada resposta (o mesmo que dá o `now` do repositório)
  busy?: () => boolean; // o timer ou o treino está ocupado: o sync espera (spec 6.2, decisão 14)
  onStatus?: (s: SyncStatus) => void;
  schedule?: (fn: () => void, ms: number) => () => void; // as novas tentativas; devolve o cancelamento
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void; // o log local das mudanças recusadas (spec 6.6): store, id e motivo, nunca o conteúdo
}

export interface Account {
  accountId: string;
  email: string;
}

export interface SyncEngine {
  run(): Promise<SyncStatus>;
  // O primeiro login neste aparelho (spec 6.5), ou juntar à conta nova (spec 7.6): cópia 'pre-sync', tudo na fila, baixa a conta inteira,
  // deduplica e só então sobe. Se o app fechar no meio, a próxima rodada continua (firstSync). A mesma conta já gravada não recomeça nada.
  firstLogin(account: Account): Promise<SyncStatus>;
  status(): SyncStatus;
  stop(): void; // cancela a nova tentativa agendada; a rodada em andamento termina
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

// O lote tem alguma exclusão? Só um lote assim pode apagar solves daqui (a cascata parte de uma sessão excluída).
const hasDeletion = (changes: readonly Change[]): boolean => changes.some((c) => (c as Partial<Change> | null)?.deletedAt !== null);

export function createSyncEngine(deps: EngineDeps): SyncEngine {
  const now = deps.now ?? (() => Date.now());
  const schedule = deps.schedule ?? defaultSchedule;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((line: string) => console.warn(line));
  let status = idleStatus();
  let running: Promise<SyncStatus> | null = null;
  let again: Promise<SyncStatus> | null = null;
  let retries = 0;
  let cancelRetry: (() => void) | null = null;
  let stopped = false;
  let login: Account | null = null; // o primeiro login pedido cujo começo (a cópia e a fila) ainda não aconteceu
  let refused = 0;
  let missing = 0;

  function set(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch, refused, missing };
    deps.onStatus?.(status);
  }

  async function waitIdle(): Promise<void> {
    while (deps.busy?.()) await sleep(BUSY_POLL_MS);
  }

  // Um pedido: manda até SYNC_BATCH da fila (ou nada, só recebendo) e junta a volta. A ordem conta: o que subiu sai da fila antes de juntar
  // a volta (a temporada que acabou de subir adota o que o servidor decidiu, em vez de ficar "na fila" e divergir), e a cópia local vem
  // antes de juntar um lote que apaga MASS_DELETE solves daqui ou mais, contando a cascata (spec 6.6).
  async function exchange(push: boolean): Promise<{ more: boolean; sent: number; received: number }> {
    await waitIdle();
    const [state, meta] = await Promise.all([deps.repo().getSyncState(), deps.repo().getMeta()]);
    const batch = push ? await deps.repo().outboxBatch(SYNC_BATCH) : { changes: [], sent: [], refused: 0, missing: 0 };
    refused += batch.refused;
    missing += batch.missing;
    const res = await deps.api.sync({ v: SYNC_PROTOCOL, deviceId: meta.deviceId, cursor: state.cursor, clock: state.clock, changes: batch.changes });
    deps.clock?.observe(res.serverTime);
    await deps.repo().confirmSent(batch.sent);
    refused += res.rejected.length;
    for (const r of res.rejected) log(`sync: o servidor recusou ${r.store}/${r.id} (${r.reason})`);
    await waitIdle(); // a resposta chegou durante um solve: junta depois dele
    if (hasDeletion(res.changes) && (await deps.repo().countRemoteDeletions(res.changes)) >= MASS_DELETE) await deps.backup();
    await deps.repo().applyRemote(res.changes, res.serverTime);
    await deps.repo().saveSyncState({ cursor: res.cursor, lastSyncAt: now(), clock: res.serverTime });
    return { more: res.more, sent: batch.sent.length, received: res.changes.length };
  }

  // O começo do primeiro login (spec 6.5), dentro da rodada: a cópia 'pre-sync' e, numa transação, o estado da conta com tudo na fila
  // (beginFirstSync). Se a cópia ou a fila falham, nada começou e a nova tentativa recomeça por aqui. A mesma conta já gravada (o primeiro
  // login dela já começou, ou ela volta depois de sair) não ganha cópia nem fila nova: volta a estar dentro, e a rodada continua de onde
  // parou (firstSync) ou sobe o que mudou enquanto esteve fora (decisão 12).
  async function begin(account: Account): Promise<void> {
    const state = await deps.repo().getSyncState();
    if (state.accountId !== account.accountId) {
      await deps.backup();
      refused += await deps.repo().beginFirstSync(account);
    } else if (!state.signedIn || state.email !== account.email) {
      await deps.repo().saveSyncState({ signedIn: true, email: account.email });
    }
    if (login === account) login = null;
  }

  async function round(): Promise<void> {
    await waitIdle();
    if (login) await begin(login);
    const repo = deps.repo();
    const state = await repo.getSyncState();
    if (!state.signedIn || state.accountId === null) {
      set({ ...idleStatus(), pending: await repo.outboxCount() });
      return;
    }
    const progress = { sent: 0, total: await repo.outboxCount(), received: 0 };
    set({ phase: 'syncing', progress: { ...progress } });
    if (state.firstSync) {
      for (let more = true; more; ) {
        const r = await exchange(false); // a conta inteira chega antes de subir qualquer coisa
        progress.received += r.received;
        set({ progress: { ...progress } });
        more = r.more;
      }
      await deps.repo().dedupeFirstLogin(); // desliga firstSync na mesma transação
      progress.total = await deps.repo().outboxCount();
    }
    for (let i = 0; i < MAX_EXCHANGES; i++) {
      const r = await exchange(true);
      const left = await deps.repo().outboxCount();
      progress.sent += r.sent;
      progress.received += r.received;
      progress.total = Math.max(progress.total, progress.sent + left); // o que foi gravado durante a rodada sobe nela
      set({ pending: left, progress: { ...progress } });
      if (!r.more && left === 0) break;
    }
    const after = await deps.repo().getSyncState();
    set({ phase: 'idle', error: null, pending: await deps.repo().outboxCount(), lastSyncAt: after.lastSyncAt, progress: null });
  }

  function retryLater(): void {
    if (stopped) return;
    cancelRetry?.();
    const ms = RETRY_MS[Math.min(retries, RETRY_MS.length - 1)];
    retries += 1;
    cancelRetry = schedule(() => {
      cancelRetry = null;
      void run();
    }, ms);
  }

  async function guarded(): Promise<SyncStatus> {
    cancelRetry?.();
    cancelRetry = null;
    try {
      await round();
      retries = 0;
    } catch (err) {
      const pending = await deps
        .repo()
        .outboxCount()
        .catch(() => status.pending);
      const kind = err instanceof ApiError ? err.kind : 'server';
      if (!(err instanceof ApiError)) log(`sync: a rodada falhou (${err instanceof Error ? err.name : typeof err})`);
      if (kind === 'offline') set({ phase: 'offline', error: null, pending, progress: null }); // volta com o evento online
      else if (kind === 'auth') set({ phase: 'error', error: 'auth', pending, progress: null }); // Ajustes pede para entrar de novo
      else if (kind === 'update') set({ phase: 'error', error: 'update', pending, progress: null });
      else {
        set({ phase: 'error', error: 'server', pending, progress: null });
        retryLater();
      }
    }
    return status;
  }

  // Pedido durante uma rodada: mais uma rodada depois dela (uma só, por mais pedidos que cheguem), para nada gravado no meio ficar para trás.
  function run(): Promise<SyncStatus> {
    if (running) {
      again ??= running.then(() => {
        again = null;
        return run();
      });
      return again;
    }
    running = guarded().finally(() => (running = null));
    return running;
  }

  return {
    run,
    firstLogin(account) {
      login = { accountId: account.accountId, email: account.email }; // a próxima rodada começa por ele (depois da que está em andamento)
      return run();
    },
    status: () => status,
    stop() {
      stopped = true;
      cancelRetry?.();
      cancelRetry = null;
    },
  };
}
