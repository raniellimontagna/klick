// Repositório: a única porta para o IndexedDB (esquema em db.ts). Nada aqui conhece a tela.
//
// Gravação: toda escrita passa por write(), uma transação 'readwrite' com durability 'strict' que só resolve depois do commit
// (tx.done). Qualquer falha aborta a transação e rejeita a promessa; a fila de gravação conta com isso para manter o solve
// pendente, então nada é engolido. Os avisos (ouvintes locais e canal entre abas) saem só depois do commit.
//
// Leitura: o que sai do IndexedDB já é cópia. Os padrões (perfil e meta) são montados novos a cada chamada, nunca compartilhados.
import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import { defaultSettings } from '../core/types';
import type { EventId, Meta, Penalty, Profile, Session, Settings, Solve } from '../core/types';
import { T } from '../strings';
import type { BackupRecord, KlickDB } from './db';
import { newId } from './ids';

export type ChangeKind = 'solves' | 'sessions' | 'profile' | 'meta' | 'all';

// O que o repositório usa de um BroadcastChannel; testes passam um canal falso.
export interface ChannelLike {
  postMessage(data: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close?(): void;
}

export interface NewSolve {
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
  profile: Profile | null;
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
  addSolve(s: NewSolve): Promise<Solve>;
  updateSolve(id: string, patch: { penalty?: Penalty; note?: string }): Promise<Solve>;
  deleteSolve(id: string): Promise<void>;
  restoreSolve(id: string): Promise<void>; // se a sessão do solve está na lixeira, ela volta junto (só a sessão; os outros solves dela ficam)
  listTrash(): Promise<{ sessions: Session[]; solves: Solve[] }>; // o excluído mais recentemente primeiro, sessões e solves
  purgeTrash(olderThanMs: number): Promise<number>; // apaga de vez o excluído antes de now - olderThanMs (no limite exato ainda fica); devolve quantos itens (sessões e solves)
  getProfile(): Promise<Profile>; // padrão se ausente (e não grava o padrão)
  saveProfile(patch: ProfilePatch): Promise<Profile>; // settings faz merge raso, sound faz merge
  getMeta(): Promise<Meta>; // padrão se ausente (deviceId novo), gravado na primeira leitura
  saveMeta(patch: Partial<Meta>): Promise<Meta>;
  getFolderHandle(): Promise<unknown | null>;
  saveFolderHandle(h: unknown | null): Promise<void>;
  saveBackup(r: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>; // mais recente primeiro
  getBackup(id: string): Promise<BackupRecord | undefined>;
  deleteBackup(id: string): Promise<void>;
  exportAll(o?: { includeDeleted?: boolean }): Promise<KlickExport>; // includeDeleted padrão true
  importAll(data: KlickExport): Promise<ImportReport>; // junta por id; fica o de updatedAt maior
  replaceAll(data: KlickExport): Promise<void>; // limpa solves, sessões e perfil e grava os do arquivo
  onChange(fn: (kind: ChangeKind) => void): () => void; // mudanças locais e de outras abas
}

const CHANNEL_NAME = 'klick-data';
const CHANGE_KINDS: readonly string[] = ['solves', 'sessions', 'profile', 'meta', 'all'];
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
});

function defaultProfile(): Profile {
  return {
    settings: defaultSettings(), // cópia mutável: o DEFAULT_SETTINGS é congelado
    trail: Array<boolean>(TRAIL_LENGTH).fill(false),
    finish: 'fosco',
    onboarded: false,
    currentSessionId: null,
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

export function createRepository(
  db: IDBPDatabase<KlickDB>,
  {
    now = () => Date.now(),
    channel = defaultChannel(),
    onError = rethrowLater,
  }: {
    now?: () => number;
    channel?: ChannelLike | null; // omitido: BroadcastChannel('klick-data') se o ambiente tiver; null: sem canal
    onError?: (err: unknown) => void; // erro de um ouvinte ou do envio ao canal; a gravação já foi confirmada. Se ele lançar, o erro sai por relançar-depois
  } = {},
): Repository {
  const listeners = new Set<{ fn: (kind: ChangeKind) => void }>();

  // O onError é de quem usa o repositório. Se ele mesmo lançar, o erro não pode rejeitar uma gravação já confirmada (a fila
  // gravaria de novo e duplicaria o solve): o erro que ele recebia e o que ele lançou saem juntos pelo relançar-depois.
  function report(err: unknown): void {
    try {
      onError(err);
    } catch (failure) {
      rethrowLater(new AggregateError([err, failure], 'onError lançou ao receber um erro'));
    }
  }

  function emitLocal(kind: ChangeKind): void {
    for (const entry of [...listeners]) {
      if (!listeners.has(entry)) continue; // saiu durante este aviso
      try {
        entry.fn(kind);
      } catch (err) {
        report(err);
      }
    }
  }

  // Só depois do commit. Aviso que chega de outra aba vai aos ouvintes daqui e não volta ao canal.
  function announce(...kinds: ChangeKind[]): void {
    for (const kind of kinds) {
      emitLocal(kind);
      try {
        channel?.postMessage({ kind });
      } catch (err) {
        report(err);
      }
    }
  }

  if (channel) {
    channel.onmessage = (ev) => {
      const kind = (ev?.data as { kind?: unknown } | null | undefined)?.kind;
      if (isChangeKind(kind)) emitLocal(kind);
    };
  }

  async function write<S extends StoreNames<KlickDB>[], R>(
    stores: S,
    work: (tx: IDBPTransaction<KlickDB, S, 'readwrite'>) => Promise<R>,
  ): Promise<R> {
    const tx = db.transaction(stores, 'readwrite', { durability: 'strict' });
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
    if (changed) announce('solves');
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
        return live.length;
      });
      if (touched === null) return;
      announce('sessions');
      if (touched > 0) announce('solves');
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
        return together.length;
      });
      if (touched === null) return;
      announce('sessions');
      if (touched > 0) announce('solves');
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
      const solve: Solve = {
        id: newId(stamp),
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
      await write(['solves'], async (tx) => {
        await tx.objectStore('solves').add(solve);
      });
      announce('solves');
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
        // Solve ativo sob uma sessão na lixeira não aparece em lista nenhuma, e o purge apagaria a sessão de vez: ela volta
        // junto, só o registro dela. Os outros solves excluídos da sessão continuam na lixeira, um a um.
        const sessions = tx.objectStore('sessions');
        const session = await sessions.get(solve.sessionId);
        if (!session || session.deletedAt === null) return { session: false };
        await sessions.put({ ...session, deletedAt: null, updatedAt: at });
        return { session: true };
      });
      if (restored === null) return;
      announce('solves');
      if (restored.session) announce('sessions');
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
        return { sessions: oldSessions.length, solves: oldSolves.length };
      });
      if (removed.solves > 0) announce('solves');
      if (removed.sessions > 0) announce('sessions');
      return removed.sessions + removed.solves;
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
      const profileAdded = await write(['sessions', 'solves', 'profile'], async (tx) => {
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

        // O perfil do arquivo só entra se este aparelho ainda não tem um.
        if (data.profile && !(await profile.get('current'))) {
          await profile.put(data.profile, 'current');
          return true;
        }
        return false;
      });
      if (profileAdded || report.sessionsAdded + report.solvesAdded + report.solvesUpdated > 0) announce('all');
      return report;
    },

    async replaceAll(data) {
      const { sessions, solves, profile } = data;
      await write(['sessions', 'solves', 'profile'], async (tx) => {
        const sessionStore = tx.objectStore('sessions');
        const solveStore = tx.objectStore('solves');
        const profileStore = tx.objectStore('profile');
        await Promise.all([sessionStore.clear(), solveStore.clear(), profileStore.clear()]);
        await each(sessions, (s) => sessionStore.put(s));
        await each(solves, (s) => solveStore.put(s));
        if (profile) await profileStore.put(profile, 'current');
      });
      announce('all');
    },

    onChange(fn) {
      const entry = { fn };
      listeners.add(entry);
      return () => {
        listeners.delete(entry);
      };
    },
  };
}
