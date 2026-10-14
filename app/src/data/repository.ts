// Repositório: a única porta para o IndexedDB (esquema em db.ts). Nada aqui conhece a tela.
//
// Gravação: toda escrita passa por write(), uma transação 'readwrite' com durability 'strict' que só resolve depois do commit
// (tx.done). Qualquer falha aborta a transação e rejeita a promessa; a fila de gravação conta com isso para manter o solve
// pendente, então nada é engolido. Os avisos (ouvintes locais e canal entre abas) saem só depois do commit.
//
// Invariante: solve ativo => sessão ativa. Um solve ativo sob uma sessão na lixeira continuaria entrando nas contas por evento,
// mas nenhuma lista de sessões mostraria a sessão dele, e o purge a apagaria de vez. Os três caminhos que gravam um solve ativo
// (restoreSolve, addSolve e importAll) devolvem o registro da sessão na mesma transação, e só ele: os outros solves excluídos da
// sessão continuam na lixeira. replaceAll grava o arquivo como veio.
//
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { defaultSettings } from '../core/types';
import type { EventId, Meta, Penalty, Practice, Profile, SeasonRecord, SeasonState, Session, Settings, Solve } from '../core/types';
import { T } from '../strings';
import type { BackupRecord, KlickDB } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'all';
// De onde veio o aviso: 'local' é desta aba (já está na memória de quem gravou); 'remote' é de outra aba (o canal).
export type ChangeOrigin = 'local' | 'remote';
// `solveIds` vem só nos avisos de solves: quais mudaram (gravados, editados, excluídos, restaurados ou apagados de vez). Sem ele (aviso
// de uma versão antiga do app, ou mudança grande demais), quem ouve relê todos os solves.
export type ChangeListener = (kind: ChangeKind, origin: ChangeOrigin, solveIds?: string[]) => void;
// Acima disso o aviso vai sem ids: ler tantos por id já não sai mais barato que reler tudo.
const MAX_NOTIFY_IDS = 500;

// O que o repositório usa de um BroadcastChannel; testes passam um canal falso.
export interface ChannelLike {
  postMessage(data: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close?(): void;
}

export interface NewSolve {
  id?: string; // quem grava dá o id: uma nova tentativa com o mesmo id não duplica (ver addSolve)
  sessionId: string;
  event: EventId;
  ms: number;
  penalty: Penalty;
  at: number;
  scramble: string;
}

export interface KlickExport {
  format: 'klick';
  version: 1;
  exportedAt: number;
  sessions: Session[];
  solves: Solve[];
  profile: ProfilePatch | null; // o export sai completo; o que vem de um arquivo pode faltar campo (quem grava junta com o perfil daqui)
}

export interface ImportReport {
  sessionsAdded: number;
  solvesAdded: number;
  solvesUpdated: number;
  skipped: number;
}

// Alteração do perfil. Os ajustes (e o grupo de sons) podem vir parciais: o repositório junta com o que está gravado dentro
// da própria transação, e duas abas que mudam ajustes diferentes não desfazem uma à outra.
export type ProfilePatch = Omit<Partial<Profile>, 'settings'> & {
  settings?: Partial<Omit<Settings, 'sound'>> & { sound?: Partial<Settings['sound']> };
};

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
  createSession(o: { event: EventId; name?: string }): Promise<Session>; // nome padrão "Sessão N" por evento
  renameSession(id: string, name: string): Promise<void>; // ignora nome vazio
  deleteSession(id: string): Promise<void>; // marca a sessão e os solves dela
  restoreSession(id: string): Promise<void>; // restaura a sessão e os solves excluídos junto
  listSolves(f?: { sessionId?: string; event?: EventId; includeDeleted?: boolean }): Promise<Solve[]>; // ordem crescente de at
  addSolve(s: NewSolve): Promise<Solve>; // se a sessão está na lixeira (outra aba a excluiu), o registro dela volta na mesma transação: avisa solves e depois sessions
  updateSolve(id: string, patch: { penalty?: Penalty; note?: string }): Promise<Solve>;
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>; // devolve o solve; se a sessão dele está na lixeira, devolve também o registro dela (só ele: os outros solves excluídos da sessão continuam na lixeira)
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }>; // o excluído mais recentemente primeiro, sessões e solves
  purgeTrash(olderThanMs: number): Promise<number>; // apaga de vez o excluído antes de now - olderThanMs (no limite exato ainda fica); devolve quantos itens (sessões e solves)
  getProfile(): Promise<Profile>; // padrão se ausente (e não grava o padrão)
  saveProfile(patch: ProfilePatch): Promise<Profile>; // settings faz merge raso, sound faz merge
  // Vira a temporada (spec 5.5) numa transação: só grava se a temporada gravada ainda for fromN. Se outra aba já virou, não grava nem
  // avisa e devolve o perfil gravado.
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>; // mais recente primeiro
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>; // includeDeleted padrão true
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior. Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll)
  replaceAll(data: KlickExport): Promise<void>; // limpa solves, sessões e perfil e grava os do arquivo; a temporada fica a mais adiantada (a daqui ou a do arquivo)
  onChange(fn: ChangeListener): () => void; // mudanças locais e de outras abas, com a origem (e, nos solves, os ids que mudaram)
  getSolves(ids: readonly string[]): Promise<(Solve | undefined)[]>; // vários solves por id numa leitura; o que não existe vem undefined
  // O treino (spec do sub-projeto 4, seção 9.1). Cada escrita avisa 'practice'. A tela só usa update e delete na correção da última.
  addPractice(p: Practice): Promise<Practice>; // pelo id de quem grava: uma nova tentativa com o mesmo id devolve a gravada, sem duplicar
  listPractice(f?: { caseId?: string }): Promise<Practice[]>; // em ordem de at; com caseId, só as daquele caso
  updatePractice(id: string, patch: { ok?: boolean }): Promise<Practice>;
  deletePractice(id: string): Promise<void>;
  close(): void; // fecha a conexão do banco e o canal; depois disso o repositório não responde mais (usado ao trocar pela conexão reaberta)
}

const CHANNEL_NAME = 'klick-data';
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'practice', 'all'];
const TRAIL_LENGTH = 9;

const isChangeKind = (v: unknown): v is ChangeKind => typeof v === 'string' && CHANGE_KINDS.includes(v);

// BroadcastChannel não existe em todo ambiente, e o construtor pode lançar (iframe isolado). Sem canal, só os avisos locais saem.
function defaultChannel(): ChannelLike | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME) as unknown as ChannelLike;
  } catch {
    return null;
  }
}

// onError padrão: o erro sai do repositório e reaparece numa microtask (no navegador, como erro não tratado), sem desfazer
// uma gravação que já foi confirmada. Mesmo padrão do timer.
const rethrowLater = (err: unknown): void =>
  queueMicrotask(() => {
    throw err;
  });

const META_DEFAULTS: Omit<Meta, 'deviceId'> = Object.freeze({
  schemaVersion: 1,
  lastBackupAt: null,
  solvesSinceBackup: 0,
  lastBackupDay: null,
  lastExportAt: null,
  solvesSinceExport: 0,
  lastFolderSaveAt: null,
  solvesSinceFolderSave: 0,
  lastFolderSaveDay: null,
  v1ImportOffered: false,
  persistRequested: false,
  installGuideDismissed: false,
  trailPromptDismissed: false,
});

function defaultProfile(): Profile {
  return {
    settings: defaultSettings(), // cópia mutável: o DEFAULT_SETTINGS é congelado
    trail: Array<boolean>(TRAIL_LENGTH).fill(false),
    finish: 'fosco',
    onboarded: false,
    currentSessionId: null,
    season: defaultSeason(),
    lessonAt: {},
    algChoice: {},
    trainOff: [],
  };
}

// Tira as chaves com undefined: `{ finish: undefined }` não pode apagar o que está gravado.
function definedOnly<O extends object>(o: O | undefined): Partial<O> {
  return Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined)) as Partial<O>;
}

function mergeProfile(base: Profile, patch: ProfilePatch | undefined): Profile {
  const { settings, ...rest } = patch ?? {};
  return {
    ...base,
    ...definedOnly(rest),
    settings: { ...base.settings, ...definedOnly(settings), sound: { ...base.settings.sound, ...definedOnly(settings?.sound) } },
  };
}

// O que está gravado com os padrões por baixo, para um campo que um dia seja acrescentado não aparecer como undefined.
const profileOrDefault = (stored: Profile | undefined): Profile => mergeProfile(defaultProfile(), stored);
const metaOrNew = (stored: Meta | undefined, at: number): Meta =>
  stored ? { ...META_DEFAULTS, ...stored } : { ...META_DEFAULTS, deviceId: newId(at) };

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const bySessionOrder = (a: Session, b: Session): number => a.order - b.order || a.createdAt - b.createdAt || compareText(a.id, b.id);
const bySolveTime = (a: Solve, b: Solve): number => a.at - b.at || compareText(a.id, b.id);
const byPracticeTime = (a: Practice, b: Practice): number => a.at - b.at || compareText(a.id, b.id);
const newestDeletedFirst = (a: { id: string; deletedAt: number | null }, b: { id: string; deletedAt: number | null }): number =>
  (b.deletedAt ?? 0) - (a.deletedAt ?? 0) || compareText(a.id, b.id);

// Faixa de um índice composto [chave, at]: todos os `at` daquela chave.
const keyRange = (key: string): IDBKeyRange => IDBKeyRange.bound([key, -Infinity], [key, Infinity]);

// Dispara os pedidos de uma vez (dentro da transação o IndexedDB os executa em ordem) e espera todos. Se um deles lançar na
// hora (DataCloneError, por exemplo), os que já saíram são dados como tratados: a transação vai abortar, eles falhariam e
// ninguém estaria ouvindo.
async function each<V>(items: readonly V[], request: (item: V) => Promise<unknown>): Promise<void> {
  const pending: Promise<unknown>[] = [];
  try {
    for (const item of items) pending.push(request(item));
  } catch (err) {
    void Promise.allSettled(pending);
    throw err;
  }
  await Promise.all(pending);
}

// O que reviveSession usa da store de sessões, dentro de uma transação de escrita.
type SessionStore = Pick<IDBPObjectStore<KlickDB, StoreNames<KlickDB>[], 'sessions', 'readwrite'>, 'get' | 'put'>;

// Mantém o invariante (ver o topo do arquivo) quando a transação grava um solve ativo: se a sessão dele está na lixeira, devolve o
// registro dela, e só ele. Diz se a sessão voltou. Um sessionId que não é string nem é consultado: uma chave inválida lança
// DataError no IndexedDB e desfaria a gravação do próprio solve, que não pode se perder por isso.
async function reviveSession(sessions: SessionStore, sessionId: unknown, at: number): Promise<boolean> {
  if (typeof sessionId !== 'string') return false;
  const session = await sessions.get(sessionId);
  if (!session || session.deletedAt === null) return false;
  await sessions.put({ ...session, deletedAt: null, updatedAt: at });
  return true;
}

// Quem assina os avisos entre abas: um id e uma sequência que sobe de um em um. A página cria um e o passa a cada conexão que abre
// (boot.ts): uma reabertura continua a mesma sequência, e a outra aba não confunde a reabertura com um remetente novo.
export interface ChangeSender {
  id: string;
  next(): number;
}

export function createSender(now: () => number = () => Date.now()): ChangeSender {
  const id = newId(now());
  let seq = 0;
  return { id, next: () => ++seq };
}

export function createRepository(
  db: IDBPDatabase<KlickDB>,
  {
    now = () => Date.now(),
    channel = defaultChannel(),
    onError = rethrowLater,
    sender = createSender(now),
  }: {
    now?: () => number;
    sender?: ChangeSender; // omitido: um só desta conexão
    channel?: ChannelLike | null; // omitido: BroadcastChannel('klick-data') se o ambiente tiver; null: sem canal
    onError?: (err: unknown) => void; // erro de um ouvinte ou do envio ao canal; a gravação já foi confirmada. Se ele lançar, o erro sai por relançar-depois
  } = {},
): Repository {
  const listeners = new Set<{ fn: ChangeListener }>();
  let closed = false; // depois de close(), os ouvintes daqui não recebem mais nada
  let channelClosed = false; // o canal fecha depois do close(), quando as gravações em andamento terminarem e avisarem
  let inflight = 0; // gravações em andamento (de write): o canal espera por elas
  // Cada aviso leva quem enviou e um número em sequência: quem ouve percebe um aviso perdido (um número pulado) e relê tudo.
  const lastSeq = new Map<string, number>();
  function post(message: { kind: ChangeKind; solveIds?: string[] }): void {
    if (channelClosed || !channel) return;
    try {
      channel.postMessage({ ...message, from: sender.id, seq: sender.next() });
    } catch (err) {
      reportError(err);
    }
  }
  // Fecha o canal numa tarefa seguinte: o aviso de uma gravação que acabou de terminar sai antes (ele vem logo depois do commit).
  function closeChannelSoon(): void {
    setTimeout(() => {
      if (channelClosed || inflight > 0) return;
      channelClosed = true;
      if (channel) channel.onmessage = null;
      channel?.close?.();
    }, 0);
  }

  // O onError é de quem usa o repositório. Se ele mesmo lançar, o erro não pode rejeitar uma gravação já confirmada (a fila
  // gravaria de novo e duplicaria o solve): o erro que ele recebia e o que ele lançou saem juntos pelo relançar-depois.
  function reportError(err: unknown): void {
    try {
      onError(err);
    } catch (failure) {
      rethrowLater(new AggregateError([err, failure], 'onError lançou ao receber um erro'));
    }
  }

  function emit(kind: ChangeKind, origin: ChangeOrigin, solveIds?: string[]): void {
    for (const entry of [...listeners]) {
      if (!listeners.has(entry)) continue; // saiu durante este aviso
      try {
        entry.fn(kind, origin, solveIds);
      } catch (err) {
        reportError(err);
      }
    }
  }

  // Só depois do commit. Aviso que chega de outra aba vai aos ouvintes daqui e não volta ao canal.
  function announce(...kinds: ChangeKind[]): void {
    for (const kind of kinds) {
      if (!closed) emit(kind, 'local');
      post({ kind });
    }
  }

  // O aviso de solves, com os ids que mudaram (até MAX_NOTIFY_IDS; acima disso vai sem, e quem ouve relê tudo).
  function announceSolves(ids: readonly string[]): void {
    const solveIds = ids.length <= MAX_NOTIFY_IDS ? [...ids] : undefined;
    if (!closed) emit('solves', 'local', solveIds);
    post(solveIds ? { kind: 'solves', solveIds } : { kind: 'solves' });
  }

  if (channel) {
    channel.onmessage = (ev) => {
      const data = ev?.data as { kind?: unknown; solveIds?: unknown; from?: unknown; seq?: unknown } | null | undefined;
      const kind = data?.kind;
      if (!isChangeKind(kind)) return;
      // O próprio remetente: a conexão velha desta mesma aba terminando uma gravação. O que ela gravou esta aba já tem na memória.
      if (data?.from === sender.id) return;
      // Um número pulado de quem enviou: algum aviso se perdeu, então tudo é relido (o 'all' cobre este aviso também).
      if (typeof data?.from === 'string' && typeof data.seq === 'number') {
        const prev = lastSeq.get(data.from);
        lastSeq.set(data.from, data.seq);
        if (prev !== undefined && data.seq !== prev + 1) {
          emit('all', 'remote');
          return;
        }
      }
      const ids = data?.solveIds;
      const solveIds = kind === 'solves' && Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? (ids as string[]) : undefined;
      emit(kind, 'remote', solveIds);
    };
  }

  async function write<S extends StoreNames<KlickDB>[], R>(
    stores: S,
    work: (tx: IDBPTransaction<KlickDB, S, 'readwrite'>) => Promise<R>,
  ): Promise<R> {
    const tx = db.transaction(stores, 'readwrite', { durability: 'strict' });
    inflight += 1;
    try {
      const result = await work(tx);
      await tx.done;
      return result;
    } catch (err) {
      try {
        tx.abort(); // erro que não veio do IndexedDB deixaria a transação confirmar o que já pediu
      } catch {
        // a transação já terminou
      }
      tx.done.catch(() => {}); // o abort faz o tx.done rejeitar; quem recebe o erro é o chamador
      throw err;
    } finally {
      inflight -= 1;
      if (closed && inflight === 0) closeChannelSoon();
    }
  }

  // O mesmo para leituras de mais de uma store que precisam vir do mesmo instante.
  async function read<S extends StoreNames<KlickDB>[], R>(
    stores: S,
    work: (tx: IDBPTransaction<KlickDB, S, 'readonly'>) => Promise<R>,
  ): Promise<R> {
    const tx = db.transaction(stores);
    try {
      const result = await work(tx);
      await tx.done;
      return result;
    } catch (err) {
      tx.done.catch(() => {});
      throw err;
    }
  }

  // Lê o solve, deixa `change` montar o novo (ou null se nada muda) e grava, tudo numa transação.
  async function changeSolve(id: string, change: (solve: Solve, at: number) => Solve | null): Promise<Solve> {
    const { solve, changed } = await write(['solves'], async (tx) => {
      const store = tx.objectStore('solves');
      const current = await store.get(id);
      if (!current) throw new Error(`Solve não encontrado: ${id}`);
      const next = change(current, now());
      if (next) await store.put(next);
      return { solve: next ?? current, changed: next !== null };
    });
    if (changed) announceSolves([id]);
    return solve;
  }

  return {
    async listSessions({ includeDeleted = false } = {}) {
      const all = await db.getAll('sessions');
      return all.filter((s) => includeDeleted || s.deletedAt === null).sort(bySessionOrder);
    },

    async createSession({ event, name }) {
      const session = await write(['sessions'], async (tx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const at = now();
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: Session = {
          id: newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
          order: Math.max(-1, ...all.map((s) => s.order)) + 1,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
        };
        await store.add(created);
        return created;
      });
      announce('sessions');
      return session;
    },

    async renameSession(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const changed = await write(['sessions'], async (tx) => {
        const store = tx.objectStore('sessions');
        const session = await store.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.name === trimmed) return false;
        await store.put({ ...session, name: trimmed, updatedAt: now() });
        return true;
      });
      if (changed) announce('sessions');
    },

    async deleteSession(id) {
      const touched = await write(['sessions', 'solves'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt !== null) return null;
        const at = now();
        await sessions.put({ ...session, deletedAt: at, updatedAt: at });
        // Os solves já excluídos antes ficam com a marca antiga, para restoreSession não trazê-los de volta.
        const solves = tx.objectStore('solves');
        const live = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === null);
        await each(live, (s) => solves.put({ ...s, deletedAt: at, updatedAt: at }));
        return live.map((s) => s.id);
      });
      if (touched === null) return;
      announce('sessions');
      if (touched.length > 0) announceSolves(touched);
    },

    async restoreSession(id) {
      const touched = await write(['sessions', 'solves'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt === null) return null;
        const at = now();
        await sessions.put({ ...session, deletedAt: null, updatedAt: at });
        // Volta só o que saiu junto com a sessão: os solves com a mesma marca de exclusão.
        const solves = tx.objectStore('solves');
        const together = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === session.deletedAt);
        await each(together, (s) => solves.put({ ...s, deletedAt: null, updatedAt: at }));
        return together.map((s) => s.id);
      });
      if (touched === null) return;
      announce('sessions');
      if (touched.length > 0) announceSolves(touched);
    },

    async listSolves({ sessionId, event, includeDeleted = false } = {}) {
      let list: Solve[];
      if (sessionId !== undefined) {
        list = await db.getAllFromIndex('solves', 'bySession', keyRange(sessionId));
        if (event !== undefined) list = list.filter((s) => s.event === event);
      } else if (event !== undefined) {
        list = await db.getAllFromIndex('solves', 'byEvent', keyRange(event));
      } else {
        list = (await db.getAll('solves')).sort(bySolveTime);
      }
      return includeDeleted ? list : list.filter((s) => s.deletedAt === null);
    },

    async addSolve(s) {
      const stamp = now();
      const id = s.id ?? newId(stamp);
      const { solve, sessionBack } = await write(['solves', 'sessions'], async (tx) => {
        const solves = tx.objectStore('solves');
        // Um id já gravado é o mesmo solve: a repetição não escreve nada. Uma tentativa atrasada não pode desfazer uma edição
        // feita depois (penalidade, nota). O que já está gravado vale.
        const stored = await solves.get(id);
        const solve: Solve = stored ?? {
          id,
          sessionId: s.sessionId,
          event: s.event,
          ms: s.ms,
          penalty: s.penalty,
          at: s.at,
          scramble: s.scramble,
          note: '',
          createdAt: stamp,
          updatedAt: stamp,
          deletedAt: null,
        };
        if (stored === undefined) await solves.put(solve);
        // Uma aba que ainda mostra uma sessão que outra aba excluiu: o solve não se perde nem fica escondido, e a sessão volta.
        // Só solve ativo pede a sessão ativa (o invariante do topo).
        const back = solve.deletedAt === null && (await reviveSession(tx.objectStore('sessions'), solve.sessionId, stamp));
        return { solve, sessionBack: back };
      });
      announceSolves([solve.id]);
      if (sessionBack) announce('sessions');
      return solve;
    },

    updateSolve(id, patch) {
      return changeSolve(id, (solve, at) => {
        if (patch.penalty === undefined && patch.note === undefined) return null;
        return {
          ...solve,
          penalty: patch.penalty === undefined ? solve.penalty : patch.penalty,
          note: patch.note ?? solve.note,
          updatedAt: at,
        };
      });
    },

    async deleteSolve(id) {
      await changeSolve(id, (solve, at) => (solve.deletedAt === null ? { ...solve, deletedAt: at, updatedAt: at } : null));
    },

    async restoreSolve(id) {
      const restored = await write(['solves', 'sessions'], async (tx) => {
        const solves = tx.objectStore('solves');
        const solve = await solves.get(id);
        if (!solve) throw new Error(`Solve não encontrado: ${id}`);
        if (solve.deletedAt === null) return null;
        const at = now();
        await solves.put({ ...solve, deletedAt: null, updatedAt: at });
        // Invariante: o solve volta ativo, então a sessão dele, se estiver na lixeira, volta junto: só o registro dela. Os outros
        // solves excluídos da sessão continuam na lixeira e voltam um a um.
        return { session: await reviveSession(tx.objectStore('sessions'), solve.sessionId, at) };
      });
      if (restored === null) return;
      announceSolves([id]);
      if (restored.session) announce('sessions');
    },

    async getSolves(ids) {
      return read(['solves'], (tx) => {
        const store = tx.objectStore('solves');
        return Promise.all(ids.map((id) => store.get(id)));
      });
    },

    async listTrash() {
      const [sessions, solves] = await read(['sessions', 'solves'], (tx) =>
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll()]),
      );
      return {
        sessions: sessions.filter((s) => s.deletedAt !== null).sort(newestDeletedFirst),
        solves: solves.filter((s) => s.deletedAt !== null).sort(newestDeletedFirst),
      };
    },

    async purgeTrash(olderThanMs) {
      const limit = now() - olderThanMs;
      const expired = ({ deletedAt }: { deletedAt: number | null }) => deletedAt !== null && deletedAt < limit;
      const removed = await write(['sessions', 'solves'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const oldSessions = (await sessions.getAll()).filter(expired);
        const oldSolves = (await solves.getAll()).filter(expired);
        await each(oldSessions, (s) => sessions.delete(s.id));
        await each(oldSolves, (s) => solves.delete(s.id));
        return { sessions: oldSessions.length, solves: oldSolves.map((s) => s.id) };
      });
      if (removed.solves.length > 0) announceSolves(removed.solves);
      if (removed.sessions > 0) announce('sessions');
      return removed.sessions + removed.solves.length;
    },

    async getProfile() {
      return profileOrDefault(await db.get('profile', 'current'));
    },

    async saveProfile(patch) {
      const profile = await write(['profile'], async (tx) => {
        const store = tx.objectStore('profile');
        const merged = mergeProfile(profileOrDefault(await store.get('current')), patch);
        await store.put(merged, 'current');
        return merged;
      });
      announce('profile');
      return structuredClone(profile); // a trilha do patch não fica compartilhada com quem recebe o perfil
    },

    async advanceSeason(fromN, record, next) {
      const outcome = await write(['profile'], async (tx) => {
        const store = tx.objectStore('profile');
        const base = profileOrDefault(await store.get('current'));
        if (base.season.current.n !== fromN) return { profile: base, saved: false };
        const advanced: Profile = { ...base, season: { current: next, past: [...base.season.past, record] } };
        await store.put(advanced, 'current');
        return { profile: advanced, saved: true };
      });
      if (outcome.saved) announce('profile');
      return structuredClone(outcome.profile);
    },

    async getMeta() {
      const stored = (await db.get('meta', 'current')) as Meta | undefined;
      if (stored) return metaOrNew(stored, now());
      // Sem meta: cria e grava já, para o deviceId não mudar a cada leitura. Dentro da transação lê de novo, porque outra aba
      // pode ter criado entre a leitura e aqui. Criar o padrão não é mudança que outra aba precise saber: sem aviso.
      return write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const existing = (await store.get('current')) as Meta | undefined;
        const meta = metaOrNew(existing, now());
        if (!existing) await store.put(meta, 'current');
        return meta;
      });
    },

    async saveMeta(patch) {
      const meta = await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const merged: Meta = { ...metaOrNew((await store.get('current')) as Meta | undefined, now()), ...definedOnly(patch) };
        await store.put(merged, 'current');
        return merged;
      });
      announce('meta');
      return meta;
    },

    async getFolderHandle() {
      return (await db.get('meta', 'folderHandle')) ?? null;
    },

    async saveFolderHandle(handle) {
      await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        if (handle == null) await store.delete('folderHandle');
        else await store.put(handle as FileSystemDirectoryHandle, 'folderHandle');
      });
      announce('meta');
    },

    async saveBackup(record) {
      await write(['backups'], async (tx) => {
        await tx.objectStore('backups').put(record);
      });
    },

    async listBackups() {
      return (await db.getAllFromIndex('backups', 'byCreated')).reverse();
    },

    async getBackup(id) {
      return db.get('backups', id);
    },

    async deleteBackup(id) {
      await write(['backups'], async (tx) => {
        await tx.objectStore('backups').delete(id);
      });
    },

    async exportAll({ includeDeleted = true } = {}) {
      // Uma transação só, para sessões, solves e perfil virem do mesmo instante.
      const [sessions, solves, profile] = await read(['sessions', 'solves', 'profile'], (tx) =>
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll(), tx.objectStore('profile').get('current')]),
      );
      const kept = <V extends { deletedAt: number | null }>(list: V[]): V[] => (includeDeleted ? list : list.filter((x) => x.deletedAt === null));
      return {
        format: 'klick',
        version: 1,
        exportedAt: now(),
        sessions: kept(sessions).sort(bySessionOrder),
        solves: kept(solves).sort(bySolveTime),
        profile: profile ? profileOrDefault(profile) : null,
      };
    },

    async importAll(data) {
      const report: ImportReport = { sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 };
      const outcome = await write(['sessions', 'solves', 'profile'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const profile = tx.objectStore('profile');

        // Sessão que já existe fica como está (e não conta); só entram as novas.
        const knownSessions = new Set(await sessions.getAllKeys());
        const newSessions: Session[] = [];
        for (const s of data.sessions) {
          if (knownSessions.has(s.id)) continue;
          knownSessions.add(s.id);
          newSessions.push(s);
        }
        report.sessionsAdded = newSessions.length;
        await each(newSessions, (s) => sessions.put(s));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado.
        const knownSolves = new Map<string, number>();
        for (const s of await solves.getAll()) knownSolves.set(s.id, s.updatedAt);
        const incoming: Solve[] = [];
        for (const s of data.solves) {
          const have = knownSolves.get(s.id);
          if (have === undefined) report.solvesAdded++;
          else if (s.updatedAt > have) report.solvesUpdated++;
          else {
            report.skipped++;
            continue;
          }
          knownSolves.set(s.id, s.updatedAt);
          incoming.push(s);
        }
        await each(incoming, (s) => solves.put(s));

        // Invariante: solve ativo que chegou do arquivo não pode ficar sob uma sessão na lixeira (a daqui, por exemplo, que foi
        // excluída): ela volta, só o registro dela. Isso não entra no relatório.
        const at = now();
        let sessionBack = false;
        for (const id of new Set(incoming.filter((s) => s.deletedAt === null).map((s) => s.sessionId))) {
          if (await reviveSession(sessions, id, at)) sessionBack = true;
        }

        // O perfil do arquivo vale por cima do daqui: os ajustes e o acabamento são os do arquivo, a trilha soma as duas (nada
        // desmarca) e o tour feito num dos dois fica feito. A sessão atual passa a ser a do arquivo só quando a daqui não tem solve
        // nenhum (o aparelho novo) e a de lá existe fora da lixeira. Perfil que não muda nada não é gravado nem avisado.
        let profileSaved = false;
        if (data.profile) {
          const theirs = data.profile;
          const stored = await profile.get('current');
          const base = profileOrDefault(stored);
          let currentSessionId = base.currentSessionId;
          if (typeof theirs.currentSessionId === 'string' && theirs.currentSessionId !== currentSessionId) {
            const target = await sessions.get(theirs.currentSessionId);
            const mineEmpty = currentSessionId === null || (await solves.index('bySession').count(keyRange(currentSessionId))) === 0;
            if (target?.deletedAt === null && mineEmpty) currentSessionId = target.id;
          }
          // A temporada nunca regride (spec 5.6): fica a mais adiantada. O acabamento do arquivo só vale se estiver liberado por ela.
          const season = moreAdvanced(base.season, seasonFrom(theirs.season));
          const finish = theirs.finish !== undefined && finishUnlocked(theirs.finish, season.past.length) ? theirs.finish : base.finish;
          const merged = mergeProfile(base, {
            ...theirs,
            season,
            finish,
            trail: theirs.trail ? base.trail.map((done, i) => done || theirs.trail?.[i] === true) : base.trail,
            onboarded: base.onboarded || theirs.onboarded === true,
            currentSessionId,
          });
          // Mesma ordem de chaves nos dois (mergeProfile monta ambos), então o JSON compara o conteúdo.
          if (!stored || JSON.stringify(merged) !== JSON.stringify(base)) {
            await profile.put(merged, 'current');
            profileSaved = true;
          }
        }
        return { profileSaved, sessionBack };
      });
      if (outcome.profileSaved || report.sessionsAdded + report.solvesAdded + report.solvesUpdated > 0) announce('all');
      if (outcome.sessionBack) announce('sessions');
      return report;
    },

    async replaceAll(data) {
      const { sessions, solves, profile } = data;
      await write(['sessions', 'solves', 'profile'], async (tx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        // O perfil daqui é lido antes de limpar: a restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não
        // tenha perfil, e uma cópia sem perfil também não tira o acabamento que a pessoa escolheu.
        const local = profileOrDefault(await profileStore.get('current'));
        const mine = local.season;
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear()]);
        await each(sessions, (s) => sessionStore.put(s));
        await each(solves, (s) => solveStore.put(s));
        const restored = profile ? mergeProfile(defaultProfile(), profile) : null;
        const season = moreAdvanced(mine, seasonFrom(profile?.season));
        // Sem perfil na cópia e sem temporada a guardar, o perfil fica vazio (os padrões), como sempre foi. Sem perfil na cópia e com
        // temporada a guardar, o perfil é o padrão com o acabamento daqui; com perfil, vale o acabamento da cópia. Nos dois, só se
        // estiver liberado pelas temporadas fechadas.
        if (restored || season.past.length > 0) {
          const base = restored ?? { ...defaultProfile(), finish: local.finish };
          const finish = finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco';
          await profileStore.put({ ...base, season, finish }, 'current');
        }
      });
      announce('all');
    },

    async addPractice(p) {
      const outcome = await write(['practice'], async (tx) => {
        const store = tx.objectStore('practice');
        const stored = await store.get(p.id);
        if (stored) return { practice: stored, added: false };
        await store.add(p);
        return { practice: p, added: true };
      });
      if (outcome.added) announce('practice');
      return structuredClone(outcome.practice);
    },

    async listPractice({ caseId } = {}) {
      const list = caseId === undefined ? await db.getAll('practice') : await db.getAllFromIndex('practice', 'byCase', keyRange(caseId));
      return list.sort(byPracticeTime);
    },

    async updatePractice(id, patch) {
      const updated = await write(['practice'], async (tx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current) throw new Error(`Tentativa não encontrada: ${id}`);
        const next: Practice = { ...current, ...definedOnly(patch) };
        await store.put(next);
        return next;
      });
      announce('practice');
      return updated;
    },

    async deletePractice(id) {
      await write(['practice'], async (tx) => {
        await tx.objectStore('practice').delete(id);
      });
      announce('practice');
    },

    onChange(fn) {
      const entry = { fn };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },

    // A conexão fecha já (as transações em andamento ainda confirmam). O canal fecha depois que elas terminarem e avisarem a outra aba:
    // sem isso, um solve gravado no meio de uma reabertura não chegaria à outra aba.
    close() {
      closed = true;
      listeners.clear();
      db.close();
      if (inflight === 0) closeChannelSoon();
    },
  };
}
