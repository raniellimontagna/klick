// Repositório: a única porta para o IndexedDB (esquema em db.ts). Nada aqui conhece a tela.
//
// Gravação: toda escrita passa por write(), uma transação 'readwrite' com durability 'strict' que só resolve depois do commit
// (tx.done). Qualquer falha aborta a transação e rejeita a promessa; a fila de gravação conta com isso para manter o solve
// pendente, então nada é engolido. Os avisos (ouvintes locais e canal entre abas) saem só depois do commit.
//
// Invariante: solve ativo => sessão ativa. Um solve ativo sob uma sessão na lixeira continuaria entrando nas contas por evento,
// mas nenhuma lista de sessões mostraria a sessão dele, e o purge a apagaria de vez. Os três caminhos que gravam um solve ativo
// (restoreSolve, addSolve e importAll) devolvem o registro da sessão na mesma transação, e só ele: os outros solves excluídos da
// sessão continuam na lixeira. replaceAll grava a cópia como veio.
//
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPObjectStore, IDBPTransaction, StoreNames } from 'idb';
import { defaultSeason, finishUnlocked, moreAdvanced, seasonFrom } from '../core/season';
import { canonicalJson } from '../core/sync/merge';
import { defaultPrefValue, isPrefValue, joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { changeToPref, fromChange, prefToChange, stampOf, toChange, type RecordStore, type StampedRecord } from '../core/sync/records';
import { restoreChanges } from '../core/sync/restore';
import { checkChange, isSyncId } from '../core/sync/shape';
import { syncKey, type Change, type DeviceProfile, type PrefItem, type SyncState, type SyncStore } from '../core/sync/types';
import { algChoiceFrom, lessonAtFrom, practiceFrom, trainOffFrom } from '../core/trail/validate';
import { defaultSettings } from '../core/types';
import type { EventId, KlickExport, Meta, Penalty, Practice, Profile, ProfilePatch, SeasonRecord, SeasonState, Session, Solve } from '../core/types';
import { T } from '../strings';
import type { BackupRecord, KlickDB, StoredPractice, StoredSession, StoredSolve } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'practice' | 'sync' | 'all';
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

// O formato do arquivo mora em core/types.ts (o Worker também o escreve); quem importava daqui continua importando.
export type { KlickExport, ProfilePatch } from '../core/types';

export interface ImportReport {
  sessionsAdded: number;
  solvesAdded: number;
  solvesUpdated: number;
  skipped: number;
  // Registros do arquivo (sessões, solves e tentativas) que o sync recusaria e ficaram de fora (spec 6.6): um id que não serve de chave, um
  // solve cuja sessão não pode existir, um registro grande demais. Só aparece quando há algum.
  refused?: number;
}

export interface Repository {
  listSessions(o?: { includeDeleted?: boolean }): Promise<Session[]>; // ordenadas por order
  // Nome padrão "Sessão N" por evento. `id` é o da sessão padrão (defaultSessionId): vale se ainda não existe registro com ele; senão, um novo.
  createSession(o: { event: EventId; name?: string; id?: string }): Promise<Session>;
  renameSession(id: string, name: string): Promise<void>; // ignora nome vazio
  deleteSession(id: string): Promise<void>; // marca a sessão e os solves dela
  restoreSession(id: string): Promise<void>; // restaura a sessão e os solves excluídos junto
  listSolves(f?: { sessionId?: string; event?: EventId; includeDeleted?: boolean }): Promise<Solve[]>; // ordem crescente de at
  addSolve(s: NewSolve): Promise<Solve>; // se a sessão está na lixeira (outra aba a excluiu), o registro dela volta na mesma transação: avisa solves e depois sessions
  updateSolve(id: string, patch: { penalty?: Penalty; note?: string }): Promise<Solve>;
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>; // devolve o solve; se a sessão dele está na lixeira, devolve também o registro dela (só ele: os outros solves excluídos da sessão continuam na lixeira)
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }>; // o excluído mais recentemente primeiro, sessões e solves
  // Apaga de vez o excluído antes de now - olderThanMs (no limite exato ainda fica), menos o que espera na fila de saída: a marca de exclusão
  // só some depois que o servidor a tem (spec 5.5). Uma sessão só sai depois do último solve dela (fica enquanto algum sobrar, na fila,
  // por vencer ou ativo). Devolve quantos itens (sessões e solves); as marcas do treino saem junto, sem contar.
  purgeTrash(olderThanMs: number): Promise<number>;
  getProfile(): Promise<Profile>; // padrão se ausente (e não grava o padrão)
  saveProfile(patch: ProfilePatch): Promise<Profile>; // settings faz merge raso, sound faz merge
  // Vira a temporada (spec 5.5) numa transação: só grava se a temporada gravada ainda for fromN. Se outra aba já virou, não grava nem
  // avisa e devolve o perfil gravado.
  advanceSeason(fromN: number, record: SeasonRecord, next: SeasonState): Promise<Profile>;
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getSyncState(): Promise<SyncState>; // o bloco sync do meta (spec 5.4); o padrão antes do primeiro login
  // Muda o estado do sync e avisa 'sync'. O relógio só sobe: um clock menor que o gravado, ou que não é inteiro seguro >= 0, é ignorado.
  saveSyncState(patch: Partial<SyncState>): Promise<SyncState>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>; // mais recente primeiro
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>; // includeDeleted padrão true
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior, em solves e sessões (spec 5.5). Sessão da lixeira que recebe solve ativo do arquivo volta (sem entrar no relatório; avisa sessions). O perfil do arquivo vale por cima do daqui (ver importAll). O treino junta pelo id, sem duplicar (fora do relatório). O que o sync recusaria fica de fora, contado em `refused`
  // Restaura a cópia como gravação (spec 5.5): cada registro dela é gravado de novo, com a data do relógio; o que existe aqui e não está nela
  // vai para a lixeira; tudo entra na fila de saída. A temporada fica a mais adiantada (a daqui ou a da cópia). O treino troca junto, se a
  // cópia o tiver.
  replaceAll(data: KlickExport): Promise<void>;
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
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'practice', 'sync', 'all'];
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

// O perfil da tela (spec 5.2): os ajustes do aparelho (store profile) mais os itens da conta (store prefs), com os padrões por baixo.
const composeProfile = (device: DeviceProfile | undefined, items: readonly PrefItem[]): Profile => joinProfile(device, profileFromPrefs(items));

// O que a tela recebe: os registros sem as datas do sync (só o repositório e o sync as usam).
const bareSolve = ({ deletionStamp: _d, ...solve }: StoredSolve): Solve => solve;
const bareSession = ({ deletionStamp: _d, ...session }: StoredSession): Session => session;
const barePractice = ({ updatedAt: _u, deletedAt: _x, deletionStamp: _d, ...practice }: StoredPractice): Practice => practice;

// O deletionStamp de um solve ou sessão que vem de um arquivo importado. Num registro novo, como na migração (spec 5.6):
// a marca de exclusão ou a criação. Num que já existe, o daqui quando o estado de exclusão não muda; quando muda, a data do arquivo
// (excluir e restaurar mexem em updatedAt), para a exclusão ou a volta que o arquivo traz também valer no sync. A data do arquivo passa
// por stampOf: o servidor só aceita inteiros seguros >= 0.
function importedStamp(
  local: { deletedAt: number | null; deletionStamp: number } | undefined,
  incoming: { deletedAt: number | null; createdAt: number; updatedAt: number },
): number {
  if (!local) return stampOf(incoming.deletedAt ?? incoming.createdAt);
  return local.deletedAt === incoming.deletedAt ? local.deletionStamp : stampOf(incoming.updatedAt);
}

// Uma tentativa que vem de um arquivo importado ganha as datas como na migração (spec 5.6): o instante dela.
const importedPractice = (p: Practice): StoredPractice => ({ ...p, updatedAt: stampOf(p.at), deletedAt: null, deletionStamp: stampOf(p.at) });

// As datas de edição e de exclusão de um registro importado como o sync as aceita (stampOf): um arquivo editado à mão pode trazê-las com
// fração ou negativas. O registro entra com elas assim; o resto dele fica como veio.
const fileDates = <R extends { updatedAt: number; deletedAt: number | null }>(r: R): R => ({
  ...r,
  updatedAt: stampOf(r.updatedAt),
  deletedAt: r.deletedAt == null ? null : stampOf(r.deletedAt),
});

// O servidor aceitaria o registro como ele vai para a fila? Um registro do app nunca é recusado (spec 6.6): o que não passaria (um id que
// não serve de chave, um campo fora do tipo, um registro grande demais) não entra pelo import.
const syncable = (store: RecordStore, record: StampedRecord): boolean => checkChange(toChange(store, record)).ok;

// O estado do sync antes do primeiro login (spec 5.4).
export const defaultSyncState = (): SyncState => ({
  accountId: null,
  email: null,
  signedIn: false,
  firstSync: false,
  cursor: 0,
  lastSyncAt: null,
  clock: 0,
  passkey: false,
});
const syncStateOrDefault = (stored: SyncState | undefined): SyncState => ({ ...defaultSyncState(), ...stored });

// O que uma escrita acompanhada pelo sync recebe (syncWrite): a próxima data do relógio e a fila de saída.
interface SyncCtx {
  stamp(): number; // a data desta escrita, uma só por transação: max(agora, clock + 1), nunca menor que uma data já vista (spec 5.4)
  track(store: SyncStore, id: string): Promise<void>; // põe o registro na fila de saída, se o aparelho tem conta (spec 5.3), com a data desta escrita
}
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
type WriteTx = IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'readwrite'>;

// Mantém o invariante (ver o topo do arquivo) quando a transação grava um solve ativo: se a sessão dele está na lixeira, devolve o
// registro dela, e só ele. Diz se a sessão voltou. Um sessionId que não é string nem é consultado: uma chave inválida lança
// DataError no IndexedDB e desfaria a gravação do próprio solve, que não pode se perder por isso.
async function reviveSession(sessions: SessionStore, sessionId: unknown, ctx: SyncCtx): Promise<boolean> {
  if (typeof sessionId !== 'string') return false;
  const session = await sessions.get(sessionId);
  if (!session || session.deletedAt === null) return false;
  const at = ctx.stamp();
  await sessions.put({ ...session, deletedAt: null, updatedAt: at, deletionStamp: at });
  await ctx.track('sessions', sessionId);
  return true;
}

// Grava o perfil inteiro `next` por cima de `base` (os dois montados por composeProfile): os ajustes do aparelho na store profile e,
// da conta, só as chaves que mudaram, com a data do relógio. Uma chave que some (uma aula concluída, uma escolha que volta ao padrão)
// grava o valor padrão: a mudança precisa viajar. O perfil do aparelho é gravado sempre que muda ou ainda não existe: um perfil salvo sai
// no export, como antes da divisão. Restaurar uma cópia grava todas as chaves por outro caminho (restoreChanges, em replaceAll).
async function writeProfile(tx: WriteTx, base: Profile, next: Profile, ctx: SyncCtx): Promise<void> {
  const before = splitProfile(base);
  const after = splitProfile(next);
  const profile = tx.objectStore('profile');
  if (canonicalJson(before.device) !== canonicalJson(after.device) || (await profile.count('current')) === 0) await profile.put(after.device, 'current');
  const old = prefsFromProfile(before.account, { withDefaults: true });
  const now = prefsFromProfile(after.account, { withDefaults: true });
  const prefs = tx.objectStore('prefs');
  for (const key of new Set([...old.keys(), ...now.keys()])) {
    const value = now.has(key) ? now.get(key) : defaultPrefValue(key);
    if (canonicalJson(value) === canonicalJson(old.has(key) ? old.get(key) : defaultPrefValue(key))) continue;
    await prefs.put({ key, value, updatedAt: ctx.stamp() });
    await ctx.track('prefs', key);
  }
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

  // Uma escrita que o sync acompanha (spec 5.3 e 5.4): a mesma transação lê e grava o relógio (meta 'sync') e a fila de saída. `stamp()`
  // é a próxima data, max(agora, clock + 1); `track(store, id)` põe o registro na fila quando o aparelho tem conta (accountId). Sem
  // conta, a fila não é preenchida, e o relógio só garante que nenhuma data volta para trás.
  async function syncWrite<R>(stores: StoreNames<KlickDB>[], work: (tx: WriteTx, ctx: SyncCtx) => Promise<R>): Promise<R> {
    return write([...stores, 'meta', 'outbox'], async (tx) => {
      const meta = tx.objectStore('meta');
      const state = syncStateOrDefault((await meta.get('sync')) as SyncState | undefined);
      const outbox = tx.objectStore('outbox');
      let clock = state.clock;
      let at: number | null = null;
      const stamp = (): number => (at ??= clock = Math.max(now(), clock + 1));
      const ctx: SyncCtx = {
        stamp,
        // A data da fila é a da gravação (a do relógio nesta transação), a mesma para tudo o que a transação põe nela, mesmo quando o
        // registro entra antes de qualquer outra data ser pedida (uma importação): o clock de antes, ainda zero num aparelho novo,
        // misturaria a ordem do índice byQueued.
        track: async (store, id) => {
          if (state.accountId !== null) await outbox.put({ store, id, queuedAt: stamp() }, syncKey(store, id));
        },
      };
      const result = await work(tx, ctx);
      if (clock !== state.clock) await meta.put({ ...state, clock }, 'sync');
      return result;
    });
  }

  // Lê o solve, deixa `change` montar o novo (ou null se nada muda) e grava, tudo numa transação. `at` é a data do relógio.
  async function changeSolve(id: string, change: (solve: StoredSolve, at: () => number) => StoredSolve | null): Promise<Solve> {
    const { solve, changed } = await syncWrite(['solves'], async (tx, ctx) => {
      const store = tx.objectStore('solves');
      const current = await store.get(id);
      if (!current) throw new Error(`Solve não encontrado: ${id}`);
      const next = change(current, ctx.stamp);
      if (next) {
        await store.put(next);
        await ctx.track('solves', id);
      }
      return { solve: next ?? current, changed: next !== null };
    });
    if (changed) announceSolves([id]);
    return bareSolve(solve);
  }

  // O perfil gravado agora, dentro da transação (as duas stores).
  async function storedProfile(tx: WriteTx): Promise<Profile> {
    const [device, items] = await Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]);
    return composeProfile(device, items);
  }

  return {
    async listSessions({ includeDeleted = false } = {}) {
      const all = await db.getAll('sessions');
      return all.filter((s) => includeDeleted || s.deletedAt === null).map(bareSession).sort(bySessionOrder);
    },

    async createSession({ event, name, id }) {
      const session = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const all = await store.getAll();
        const at = ctx.stamp();
        const free = id !== undefined && !all.some((s) => s.id === id);
        // A numeração parte do maior "Sessão N" entre as sessões ativas do evento.
        const lastNumber = Math.max(0, ...all.filter((s) => s.event === event && s.deletedAt === null).map((s) => T.session.defaultNameNumber(s.name) ?? 0));
        const created: StoredSession = {
          id: free ? id : newId(at),
          name: name?.trim() || T.session.defaultName(lastNumber + 1),
          event,
          order: Math.max(-1, ...all.map((s) => s.order)) + 1,
          createdAt: at,
          updatedAt: at,
          deletedAt: null,
          deletionStamp: at,
        };
        await store.add(created);
        await ctx.track('sessions', created.id);
        return created;
      });
      announce('sessions');
      return bareSession(session);
    },

    async renameSession(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const changed = await syncWrite(['sessions'], async (tx, ctx) => {
        const store = tx.objectStore('sessions');
        const session = await store.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.name === trimmed) return false;
        await store.put({ ...session, name: trimmed, updatedAt: ctx.stamp() });
        await ctx.track('sessions', id);
        return true;
      });
      if (changed) announce('sessions');
    },

    async deleteSession(id) {
      const touched = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt !== null) return null;
        const at = ctx.stamp();
        await sessions.put({ ...session, deletedAt: at, updatedAt: at, deletionStamp: at });
        await ctx.track('sessions', id);
        // Os solves já excluídos antes ficam com a marca antiga, para restoreSession não trazê-los de volta.
        const solves = tx.objectStore('solves');
        const live = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === null);
        await each(live, (s) => solves.put({ ...s, deletedAt: at, updatedAt: at, deletionStamp: at }));
        await each(live, (s) => ctx.track('solves', s.id));
        return live.map((s) => s.id);
      });
      if (touched === null) return;
      announce('sessions');
      if (touched.length > 0) announceSolves(touched);
    },

    async restoreSession(id) {
      const touched = await syncWrite(['sessions', 'solves'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(id);
        if (!session) throw new Error(`Sessão não encontrada: ${id}`);
        if (session.deletedAt === null) return null;
        const at = ctx.stamp();
        await sessions.put({ ...session, deletedAt: null, updatedAt: at, deletionStamp: at });
        await ctx.track('sessions', id);
        // Volta só o que saiu junto com a sessão: os solves com a mesma marca de exclusão.
        const solves = tx.objectStore('solves');
        const together = (await solves.index('bySession').getAll(keyRange(id))).filter((s) => s.deletedAt === session.deletedAt);
        await each(together, (s) => solves.put({ ...s, deletedAt: null, updatedAt: at, deletionStamp: at }));
        await each(together, (s) => ctx.track('solves', s.id));
        return together.map((s) => s.id);
      });
      if (touched === null) return;
      announce('sessions');
      if (touched.length > 0) announceSolves(touched);
    },

    async listSolves({ sessionId, event, includeDeleted = false } = {}) {
      let list: StoredSolve[];
      if (sessionId !== undefined) {
        list = await db.getAllFromIndex('solves', 'bySession', keyRange(sessionId));
        if (event !== undefined) list = list.filter((s) => s.event === event);
      } else if (event !== undefined) {
        list = await db.getAllFromIndex('solves', 'byEvent', keyRange(event));
      } else {
        list = (await db.getAll('solves')).sort(bySolveTime);
      }
      return (includeDeleted ? list : list.filter((s) => s.deletedAt === null)).map(bareSolve);
    },

    async addSolve(s) {
      const id = s.id ?? newId(now());
      const { solve, sessionBack } = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        // Um id já gravado é o mesmo solve: a repetição não escreve nada. Uma tentativa atrasada não pode desfazer uma edição
        // feita depois (penalidade, nota). O que já está gravado vale.
        const stored = await solves.get(id);
        if (stored) {
          const back = stored.deletedAt === null && (await reviveSession(tx.objectStore('sessions'), stored.sessionId, ctx));
          return { solve: stored, sessionBack: back };
        }
        const stamp = ctx.stamp();
        const solve: StoredSolve = {
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
          deletionStamp: stamp,
        };
        await solves.put(solve);
        await ctx.track('solves', id);
        // Uma aba que ainda mostra uma sessão que outra aba excluiu: o solve não se perde nem fica escondido, e a sessão volta.
        // Só solve ativo pede a sessão ativa (o invariante do topo).
        const back = await reviveSession(tx.objectStore('sessions'), solve.sessionId, ctx);
        return { solve, sessionBack: back };
      });
      announceSolves([solve.id]);
      if (sessionBack) announce('sessions');
      return bareSolve(solve);
    },

    updateSolve(id, patch) {
      return changeSolve(id, (solve, at) => {
        if (patch.penalty === undefined && patch.note === undefined) return null;
        return {
          ...solve,
          penalty: patch.penalty === undefined ? solve.penalty : patch.penalty,
          note: patch.note ?? solve.note,
          updatedAt: at(),
        };
      });
    },

    async deleteSolve(id) {
      await changeSolve(id, (solve, at) => {
        if (solve.deletedAt !== null) return null;
        const stamp = at();
        return { ...solve, deletedAt: stamp, updatedAt: stamp, deletionStamp: stamp };
      });
    },

    async restoreSolve(id) {
      const restored = await syncWrite(['solves', 'sessions'], async (tx, ctx) => {
        const solves = tx.objectStore('solves');
        const solve = await solves.get(id);
        if (!solve) throw new Error(`Solve não encontrado: ${id}`);
        if (solve.deletedAt === null) return null;
        const at = ctx.stamp();
        await solves.put({ ...solve, deletedAt: null, updatedAt: at, deletionStamp: at });
        await ctx.track('solves', id);
        // Invariante: o solve volta ativo, então a sessão dele, se estiver na lixeira, volta junto: só o registro dela. Os outros
        // solves excluídos da sessão continuam na lixeira e voltam um a um.
        return { session: await reviveSession(tx.objectStore('sessions'), solve.sessionId, ctx) };
      });
      if (restored === null) return;
      announceSolves([id]);
      if (restored.session) announce('sessions');
    },

    async getSolves(ids) {
      const found = await read(['solves'], (tx) => {
        const store = tx.objectStore('solves');
        return Promise.all(ids.map((id) => store.get(id)));
      });
      return found.map((s) => (s ? bareSolve(s) : undefined));
    },

    async listTrash() {
      const [sessions, solves] = await read(['sessions', 'solves'], (tx) =>
        Promise.all([tx.objectStore('sessions').getAll(), tx.objectStore('solves').getAll()]),
      );
      return {
        sessions: sessions.filter((s) => s.deletedAt !== null).map(bareSession).sort(newestDeletedFirst),
        solves: solves.filter((s) => s.deletedAt !== null).map(bareSolve).sort(newestDeletedFirst),
      };
    },

    async purgeTrash(olderThanMs) {
      const limit = now() - olderThanMs;
      const expired = ({ deletedAt }: { deletedAt: number | null }) => deletedAt !== null && deletedAt < limit;
      const removed = await write(['sessions', 'solves', 'practice', 'outbox'], async (tx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');
        const waiting = new Set(await tx.objectStore('outbox').getAllKeys());
        const gone = (store: SyncStore) => (r: { id: string; deletedAt: number | null }) => expired(r) && !waiting.has(syncKey(store, r.id));
        const allSolves = await solves.getAll();
        const oldSolves = allSolves.filter(gone('solves'));
        // Uma sessão só some depois do último solve dela: um que ainda espera na fila (a sessão pode ter subido antes, num lote seguinte
        // ou numa rodada que falhou no meio), que ainda não venceu ou que está ativo ficaria sem sessão, e restaurá-lo quebraria o
        // invariante do topo (solve ativo => sessão ativa).
        const leaving = new Set(oldSolves.map((s) => s.id));
        const parents = new Set(allSolves.filter((s) => !leaving.has(s.id)).map((s) => s.sessionId));
        const oldSessions = (await sessions.getAll()).filter((s) => gone('sessions')(s) && !parents.has(s.id));
        const oldPractice = (await practice.getAll()).filter(gone('practice'));
        await each(oldSessions, (s) => sessions.delete(s.id));
        await each(oldSolves, (s) => solves.delete(s.id));
        await each(oldPractice, (p) => practice.delete(p.id));
        return { sessions: oldSessions.length, solves: oldSolves.map((s) => s.id) };
      });
      if (removed.solves.length > 0) announceSolves(removed.solves);
      if (removed.sessions > 0) announce('sessions');
      return removed.sessions + removed.solves.length;
    },

    async getProfile() {
      const [device, items] = await read(['profile', 'prefs'], (tx) =>
        Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]),
      );
      return composeProfile(device, items);
    },

    async saveProfile(patch) {
      const profile = await syncWrite(['profile', 'prefs'], async (tx, ctx) => {
        const base = await storedProfile(tx);
        const merged = mergeProfile(base, patch);
        await writeProfile(tx, base, merged, ctx);
        return merged;
      });
      announce('profile');
      return structuredClone(profile); // a trilha do patch não fica compartilhada com quem recebe o perfil
    },

    async advanceSeason(fromN, record, next) {
      const outcome = await syncWrite(['profile', 'prefs'], async (tx, ctx) => {
        const base = await storedProfile(tx);
        if (base.season.current.n !== fromN) return { profile: base, saved: false };
        const advanced: Profile = { ...base, season: { current: next, past: [...base.season.past, record] } };
        await writeProfile(tx, base, advanced, ctx);
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

    async getSyncState() {
      return syncStateOrDefault((await db.get('meta', 'sync')) as SyncState | undefined);
    },

    async saveSyncState(patch) {
      const state = await write(['meta'], async (tx) => {
        const store = tx.objectStore('meta');
        const stored = syncStateOrDefault((await store.get('sync')) as SyncState | undefined);
        // O relógio só sobe, e só por um inteiro seguro >= 0: um NaN viraria NaN para sempre e o servidor recusaria toda mudança.
        const given = patch.clock;
        const clock = typeof given === 'number' && Number.isSafeInteger(given) && given >= 0 ? Math.max(stored.clock, given) : stored.clock;
        const merged: SyncState = { ...stored, ...definedOnly(patch), clock };
        await store.put(merged, 'sync');
        return merged;
      });
      announce('sync');
      return state;
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
      // Uma transação só, para sessões, solves, perfil e treino virem do mesmo instante.
      const [sessions, solves, device, items, practice] = await read(['sessions', 'solves', 'profile', 'prefs', 'practice'], (tx) =>
        Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('prefs').getAll(),
          tx.objectStore('practice').getAll(),
        ]),
      );
      const kept = <V extends { deletedAt: number | null }>(list: V[]): V[] => (includeDeleted ? list : list.filter((x) => x.deletedAt === null));
      // As marcas de exclusão do treino são do sync: o arquivo leva só as tentativas que existem.
      return {
        format: 'klick',
        version: 1,
        exportedAt: now(),
        sessions: kept(sessions).map(bareSession).sort(bySessionOrder),
        solves: kept(solves).map(bareSolve).sort(bySolveTime),
        profile: device || items.length > 0 ? composeProfile(device, items) : null,
        practice: practice.filter((p) => p.deletedAt === null).map(barePractice).sort(byPracticeTime),
      };
    },

    async importAll(data) {
      const report: ImportReport = { sessionsAdded: 0, solvesAdded: 0, solvesUpdated: 0, skipped: 0 };
      let refused = 0;
      const outcome = await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice'], async (tx, ctx) => {
        const sessions = tx.objectStore('sessions');
        const solves = tx.objectStore('solves');
        const practice = tx.objectStore('practice');

        // Sessão por id, como o solve (spec 5.5): entra a nova (e conta), substitui a de updatedAt menor (renomear e excluir no outro
        // aparelho chegam), e o resto fica como está. Em todos os registros, as datas passam por fileDates e o que o sync recusaria fica
        // de fora (contado em refused).
        const knownSessions = new Map<string, StoredSession>();
        for (const s of await sessions.getAll()) knownSessions.set(s.id, s);
        const sessionWrites: StoredSession[] = [];
        for (const raw of data.sessions) {
          const s = fileDates(raw);
          const have = knownSessions.get(s.id);
          const stored: StoredSession = { ...s, deletionStamp: importedStamp(have, s) };
          if (!syncable('sessions', stored)) {
            refused++;
            continue;
          }
          if (have !== undefined && s.updatedAt <= have.updatedAt) continue;
          if (have === undefined) report.sessionsAdded++;
          knownSessions.set(s.id, stored);
          sessionWrites.push(stored);
        }
        await each(sessionWrites, (s) => sessions.put(s));
        await each(sessionWrites, (s) => ctx.track('sessions', s.id));

        // Solve por id: entra o que não existe, substitui o de updatedAt menor, e o resto é pulado. Um solve cuja sessão não pode existir
        // (o sessionId não serve de id) fica de fora também.
        const knownSolves = new Map<string, StoredSolve>();
        for (const s of await solves.getAll()) knownSolves.set(s.id, s);
        const incoming: StoredSolve[] = [];
        for (const raw of data.solves) {
          const s = fileDates(raw);
          const have = knownSolves.get(s.id);
          const stored: StoredSolve = { ...s, deletionStamp: importedStamp(have, s) };
          if (!isSyncId(s.sessionId) || !syncable('solves', stored)) {
            refused++;
            continue;
          }
          if (have === undefined) report.solvesAdded++;
          else if (s.updatedAt > have.updatedAt) report.solvesUpdated++;
          else {
            report.skipped++;
            continue;
          }
          knownSolves.set(s.id, stored);
          incoming.push(stored);
        }
        await each(incoming, (s) => solves.put(s));
        await each(incoming, (s) => ctx.track('solves', s.id));

        // Invariante: solve ativo que chegou do arquivo não pode ficar sob uma sessão na lixeira (a daqui, por exemplo, que foi
        // excluída): ela volta, só o registro dela. Do mesmo jeito, a exclusão de uma sessão que chegou do arquivo não pode deixar na
        // lixeira uma sessão com solve ativo daqui que o arquivo não traz (gravado aqui depois do export): ela volta, e o solve não some
        // da tela. Isso não entra no relatório.
        const revive = new Set(incoming.filter((s) => s.deletedAt === null).map((s) => s.sessionId));
        for (const s of sessionWrites) {
          if (s.deletedAt === null || revive.has(s.id)) continue;
          if ((await solves.index('bySession').getAll(keyRange(s.id))).some((x) => x.deletedAt === null)) revive.add(s.id);
        }
        let sessionBack = false;
        for (const id of revive) {
          if (await reviveSession(sessions, id, ctx)) sessionBack = true;
        }

        // O perfil do arquivo vale por cima do daqui: os ajustes e o acabamento são os do arquivo, a trilha soma as duas (nada
        // desmarca) e o tour feito num dos dois fica feito. A sessão atual passa a ser a do arquivo só quando a daqui não tem solve
        // nenhum (o aparelho novo) e a de lá existe fora da lixeira. Perfil que não muda nada não é gravado nem avisado.
        let profileSaved = false;
        if (data.profile) {
          const theirs = data.profile;
          const [stored, items] = await Promise.all([tx.objectStore('profile').get('current'), tx.objectStore('prefs').getAll()]);
          const base = composeProfile(stored, items);
          let currentSessionId = base.currentSessionId;
          if (typeof theirs.currentSessionId === 'string' && theirs.currentSessionId !== currentSessionId) {
            const target = await sessions.get(theirs.currentSessionId);
            const mineEmpty = currentSessionId === null || (await solves.index('bySession').count(keyRange(currentSessionId))) === 0;
            if (target?.deletedAt === null && mineEmpty) currentSessionId = target.id;
          }
          // A temporada nunca regride (spec 5.6): fica a mais adiantada. O acabamento do arquivo só vale se estiver liberado por ela.
          const season = moreAdvanced(base.season, seasonFrom(theirs.season));
          const finish = theirs.finish !== undefined && finishUnlocked(theirs.finish, season.past.length) ? theirs.finish : base.finish;
          // Um valor da conta que o sync não aceitaria (uma escolha além dos algoritmos do caso, um caso que esta versão não conhece, um
          // passo negativo, uma meta zero) fica de fora antes de juntar: senão writeProfile gravaria o padrão por cima do valor válido
          // daqui, e o padrão subiria para a conta.
          const accountSetting = <K extends 'inspection' | 'dailyGoal'>(key: K) =>
            isPrefValue(`settings.${key}`, theirs.settings?.[key]) ? theirs.settings?.[key] : undefined;
          const settings = theirs.settings && { ...theirs.settings, inspection: accountSetting('inspection'), dailyGoal: accountSetting('dailyGoal') };
          const merged = mergeProfile(base, {
            ...theirs,
            settings,
            season,
            finish,
            trail: theirs.trail ? base.trail.map((done, i) => done || theirs.trail?.[i] === true) : base.trail,
            onboarded: base.onboarded || theirs.onboarded === true,
            currentSessionId,
            // Treino: a escolha de algoritmo e o passo das aulas juntam caso a caso (vale o do arquivo); os casos fora do sorteio são os do
            // arquivo, quando ele os traz.
            algChoice: { ...base.algChoice, ...algChoiceFrom(theirs.algChoice) },
            lessonAt: { ...base.lessonAt, ...lessonAtFrom(theirs.lessonAt) },
            trainOff: trainOffFrom(theirs.trainOff) ?? base.trainOff,
          });
          // Mesma ordem de chaves nos dois (mergeProfile monta ambos), então o JSON compara o conteúdo.
          if (!stored || JSON.stringify(merged) !== JSON.stringify(base)) {
            await writeProfile(tx, base, merged, ctx);
            profileSaved = true;
          }
        }

        // O treino junta pelo id (spec do sub-projeto 4, seção 9.3): entra o que não existe; o que já existe (até uma marca de exclusão)
        // fica como está.
        const knownPractice = new Set(await practice.getAllKeys());
        const newPractice: StoredPractice[] = [];
        for (const p of practiceFrom(data.practice)) {
          if (knownPractice.has(p.id)) continue;
          const stored = importedPractice(p);
          if (!syncable('practice', stored)) {
            refused++;
            continue;
          }
          newPractice.push(stored);
        }
        await each(newPractice, (p) => practice.put(p));
        await each(newPractice, (p) => ctx.track('practice', p.id));
        return { profileSaved, sessionBack, practiceAdded: newPractice.length, sessionsWritten: sessionWrites.length };
      });
      if (refused > 0) report.refused = refused;
      const changed = outcome.sessionsWritten + report.solvesAdded + report.solvesUpdated + outcome.practiceAdded > 0;
      if (outcome.profileSaved || changed) announce('all');
      if (outcome.sessionBack) announce('sessions');
      return report;
    },

    async replaceAll(data) {
      const { profile } = data;
      // Uma cópia de antes do treino (sem `practice`, ou com algo que não é lista) não mexe no treino daqui; com a lista, mesmo vazia, o
      // treino é o dela.
      const practice = Array.isArray(data.practice) ? practiceFrom(data.practice) : null;
      await syncWrite(['sessions', 'solves', 'profile', 'prefs', 'practice'], async (tx, ctx) => {
        const [sessions, solves, practices, device, items] = await Promise.all([
          tx.objectStore('sessions').getAll(),
          tx.objectStore('solves').getAll(),
          tx.objectStore('practice').getAll(),
          tx.objectStore('profile').get('current'),
          tx.objectStore('prefs').getAll(),
        ]);
        // A restauração fica com a temporada mais adiantada (spec 5.6), mesmo que a cópia não tenha perfil, e uma cópia sem perfil também
        // não tira o acabamento que a pessoa escolheu.
        const local = composeProfile(device, items);
        // O que é do treino e a cópia não traz (uma cópia de antes do treino) fica o daqui.
        const kept: ProfilePatch = { lessonAt: local.lessonAt, algChoice: local.algChoice, trainOff: local.trainOff };
        const restored = profile ? mergeProfile(defaultProfile(), { ...kept, ...profile }) : null;
        const season = moreAdvanced(local.season, seasonFrom(profile?.season));
        // Sem perfil na cópia e sem temporada a guardar, o perfil volta aos padrões, como sempre foi. Sem perfil na cópia e com temporada a
        // guardar, o perfil é o padrão com o acabamento daqui; com perfil, vale o acabamento da cópia. Nos dois, só se estiver liberado
        // pelas temporadas fechadas.
        const keepsProfile = restored !== null || season.past.length > 0;
        let target = defaultProfile();
        if (keepsProfile) {
          const base = restored ?? mergeProfile(defaultProfile(), { ...kept, finish: local.finish });
          target = { ...base, season, finish: finishUnlocked(base.finish, season.past.length) ? base.finish : 'fosco' };
        }
        const current: Change[] = [
          ...sessions.map((s) => toChange('sessions', s)),
          ...solves.map((s) => toChange('solves', s)),
          ...practices.map((p) => toChange('practice', p)),
          ...items.map(prefToChange),
        ];
        const copy = { sessions: data.sessions, solves: data.solves, practice };
        const split = splitProfile(target);
        const changes = restoreChanges(current, copy, prefsFromProfile(split.account, { withDefaults: true }), ctx.stamp());
        await each(changes, (c) => {
          if (c.store === 'prefs') return tx.objectStore('prefs').put(changeToPref(c));
          if (c.store === 'solves') return tx.objectStore('solves').put(fromChange<StoredSolve>(c));
          if (c.store === 'sessions') return tx.objectStore('sessions').put(fromChange<StoredSession>(c));
          return tx.objectStore('practice').put(fromChange<StoredPractice>(c));
        });
        // Tudo o que a restauração grava entra na fila (spec 5.5), menos o que o servidor recusaria (spec 6.6): um registro da cópia que já
        // estava torto aqui (um id que não serve de chave, um solve sem sessão) volta à tela como antes, mas não sobe.
        await each(
          changes.filter((c) => checkChange(c).ok),
          (c) => ctx.track(c.store, c.id),
        );
        if (keepsProfile) await tx.objectStore('profile').put(split.device, 'current');
        else await tx.objectStore('profile').delete('current');
      });
      announce('all');
    },

    async addPractice(p) {
      const outcome = await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const stored = await store.get(p.id);
        if (stored) return { practice: stored, added: false };
        const at = ctx.stamp();
        const record: StoredPractice = { ...p, updatedAt: at, deletedAt: null, deletionStamp: at };
        await store.add(record);
        await ctx.track('practice', p.id);
        return { practice: record, added: true };
      });
      if (outcome.added) announce('practice');
      return structuredClone(barePractice(outcome.practice));
    },

    async listPractice({ caseId } = {}) {
      const list = caseId === undefined ? await db.getAll('practice') : await db.getAllFromIndex('practice', 'byCase', keyRange(caseId));
      return list.filter((p) => p.deletedAt === null).map(barePractice).sort(byPracticeTime);
    },

    // Corrigir o acerto muda updatedAt (spec 5.1). Uma tentativa apagada não se corrige.
    async updatePractice(id, patch) {
      const updated = await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current || current.deletedAt !== null) throw new Error(`Tentativa não encontrada: ${id}`);
        const next: StoredPractice = { ...current, ...definedOnly(patch), updatedAt: ctx.stamp() };
        await store.put(next);
        await ctx.track('practice', id);
        return next;
      });
      announce('practice');
      return barePractice(updated);
    },

    // Apagar uma tentativa vira marca de exclusão (spec 5.1): a remoção de verdade ressuscitaria a tentativa no sync.
    async deletePractice(id) {
      await syncWrite(['practice'], async (tx, ctx) => {
        const store = tx.objectStore('practice');
        const current = await store.get(id);
        if (!current || current.deletedAt !== null) return;
        const at = ctx.stamp();
        await store.put({ ...current, deletedAt: at, updatedAt: at, deletionStamp: at });
        await ctx.track('practice', id);
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
