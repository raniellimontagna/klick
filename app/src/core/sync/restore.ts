// Restaurar uma cópia como gravação (spec 5.5 e 8.3), o mesmo no aparelho e no servidor. O registro da cópia que difere do de agora é
// gravado de novo com a data `stamp`; o que existe agora e não está na cópia ganha marca de exclusão. O que já é igual nos dois lados
// fica como está: uma conta grande não regrava, nem põe na fila, o que a restauração não muda. Nada é apagado: a restauração viaja pelo
// sync como qualquer gravação, e a lixeira e as cópias a desfazem.
import { canonicalJson } from './merge';
import { defaultPrefValue, isPrefValue } from './prefs';
import { stampOf, toChange, type RecordStore, type StampedRecord } from './records';
import { syncKey, type Change } from './types';

export interface RestoreCopy {
  sessions: readonly object[]; // os registros do arquivo do Klick (sem deletionStamp)
  solves: readonly object[];
  practice: readonly object[] | null; // null: uma cópia de antes do treino, e o treino daqui fica como está
  duels: readonly object[] | null; // null: uma cópia de antes dos desafios, e os daqui ficam como estão
}

// Um passo da restauração, ainda sem data: gravar o registro da cópia, ou pôr a marca de exclusão num registro de agora. O servidor
// acumula os passos faixa a faixa e só carimba (stampSteps) depois de saber a data, que depende de tudo o que a comparação viu.
export type RestoreStep = { kind: 'copy'; store: RecordStore; rec: object } | { kind: 'tombstone'; change: Change };

export interface SliceDiff {
  steps: RestoreStep[];
  // O maior `updatedAt + 1` e `deletionStamp + 1` dos registros de agora que a comparação visitou (0 sem nenhum): a data da restauração
  // fica acima dela, senão uma data de agora mais nova que a restauração venceria o registro restaurado no merge.
  floor: number;
}

const COPY_STORES: readonly RecordStore[] = ['sessions', 'solves', 'practice', 'duels'];

// O que a cópia tem, igual ao que `current` tem (conteúdo e estar apagado ou não)? As datas não entram: a de exclusão da cópia vira a da
// restauração, e as de edição valem só no merge. O conteúdo sai do registro da cópia como o `put` o faria, para os dois lados passarem
// pelo mesmo toChange.
function sameRecord(c: Change, store: RecordStore, rec: object): boolean {
  const r = rec as { id: string; deletedAt?: number | null };
  const deleted = r.deletedAt != null;
  if ((c.deletedAt !== null) !== deleted) return false;
  const copy = toChange(store, { ...rec, id: r.id, updatedAt: 0, deletedAt: deleted ? 0 : null, deletionStamp: 0 } as StampedRecord);
  return canonicalJson(c.data) === canonicalJson(copy.data);
}

// A comparação de uma faixa: `current` são os registros de agora dela (uma passada só, pode ser um gerador que lê aos poucos; os `prefs`
// ficam de fora, vão por prefsRestoreChanges) e `copy` os da cópia na mesma faixa. Igual nos dois lados não dá passo; diferente ou só na
// cópia dá `copy`; só agora e ativo dá `tombstone` (o treino e os desafios de agora ficam como estão quando a cópia é de antes deles: a
// lista null); só agora e já apagado não dá nada. Para assim que passa de `limit` passos (devolve `limit + 1`), para o servidor não
// ler uma conta inteira só para recusar.
export function diffSlice(current: Iterable<Change>, copy: RestoreCopy, limit = Infinity): SliceDiff {
  const lists: Record<RecordStore, readonly object[] | null> = { sessions: copy.sessions, solves: copy.solves, practice: copy.practice, duels: copy.duels };
  const inCopy = new Map<string, { store: RecordStore; rec: object }>();
  for (const store of COPY_STORES) for (const rec of lists[store] ?? []) inCopy.set(syncKey(store, (rec as { id: string }).id), { store, rec });
  const steps: RestoreStep[] = [];
  let floor = 0;
  for (const c of current) {
    if (c.store === 'prefs') continue;
    floor = Math.max(floor, c.updatedAt + 1, c.deletionStamp + 1);
    const key = syncKey(c.store, c.id);
    const theirs = inCopy.get(key);
    if (theirs) {
      inCopy.delete(key);
      if (!sameRecord(c, theirs.store, theirs.rec)) steps.push({ kind: 'copy', store: theirs.store, rec: theirs.rec });
    } else if (c.deletedAt === null && lists[c.store] !== null) {
      steps.push({ kind: 'tombstone', change: c });
    }
    if (steps.length > limit) return { steps, floor };
  }
  for (const { store, rec } of inCopy.values()) {
    steps.push({ kind: 'copy', store, rec });
    if (steps.length > limit) break;
  }
  return { steps, floor };
}

// Os passos com a data da restauração, na ordem de sempre: os da cópia por store (sessões, solves, treino, desafios), depois as marcas de
// exclusão. A marca de exclusão da cópia passa por stampOf (um registro de antes pode trazê-la com fração ou negativa) e nunca fica
// depois da própria restauração: uma marca no futuro subiria, pelo sync, o relógio de todos os aparelhos até ela.
export function stampSteps(steps: readonly RestoreStep[], stamp: number): Change[] {
  const out: Change[] = [];
  for (const store of COPY_STORES) {
    for (const step of steps) {
      if (step.kind !== 'copy' || step.store !== store) continue;
      const r = step.rec as { id: string; deletedAt?: number | null };
      const deletedAt = r.deletedAt == null ? null : Math.min(stampOf(r.deletedAt), stamp);
      out.push(toChange(store, { ...step.rec, id: r.id, updatedAt: stamp, deletedAt, deletionStamp: stamp } as StampedRecord));
    }
  }
  for (const step of steps) if (step.kind === 'tombstone') out.push({ ...step.change, updatedAt: stamp, deletedAt: stamp, deletionStamp: stamp });
  return out;
}

// `prefs`: as chaves da conta restaurada, todas (prefsFromProfile com withDefaults), ou null para não mexer nos itens da conta. Uma chave
// que existe aqui e não está nelas (uma aula, uma escolha, um caso fora) volta ao valor padrão; uma que esta versão não conhece (de um
// catálogo mais novo) fica como está, porque o padrão dela não seria aceito. Uma chave que já tem o valor que ficaria (nas duas regras)
// não é regravada, e uma sem item conta como já no padrão.
export function prefsRestoreChanges(current: readonly Change[], prefs: ReadonlyMap<string, unknown> | null, stamp: number): Change[] {
  const out: Change[] = [];
  if (!prefs) return out;
  const now = new Map<string, Change>();
  for (const c of current) if (c.store === 'prefs') now.set(c.id, c);
  for (const [key, value] of prefs) {
    // Uma chave sem item vale o padrão dela (é como o app a lê, e uma conta só guarda as chaves que alguém mudou): a cópia com o padrão
    // não a grava.
    const have = now.get(key);
    if (canonicalJson(have ? have.data : defaultPrefValue(key)) === canonicalJson(value)) continue;
    out.push({ store: 'prefs', id: key, data: value, updatedAt: stamp, deletedAt: null, deletionStamp: stamp });
  }
  for (const c of now.values()) {
    if (prefs.has(c.id)) continue;
    const fallback = defaultPrefValue(c.id);
    if (isPrefValue(c.id, fallback) && canonicalJson(c.data) !== canonicalJson(fallback)) out.push({ ...c, data: fallback, updatedAt: stamp, deletionStamp: stamp });
  }
  return out;
}

export function restoreChanges(current: readonly Change[], copy: RestoreCopy, prefs: ReadonlyMap<string, unknown> | null, stamp: number): Change[] {
  return [...stampSteps(diffSlice(current, copy).steps, stamp), ...prefsRestoreChanges(current, prefs, stamp)];
}
