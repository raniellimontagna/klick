// Esquema do IndexedDB do Klick. Quem abre o banco é o repositório (repository.ts); nada fora de data/ fala com o IndexedDB.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EventId, Meta, Practice, Profile, Session, Solve } from '../core/types';

export const DB_NAME = 'klick';
export const DB_VERSION = 2;

// Cópia de segurança guardada no próprio banco. `payload` é o KlickExport em JSON, ou comprimido com gzip em base64.
export interface BackupRecord {
  id: string;
  createdAt: number;
  reason: 'auto50' | 'daily' | 'manual' | 'pre-restore';
  solveCount: number;
  encoding: 'gzip-base64' | 'json';
  payload: string;
}

export interface KlickDB extends DBSchema {
  solves: {
    key: string;
    value: Solve;
    indexes: { bySession: [string, number]; byEvent: [EventId, number] }; // [sessionId | event, at]
  };
  sessions: { key: string; value: Session };
  profile: { key: 'current'; value: Profile };
  // 'current' guarda o Meta; 'folderHandle', o handle da pasta de cópias (o IndexedDB guarda handles por clone estruturado).
  meta: { key: 'current' | 'folderHandle'; value: Meta | FileSystemDirectoryHandle };
  backups: { key: string; value: BackupRecord; indexes: { byCreated: number } };
  // O treino de algoritmos (versão 2): uma tentativa por registro, fora dos solves.
  practice: { key: string; value: Practice; indexes: { byCase: [string, number]; byAt: number } }; // [caseId, at]
}

// O que acontece com a conexão por causa de outras abas ou do navegador. Quem abre o banco decide o que mostrar.
export interface DbEvents {
  blocking?: () => void; // outra aba pede uma versão mais nova: esta conexão já foi fechada para não prender a outra
  blocked?: () => void; // esta abertura espera uma aba antiga largar o banco (uma versão velha do app, sem `blocking`)
  terminated?: () => void; // o navegador derrubou a conexão (falta de espaço, aba suspensa): quem abriu reabre
}

// `version` só muda nos testes (simulam a aba de uma versão nova); o app abre sempre DB_VERSION.
export async function openKlickDb(name: string = DB_NAME, events: DbEvents = {}, version: number = DB_VERSION): Promise<IDBPDatabase<KlickDB>> {
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
    // `newVersion` é a versão pedida: um teste que abre a versão 1 (para conferir a migração) não ganha a store da 2.
    upgrade(db, oldVersion, newVersion) {
      const target = newVersion ?? version;
      if (oldVersion < 1) {
        const solves = db.createObjectStore('solves', { keyPath: 'id' });
        solves.createIndex('bySession', ['sessionId', 'at']);
        solves.createIndex('byEvent', ['event', 'at']);
        db.createObjectStore('sessions', { keyPath: 'id' });
        db.createObjectStore('profile'); // uma chave só: 'current'
        db.createObjectStore('meta'); // 'current' e 'folderHandle'
        const backups = db.createObjectStore('backups', { keyPath: 'id' });
        backups.createIndex('byCreated', 'createdAt');
      }
      // Versão 2: o treino. Solves, sessões, perfil, meta e cópias passam intactos.
      if (oldVersion < 2 && target >= 2) {
        const practice = db.createObjectStore('practice', { keyPath: 'id' });
        practice.createIndex('byCase', ['caseId', 'at']);
        practice.createIndex('byAt', 'at');
      }
    },
  });
  return opened;
}
