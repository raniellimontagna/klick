// Registro gravado <-> mudança do sync (spec 6.1). O registro guarda as datas ao lado dos campos; a mudança as tira para o envelope e
// leva o resto em `data`, inclusive campos que esta versão não conhece (passam intactos).
import type { Change, PrefItem, SyncStore } from './types';

export type RecordStore = Exclude<SyncStore, 'prefs'>;

export interface StampedRecord {
  id: string;
  updatedAt: number;
  deletedAt: number | null;
  deletionStamp: number;
}

export function toChange(store: RecordStore, record: StampedRecord): Change {
  const { id, updatedAt, deletedAt, deletionStamp, ...data } = record as StampedRecord & Record<string, unknown>;
  return { store, id, data, updatedAt, deletedAt, deletionStamp };
}

export function fromChange<R extends StampedRecord>(change: Change): R {
  const data = (typeof change.data === 'object' && change.data !== null ? change.data : {}) as Record<string, unknown>;
  return { ...data, id: change.id, updatedAt: change.updatedAt, deletedAt: change.deletedAt, deletionStamp: change.deletionStamp } as unknown as R;
}

export const prefToChange = (item: PrefItem): Change => ({
  store: 'prefs',
  id: item.key,
  data: item.value,
  updatedAt: item.updatedAt,
  deletedAt: null,
  deletionStamp: item.updatedAt,
});

export const changeToPref = (change: Change): PrefItem => ({ key: change.id, value: change.data, updatedAt: change.updatedAt });
