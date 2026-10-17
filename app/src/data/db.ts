// Esquema do IndexedDB do Klick. Quem abre o banco é o repositório (repository.ts); nada fora de data/ fala com o IndexedDB.
import { openDB, type DBSchema, type IDBPDatabase, type IDBPTransaction, type StoreNames } from 'idb';
import { seasonFrom } from '../core/season';
import { joinProfile, prefsFromProfile, profileFromPrefs, splitProfile } from '../core/sync/prefs';
import { stampOf } from '../core/sync/records';
import type { DeviceProfile, OutboxEntry, PrefItem, SyncState } from '../core/sync/types';
import type { EventId, KlickExport, Meta, Practice, Profile, Session, Solve } from '../core/types';
import { newId } from './ids';

export const DB_NAME = 'klick';
export const DB_VERSION = 3;

// O que fica gravado a partir da versão 3 (spec 5.1): o registro da tela mais as datas do sync. O repositório tira essas datas antes de
// devolver um registro, e a tela continua vendo Solve, Session e Practice.
export type StoredSolve = Solve & { deletionStamp: number };
export type StoredSession = Session & { deletionStamp: number };
export type StoredPractice = Practice & { updatedAt: number; deletedAt: number | null; deletionStamp: number };

// Cópia de segurança guardada no próprio banco. `payload` é o KlickExport em JSON, ou comprimido com gzip em base64.
export interface BackupRecord {
  id: string;
  createdAt: number;
  reason: 'auto50' | 'daily' | 'manual' | 'pre-restore' | 'pre-sync';
  label?: 'v3'; // a 'pre-sync' que a migração para a versão 3 grava: o diálogo das cópias mostra "Antes da v3"
  solveCount: number;
  encoding: 'gzip-base64' | 'json';
  payload: string;
}

export interface KlickDB extends DBSchema {
  solves: {
    key: string;
    value: StoredSolve;
    indexes: { bySession: [string, number]; byEvent: [EventId, number] }; // [sessionId | event, at]
  };
  sessions: { key: string; value: StoredSession };
  profile: { key: 'current'; value: DeviceProfile }; // só os ajustes do aparelho (spec 5.2); os da conta ficam em prefs
  // 'current' guarda o Meta; 'folderHandle', o handle da pasta de cópias (o IndexedDB guarda handles por clone estruturado); 'sync', o
  // estado do sync e o relógio do app (spec 5.4); 'held', as chaves `${store}/${id}` que a conta recusou pela cota e ficaram só neste
  // aparelho, fora da fila (endurecimento, decisão 4).
  meta: { key: 'current' | 'folderHandle' | 'sync' | 'held'; value: Meta | FileSystemDirectoryHandle | SyncState | string[] };
  backups: { key: string; value: BackupRecord; indexes: { byCreated: number } };
  // O treino de algoritmos (versão 2): uma tentativa por registro, fora dos solves.
  practice: { key: string; value: StoredPractice; indexes: { byCase: [string, number]; byAt: number } }; // [caseId, at]
  // Versão 3: os ajustes da conta, um item por chave, e a fila de saída do sync, na chave `${store}/${id}`.
  prefs: { key: string; value: PrefItem };
  outbox: { key: string; value: OutboxEntry; indexes: { byQueued: number } };
}

// O que acontece com a conexão por causa de outras abas ou do navegador. Quem abre o banco decide o que mostrar.
export interface DbEvents {
  blocking?: () => void; // outra aba pede uma versão mais nova: esta conexão já foi fechada para não prender a outra
  blocked?: () => void; // esta abertura espera uma aba antiga largar o banco (uma versão velha do app, sem `blocking`)
  terminated?: () => void; // o navegador derrubou a conexão (falta de espaço, aba suspensa): quem abriu reabre
  upgrading?: () => void; // começou a migração de um banco da versão 1 ou 2 (spec 5.6): pode demorar, e recarregar no meio a aborta
}

type UpgradeTx = IDBPTransaction<KlickDB, StoreNames<KlickDB>[], 'versionchange'>;

// O perfil gravado antes da versão 3 (um Profile inteiro) com os padrões por baixo, para o que faltar.
function fullProfile(old: Partial<Profile> | undefined): Profile {
  const base = joinProfile(undefined, profileFromPrefs([]));
  if (!old) return base;
  const kept = Object.fromEntries(Object.entries(old).filter(([, v]) => v !== undefined)) as Partial<Profile>;
  return {
    ...base,
    ...kept,
    season: seasonFrom(old.season) ?? base.season,
    settings: { ...base.settings, ...old.settings, sound: { ...base.settings.sound, ...old.settings?.sound } },
  };
}

// A migração para a versão 3 (spec 5.6), dentro da transação de upgrade: ou tudo acontece, ou nada. Só acrescenta; nenhum dado sai.
// A cópia "antes da v3" vai em JSON puro: a transação de upgrade não sobrevive a esperar o CompressionStream.
async function migrateToV3(tx: UpgradeTx, at: number): Promise<void> {
  const solves = tx.objectStore('solves');
  const sessions = tx.objectStore('sessions');
  const practice = tx.objectStore('practice');
  const profile = tx.objectStore('profile');
  const prefs = tx.objectStore('prefs');
  const [allSolves, allSessions, allPractice, stored] = await Promise.all([
    solves.getAll() as Promise<Solve[]>,
    sessions.getAll() as Promise<Session[]>,
    practice.getAll() as Promise<Practice[]>,
    profile.get('current') as Promise<Partial<Profile> | undefined>,
  ]);
  if (allSolves.length + allSessions.length + allPractice.length === 0 && stored === undefined) return; // banco vazio: nada a migrar
  // Na ordem do export (exportAll): sessões pela ordem, solves e treino pelo instante.
  const copy: KlickExport = {
    format: 'klick',
    version: 1,
    exportedAt: at,
    sessions: [...allSessions].sort((a, b) => a.order - b.order),
    solves: [...allSolves].sort((a, b) => a.at - b.at),
    profile: stored ? fullProfile(stored) : null,
    practice: [...allPractice].sort((a, b) => a.at - b.at),
  };
  const solveCount = allSolves.filter((s) => s.deletedAt === null).length;
  const pending: Promise<unknown>[] = [
    tx.objectStore('backups').put({ id: newId(at), createdAt: at, reason: 'pre-sync', label: 'v3', solveCount, encoding: 'json', payload: JSON.stringify(copy) }),
  ];
  // Cada data do sync que a migração grava fica no máximo na data dela: uma no futuro (um relógio adiantado, um arquivo editado à mão)
  // subiria o relógio de todos os aparelhos até ela, e uma além do maior inteiro seguro o travaria (stampOf não a traz para dentro).
  const capped = (v: unknown): number => Math.min(stampOf(v), at);
  for (const s of allSolves) pending.push(solves.put({ ...s, deletionStamp: capped(s.deletedAt ?? s.createdAt) }));
  for (const s of allSessions) pending.push(sessions.put({ ...s, deletionStamp: capped(s.deletedAt ?? s.createdAt) }));
  for (const p of allPractice) pending.push(practice.put({ ...p, updatedAt: capped(p.at), deletedAt: null, deletionStamp: capped(p.at) }));
  const { device, account } = splitProfile(fullProfile(stored));
  if (stored) pending.push(profile.put(device, 'current'));
  // Só as chaves fora do padrão (decisão 4), e só as que o servidor aceita (prefsFromProfile tira um caso que saiu do catálogo e leva ao
  // padrão uma escolha fora dos algoritmos, como a tela já lia); o valor de antes fica na cópia "antes da v3".
  for (const [key, value] of prefsFromProfile(account)) pending.push(prefs.put({ key, value, updatedAt: at }));
  await Promise.all(pending);
}

// `version` só muda nos testes (simulam a aba de uma versão nova, ou abrem uma versão antiga para conferir a migração); o app abre sempre
// DB_VERSION. `now` dá a hora da migração.
export async function openKlickDb(
  name: string = DB_NAME,
  events: DbEvents = {},
  version: number = DB_VERSION,
  now: () => number = () => Date.now(),
): Promise<IDBPDatabase<KlickDB>> {
  let opened: IDBPDatabase<KlickDB> | null = null;
  opened = await openDB<KlickDB>(name, version, {
    blocked() {
      events.blocked?.();
    },
    // Sem fechar aqui, a aba da versão nova fica presa até esta fechar: a migração nunca termina.
    blocking() {
      opened?.close();
      events.blocking?.();
    },
    terminated() {
      events.terminated?.();
    },
    // `newVersion` é a versão pedida: um teste que abre a versão 1 (para conferir a migração) não ganha as stores das seguintes.
    upgrade(db, oldVersion, newVersion, transaction) {
      const target = newVersion ?? version;
      if (oldVersion < 1) {
        const solves = db.createObjectStore('solves', { keyPath: 'id' });
        solves.createIndex('bySession', ['sessionId', 'at']);
        solves.createIndex('byEvent', ['event', 'at']);
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('profile'); // uma chave só: 'current'
        db.createObjectStore('meta'); // 'current', 'folderHandle' e 'sync'
        const backups = db.createObjectStore('backups', { keyPath: 'id' });
        backups.createIndex('byCreated', 'createdAt');
      }
      // Versão 2: o treino. Solves, sessões, perfil, meta e cópias passam intactos.
      if (oldVersion < 2 && target >= 2) {
        const practice = db.createObjectStore('practice', { keyPath: 'id' });
        practice.createIndex('byCase', ['caseId', 'at']);
        practice.createIndex('byAt', 'at');
      }
      // Versão 3: conta e sync (spec 5). Um erro na migração aborta o upgrade inteiro: o banco fica na versão de antes, intacto.
      if (oldVersion < 3 && target >= 3) {
        db.createObjectStore('prefs', { keyPath: 'key' });
        db.createObjectStore('outbox').createIndex('byQueued', 'queuedAt');
        if (oldVersion > 0) {
          events.upgrading?.();
          // Uma falha chega a quem abriu (a abertura rejeita com AbortError); o `done` da transação de upgrade não tem quem o ouça.
          transaction.done.catch(() => {});
          migrateToV3(transaction, stampOf(now())).catch(() => {
            try {
              transaction.abort();
            } catch {
              // a transação já terminou
            }
          });
        }
      }
    },
  });
  return opened;
}
