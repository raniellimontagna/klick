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

// Uma data do sync tirada de uma data do registro. O servidor só aceita inteiros seguros >= 0 (shape.ts), e um registro de antes pode
// trazer uma data com fração ou negativa (um arquivo editado à mão, um relógio antes de 1970): fica o inteiro de baixo, dentro da faixa;
// o que nem é número vira 0, a data mais antiga, que não vence a exclusão de outro aparelho. Mora aqui (e não no banco) porque restaurar
// uma cópia (restore.ts) também a usa, no aparelho e no servidor.
export function stampOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.min(Math.max(Math.floor(v), 0), Number.MAX_SAFE_INTEGER);
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

// A sessão de um solve (o `sessionId` dentro de `data`), ou null se a mudança não é de um solve ou o campo não é texto. Um só lugar para
// quem precisa achar os solves de uma sessão: o juntar de um lote (apply.ts), o Durable Object (coluna `parent`) e o repositório.
export function sessionOfChange(change: Change): string | null {
  if (change.store !== 'solves') return null;
  const d = change.data as { sessionId?: unknown } | null;
  return typeof d?.sessionId === 'string' ? d.sessionId : null;
}
