// Esquema do IndexedDB do Klick. Quem abre o banco é o repositório (repository.ts); nada fora de data/ fala com o IndexedDB.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { EventId, Meta, Profile, Session, Solve } from '../core/types';

export const DB_NAME = 'klick';
export const DB_VERSION = 1;

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
}

export function openKlickDb(name: string = DB_NAME): Promise<IDBPDatabase<KlickDB>> {
  return openDB<KlickDB>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
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
    },
  });
}
