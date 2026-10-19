// Restaurar uma cópia como gravação (spec 5.5 e 8.3), o mesmo no aparelho e no servidor. Cada registro da cópia é gravado de novo com
// a data `stamp`; o que existe agora e não está na cópia ganha marca de exclusão. Nada é apagado: a restauração viaja pelo sync como
// qualquer gravação, e a lixeira e as cópias a desfazem.
import { defaultPrefValue, isPrefValue } from './prefs';
import { stampOf, toChange, type RecordStore, type StampedRecord } from './records';
import { syncKey, type Change } from './types';

export interface RestoreCopy {
  sessions: readonly object[]; // os registros do arquivo do Klick (sem deletionStamp)
  solves: readonly object[];
  practice: readonly object[] | null; // null: uma cópia de antes do treino, e o treino daqui fica como está
  duels: readonly object[] | null; // null: uma cópia de antes dos desafios, e os daqui ficam como estão
}

// `prefs`: as chaves da conta restaurada, todas (prefsFromProfile com withDefaults), ou null para não mexer nos itens da conta. Uma chave
// que existe aqui e não está nelas (uma aula, uma escolha, um caso fora) volta ao valor padrão; uma que esta versão não conhece (de um
// catálogo mais novo) fica como está, porque o padrão dela não seria aceito.
export function restoreChanges(current: readonly Change[], copy: RestoreCopy, prefs: ReadonlyMap<string, unknown> | null, stamp: number): Change[] {
  const out: Change[] = [];
  const inCopy = new Set<string>();
  const put = (store: RecordStore, list: readonly object[]): void => {
    for (const rec of list) {
      const r = rec as { id: string; deletedAt?: number | null };
      inCopy.add(syncKey(store, r.id));
      // A marca de exclusão da cópia passa por stampOf (um registro de antes pode trazê-la com fração ou negativa) e nunca fica depois da
      // própria restauração: uma marca no futuro subiria, pelo sync, o relógio de todos os aparelhos até ela.
      const deletedAt = r.deletedAt == null ? null : Math.min(stampOf(r.deletedAt), stamp);
      const stamped = { ...rec, id: r.id, updatedAt: stamp, deletedAt, deletionStamp: stamp } as StampedRecord;
      out.push(toChange(store, stamped));
    }
  };
  put('sessions', copy.sessions);
  put('solves', copy.solves);
  if (copy.practice) put('practice', copy.practice);
  if (copy.duels) put('duels', copy.duels);
  for (const c of current) {
    if (c.store === 'prefs' || (c.store === 'practice' && copy.practice === null) || (c.store === 'duels' && copy.duels === null)) continue;
    if (c.deletedAt !== null || inCopy.has(syncKey(c.store, c.id))) continue;
    out.push({ ...c, updatedAt: stamp, deletedAt: stamp, deletionStamp: stamp });
  }
  if (prefs) {
    for (const [key, value] of prefs) out.push({ store: 'prefs', id: key, data: value, updatedAt: stamp, deletedAt: null, deletionStamp: stamp });
    for (const c of current) {
      if (c.store !== 'prefs' || prefs.has(c.id)) continue;
      const fallback = defaultPrefValue(c.id);
      if (isPrefValue(c.id, fallback)) out.push({ ...c, data: fallback, updatedAt: stamp, deletionStamp: stamp });
    }
  }
  return out;
}
