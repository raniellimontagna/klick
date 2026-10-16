// O motor do sync no app (spec 6): manda a fila em lotes, recebe o que mudou desde o cursor, junta pelo repositório e repete enquanto
// houver fila ou `more`. Cada lote avança o cursor: um sync que cai no meio continua de onde parou. Nunca roda com o timer ocupado.
// Uma rodada por vez: quem pede durante uma rodada ganha mais uma, logo depois dela (decisão 20). Depois de um 401, nenhuma rodada sai até
// a conta voltar (resume ou firstLogin): sem um pedido por gatilho.
import { SYNC_BATCH, SYNC_PROTOCOL, type Change } from '../core/sync/types';
import { AccountChangedError, type Repository } from '../data/repository';
import { ApiError, type SyncApi } from './api';

export const RETRY_MS: readonly number[] = Object.freeze([5_000, 30_000, 120_000, 300_000]); // spec 6.6: 5 s, 30 s, 2 min e então a cada 5 min
export const MASS_DELETE = 50; // spec 6.6: um lote que apaga isso ou mais pede uma cópia local antes
const BUSY_POLL_MS = 1000;
const MAX_EXCHANGES = 100_000; // trava de um laço que não termina (a fila que nunca esvazia, a conta que nunca acaba): 50 milhões de mudanças

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
// venceria toda edição dos outros enquanto ele estivesse à frente. De cada resposta sai quanto este aparelho está adiantado:
// offset = min(0, serverTime − a hora em que o pedido saiu). A hora do servidor é de depois da saída, então um relógio certo dá 0 com
// qualquer latência. O repositório tira as datas de `now()` (createRepository({ now: clock.now })): o aparelho adiantado grava na hora
// do servidor. O atrasado não muda (offset 0): o relógio do sync (spec 5.4) já o segura. O offset vive só na memória: até a primeira
// resposta depois de abrir, as datas são as do aparelho.
export interface ServerClock {
  now(): number; // a hora do aparelho mais o offset
  offset(): number;
  send(): (serverTime: number) => void; // marca a saída de um pedido; a função devolvida recebe a hora da resposta
}

export function createServerClock(device: () => number = () => Date.now()): ServerClock {
  let offset = 0;
  return {
    now: () => device() + offset,
    offset: () => offset,
    send() {
      const sentAt = device();
      return (serverTime) => {
        if (!Number.isSafeInteger(serverTime) || serverTime <= 0) return; // uma resposta sem hora não mexe no relógio
        offset = Math.min(0, serverTime - sentAt);
      };
    },
  };
}

export interface EngineDeps {
  repo: () => Repository; // o repositório atual (o AppState troca a conexão quando o iOS a derruba)
  api: Pick<SyncApi, 'sync'>;
  backup: () => Promise<void>; // a cópia local 'pre-sync' (spec 6.5 e 6.6)
  now?: () => number; // o relógio do aparelho, para lastSyncAt
  clock?: Pick<ServerClock, 'send'>; // recebe a hora de cada resposta (o mesmo que dá o `now` do repositório)
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
  run(): Promise<SyncStatus>; // parado (stop) ou depois de um 401, devolve o estado sem rodar
  // O primeiro login neste aparelho (spec 6.5), ou juntar à conta nova (spec 7.6): cópia 'pre-sync', tudo na fila, baixa a conta inteira,
  // deduplica e só então sobe. Se o app fechar no meio, a próxima rodada continua (firstSync). A mesma conta já gravada não recomeça nada.
  // Tira o motor do stop() e do 401.
  firstLogin(account: Account): Promise<SyncStatus>;
  status(): SyncStatus;
  // Para o motor: cancela a nova tentativa agendada e o primeiro login que ainda não começou, e resolve quando o pedido em andamento voltou
  // e foi juntado: a rodada para ali ('off', sem nova tentativa), e um primeiro sync em lotes continua depois, de onde parou. Uma rodada que
  // espera o timer (um solve, o treino) não o espera mais: para na hora, e uma volta que esperava o solve fica para a próxima. Depois disso
  // nenhuma rodada começa, nem pelos gatilhos, até resume() ou firstLogin(); um deles pedido durante a espera a encerra (a rodada dele não é
  // esperada). Sair da conta e apagar os dados (Task 15) espera o stop() antes de auth.signOut e de wipeData: senão a rodada em andamento,
  // que já confirmou a fila, juntaria a volta do servidor no banco recém-apagado, e o primeiro login seguinte, em qualquer conta, subiria
  // esses registros para ela. O repositório confere a conta de novo dentro da transação que junta (applyRemote).
  stop(): Promise<void>;
  resume(): void; // volta a aceitar rodadas (a mesma conta que entra de novo, também depois de um 401)
}

const defaultSchedule = (fn: () => void, ms: number): (() => void) => {
  const h = setTimeout(fn, ms);
  return () => clearTimeout(h);
};

// O lote tem alguma exclusão? Só um lote assim pode apagar solves daqui (a cascata parte de uma sessão excluída).
const hasDeletion = (changes: readonly Change[]): boolean => changes.some((c) => (c as Partial<Change> | null)?.deletedAt !== null);

// Uma rodada que não pode continuar por algo do servidor que não é um código HTTP (o cursor parado, um laço sem fim): erro do servidor e
// nova tentativa. A mensagem vai para o log: só contagens e cursores.
class RoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoundError';
  }
}

// stop() no meio da rodada: ela para entre um pedido e outro, sem nova tentativa.
class Paused extends Error {
  constructor() {
    super('o motor parou no meio da rodada');
    this.name = 'Paused';
  }
}

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
  let paused = false;
  let authFailed = false; // a última rodada recebeu 401: nenhuma rodada até resume() ou firstLogin()
  let login: Account | null = null; // o primeiro login pedido cujo começo (a cópia e a fila) ainda não aconteceu
  let refused = 0;
  let missing = 0;

  function set(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch, refused, missing };
    deps.onStatus?.(status);
  }

  // Espera o timer parar (spec 6.2). Parado (stop) com o timer ainda ocupado, não espera mais e devolve false: sair da conta não fica preso
  // a um solve (ou ao treino) que não acaba.
  async function waitIdle(): Promise<boolean> {
    while (deps.busy?.()) {
      if (paused) return false;
      await sleep(BUSY_POLL_MS);
    }
    return true;
  }

  // Antes de cada passo da rodada: espera o timer e, parado (stop), a rodada para ali, sem pedir nem gravar nada.
  async function idle(): Promise<void> {
    if (!(await waitIdle()) || paused) throw new Paused();
  }

  // A conta da rodada continua aqui, dentro? Senão, nada da volta pode ser gravado (nem a fila confirmada): o banco pode ter acabado de ser
  // apagado, e o que entrasse nele sem conta subiria no próximo primeiro login, para qualquer conta.
  const isAccount = (state: { accountId: string | null; signedIn: boolean }, accountId: string): boolean =>
    state.accountId === accountId && state.signedIn;
  async function sameAccount(accountId: string): Promise<void> {
    if (!isAccount(await deps.repo().getSyncState(), accountId)) throw new AccountChangedError();
  }

  // Um pedido: manda até SYNC_BATCH da fila (ou nada, só recebendo) e junta a volta. A ordem conta: o que subiu sai da fila antes de juntar
  // a volta (a temporada que acabou de subir adota o que o servidor decidiu, em vez de ficar "na fila" e divergir), e a cópia local vem
  // antes de juntar um lote que apaga MASS_DELETE solves daqui ou mais, contando a cascata (spec 6.6). `accountId` é a conta de quando a
  // rodada começou: um pedido não sai com o cursor de outra conta, e a volta só entra nela.
  async function exchange(push: boolean, accountId: string): Promise<{ more: boolean; sent: number; received: number }> {
    await idle();
    const [state, meta] = await Promise.all([deps.repo().getSyncState(), deps.repo().getMeta()]);
    if (!isAccount(state, accountId)) throw new AccountChangedError();
    const batch = push ? await deps.repo().outboxBatch(SYNC_BATCH) : { changes: [], sent: [], refused: 0, missing: 0 };
    refused += batch.refused;
    missing += batch.missing;
    const answered = deps.clock?.send();
    const res = await deps.api.sync({ v: SYNC_PROTOCOL, deviceId: meta.deviceId, cursor: state.cursor, clock: state.clock, changes: batch.changes });
    answered?.(res.serverTime);
    await sameAccount(accountId);
    if (res.more && res.cursor <= state.cursor) throw new RoundError(`o servidor mandou mais sem avançar o cursor (${res.cursor})`);
    await deps.repo().confirmSent(batch.sent);
    refused += res.rejected.length;
    for (const r of res.rejected) log(`sync: o servidor recusou ${r.store}/${r.id} (${r.reason})`);
    // A resposta chegou durante um solve: junta depois dele. Parado sem solve, junta (o stop() espera o pedido em andamento voltar e ser
    // juntado). Parado com a volta esperando o solve, não espera mais: a volta não é juntada nem o cursor anda (a próxima rodada a recebe de
    // novo); o que subiu já saiu da fila, e o servidor o tem.
    if (!(await waitIdle())) throw new Paused();
    if (hasDeletion(res.changes) && (await deps.repo().countRemoteDeletions(res.changes)) >= MASS_DELETE) await deps.backup();
    await sameAccount(accountId); // de novo: a espera e a cópia levam tempo
    // O repositório confere a conta dentro da transação (outra aba) e grava o cursor nela: juntar e andar o cursor acontecem juntos ou não.
    // O relógio sobe até a hora do servidor ali também.
    await deps.repo().applyRemote(res.changes, res.serverTime, accountId, { cursor: res.cursor, lastSyncAt: now() });
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
      // A transação que põe tudo na fila é grande: não cai num solve que começou durante a cópia. Parado durante a cópia, o primeiro login não
      // começa.
      await idle();
      refused += await deps.repo().beginFirstSync(account);
    } else if (!state.signedIn || state.email !== account.email) {
      await deps.repo().saveSyncState({ signedIn: true, email: account.email });
    }
    if (login === account) login = null;
  }

  async function round(): Promise<void> {
    await idle();
    if (login) await begin(login);
    const state = await deps.repo().getSyncState();
    if (!state.signedIn || state.accountId === null) {
      set({ ...idleStatus(), pending: await deps.repo().outboxCount() });
      return;
    }
    const accountId = state.accountId;
    const progress = { sent: 0, total: await deps.repo().outboxCount(), received: 0 };
    set({ phase: 'syncing', progress: { ...progress } });
    if (state.firstSync) {
      for (let i = 0, more = true; more; i++) {
        if (i === MAX_EXCHANGES) throw new RoundError(`o primeiro sync passou de ${MAX_EXCHANGES} pedidos`);
        const r = await exchange(false, accountId); // a conta inteira chega antes de subir qualquer coisa
        progress.received += r.received;
        set({ progress: { ...progress } });
        more = r.more;
      }
      await idle();
      await deps.repo().dedupeFirstLogin(); // desliga firstSync na mesma transação
      progress.total = await deps.repo().outboxCount();
    }
    for (let i = 0; ; i++) {
      if (i === MAX_EXCHANGES) throw new RoundError(`a rodada passou de ${MAX_EXCHANGES} pedidos`);
      const r = await exchange(true, accountId);
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
    if (paused) return;
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
      if (err instanceof Paused) {
        set({ phase: 'off', error: null, pending, progress: null }); // stop(): volta com resume() ou firstLogin()
        return status;
      }
      if (err instanceof AccountChangedError) {
        log('sync: a conta mudou durante a rodada; a resposta foi descartada');
        const state = await deps
          .repo()
          .getSyncState()
          .catch(() => null);
        // Fora da conta (saiu, apagou os dados): parado, como sem conta. Ainda dentro, noutra conta: a nova tentativa relê tudo.
        if (!state?.signedIn || state.accountId === null) {
          set({ ...idleStatus(), pending });
          return status;
        }
      } else if (err instanceof RoundError) log(`sync: ${err.message}`);
      else if (!(err instanceof ApiError)) log(`sync: a rodada falhou (${err instanceof Error ? err.name : typeof err})`);
      const kind = err instanceof ApiError ? err.kind : 'server';
      if (kind === 'offline') set({ phase: 'offline', error: null, pending, progress: null }); // volta com o evento online
      else if (kind === 'auth') {
        authFailed = true; // sem rodada até a conta voltar: o cookie não volta sozinho
        set({ phase: 'error', error: 'auth', pending, progress: null }); // Ajustes pede para entrar de novo
      }
      else if (kind === 'update') set({ phase: 'error', error: 'update', pending, progress: null });
      else {
        set({ phase: 'error', error: 'server', pending, progress: null });
        retryLater();
      }
    }
    return status;
  }

  // Pedido durante uma rodada: mais uma rodada depois dela (uma só, por mais pedidos que cheguem), para nada gravado no meio ficar para trás.
  // Também depois de uma rodada que rejeitou (um ouvinte de onStatus que lançou), senão a rodada a mais ficaria presa a ela.
  function run(): Promise<SyncStatus> {
    if (paused || authFailed) return Promise.resolve(status);
    if (running) {
      const next = (): Promise<SyncStatus> => {
        again = null;
        return run();
      };
      again ??= running.then(next, next);
      return again;
    }
    running = guarded().finally(() => (running = null));
    return running;
  }

  return {
    run,
    firstLogin(account) {
      paused = false;
      authFailed = false;
      login = { accountId: account.accountId, email: account.email }; // a próxima rodada começa por ele (depois da que está em andamento)
      return run();
    },
    status: () => status,
    async stop() {
      paused = true;
      login = null;
      cancelRetry?.();
      cancelRetry = null;
      // Só enquanto parado, e só a rodada em andamento: a rodada a mais (again) roda run() quando ela termina, vê o motor parado e não roda.
      // Um firstLogin() ou resume() durante a espera tira o motor do stop: a rodada dele não é esperada (nem apagada por quem chamou).
      while (paused && running) await running.catch(() => undefined);
    },
    resume() {
      paused = false;
      authFailed = false;
    },
  };
}
