// As regras de conflito (spec 6.3 e 6.4), como funções puras. O app e o Worker importam este arquivo. `merge` é comutativa,
// associativa e idempotente (tests/unit/sync-merge.test.ts); a temporada é a exceção e só o servidor a decide (mergeSeason).
import type { SeasonProgress } from '../types';
import { isHollow } from './records';
import type { Change } from './types';

// JSON com as chaves em ordem: o mesmo valor dá o mesmo texto nos dois lados, e o desempate converge.
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map((x) => canonicalJson(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
}

// Regra 1: o conteúdo de updatedAt maior; no empate, o JSON canônico maior (arbitrário, mas igual nos dois lados). Antes das datas, o
// conteúdo de um solve vence a marca compactada (endurecimento, decisão 5; records.ts): a marca tem as datas da exclusão, e no empate o '{}'
// venceria pelo texto ('}' vem depois de '"'), apagando o conteúdo de um aparelho que ainda o tem. A ordem olha só o que passa adiante (store
// e data, com isHollow), nunca a exclusão: o resultado leva a exclusão do outro lado, e a ordem de um conteúdo tem de ser a mesma antes e
// depois de juntar, senão merge deixaria de ser associativa.
function contentOf(a: Change, b: Change): Change {
  const ha = isHollow(a);
  if (ha !== isHollow(b)) return ha ? b : a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return canonicalJson(a.data) >= canonicalJson(b.data) ? a : b;
}

// Regra 2: a exclusão de deletionStamp maior; no empate, a marca maior (excluído vence ativo).
function deletionOf(a: Change, b: Change): Change {
  if (a.deletionStamp !== b.deletionStamp) return a.deletionStamp > b.deletionStamp ? a : b;
  return (a.deletedAt ?? -Infinity) >= (b.deletedAt ?? -Infinity) ? a : b;
}

// O mesmo registro (mesma store e id) visto pelos dois lados. Conteúdo e exclusão são decididos em separado: uma edição concorrente
// nunca desfaz uma exclusão (D5), e restaurar (deletionStamp novo) vence a exclusão anterior.
export function merge(a: Change, b: Change): Change {
  const c = contentOf(a, b);
  const d = deletionOf(a, b);
  return { store: a.store, id: a.id, data: c.data, updatedAt: c.updatedAt, deletedAt: d.deletedAt, deletionStamp: d.deletionStamp };
}

// Regra 3, a cascata da sessão apagada, aplicada depois de juntar um lote. Um solve ativo com deletionStamp menor ou igual ao da sessão
// recebe a exclusão dela (uma edição offline não ressuscita a sessão). Um solve ativo mais novo que a exclusão (gravado offline numa
// sessão que outro aparelho apagou) devolve a sessão, com o deletionStamp dele: é o que addSolve faz no aparelho, e o invariante
// "solve ativo => sessão ativa" do repositório vale também depois do sync. Devolve só o que mudou.
export function cascade(session: Change, solves: readonly Change[]): { session: Change; solves: Change[] } {
  if (session.deletedAt === null) return { session, solves: [] };
  const changed: Change[] = [];
  let newest = -Infinity;
  for (const s of solves) {
    if (s.deletedAt !== null) continue;
    if (session.deletionStamp >= s.deletionStamp) changed.push({ ...s, deletedAt: session.deletedAt, deletionStamp: session.deletionStamp });
    else newest = Math.max(newest, s.deletionStamp);
  }
  if (newest === -Infinity) return { session, solves: changed };
  return { session: { ...session, deletedAt: null, deletionStamp: newest }, solves: changed };
}

// A temporada (spec 6.4), só no servidor: temporadas fechadas nunca voltam (vence quem tem mais); com o mesmo número e pelo menos uma,
// vence a virada mais antiga; sem nenhuma, ou num empate exato, fica a armazenada. updatedAt sobe para o maior: o aparelho que mandou a
// perdedora recebe a vencedora de volta (o registro muda e ganha revisão).
export function mergeSeason(stored: Change, received: Change): Change {
  const a = stored.data as SeasonProgress;
  const b = received.data as SeasonProgress;
  let winner = stored;
  if (b.past.length > a.past.length) winner = received;
  else if (b.past.length === a.past.length && b.past.length > 0 && b.past[b.past.length - 1].endedAt < a.past[a.past.length - 1].endedAt) {
    winner = received;
  }
  const updatedAt = Math.max(stored.updatedAt, received.updatedAt);
  return { store: 'prefs', id: stored.id, data: winner.data, updatedAt, deletedAt: null, deletionStamp: updatedAt };
}
