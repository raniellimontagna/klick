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
// trazer uma data com fração ou negativa (um arquivo editado à mão, um relógio antes de 1970): fica o inteiro de baixo, e a negativa vira
// 0; o que nem é número vira 0, a data mais antiga, que não vence a exclusão de outro aparelho. Uma data além do teto do sync (MAX_STAMP,
// types.ts) NÃO é trazida para dentro: o servidor a recusa, e nenhum aparelho conseguiria passar dela depois. Ela continua inválida, e
// quem chama decide: o import recusa o registro, a migração e a restauração a limitam à data delas, e checkChange deixa o resto fora da
// fila. Mora aqui (e não no banco) porque restaurar uma cópia (restore.ts) também a usa, no aparelho e no servidor.
export function stampOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  return Math.max(Math.floor(v), 0);
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

// Um objeto sem chaves: as de valor undefined não contam, como no canonicalJson (merge.ts), e o JSON do sync as tira.
const isEmptyObject = (v: unknown): boolean =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => x === undefined);

// Um solve sem conteúdo, apagado ou não. A ordem do conteúdo no merge (merge.ts) usa este, que não olha a exclusão.
export const isHollow = (c: Pick<Change, 'store' | 'data'>): boolean => c.store === 'solves' && isEmptyObject(c.data);

// A marca compactada (endurecimento, decisão 5): de um solve apagado há mais de TOMBSTONE_KEEP_MS (limits.ts), o servidor guarda só as datas,
// com `data: {}`. checkChange a aceita (shape.ts); o conteúdo de um aparelho que ainda tem o solve vence a marca (merge.ts); um aparelho que
// nunca o teve não a grava (apply.ts); a cópia não a leva (snapshot.ts). Ativo, um solve sem conteúdo continua torto.
export const isCompacted = (c: Pick<Change, 'store' | 'data' | 'deletedAt'>): boolean => c.deletedAt !== null && isHollow(c);

// A marca compactada de um solve apagado: as mesmas datas, sem o conteúdo.
export const compacted = (c: Change): Change => ({
  store: c.store,
  id: c.id,
  data: {},
  updatedAt: c.updatedAt,
  deletedAt: c.deletedAt,
  deletionStamp: c.deletionStamp,
});
