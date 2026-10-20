// As contas de um filtro (evento e sessão) que a Evolução, o quadro de recordes, o detalhe do solve e a folha do recorde mostram (a revisão
// final do histórico, I2): o pool, as séries da lista (as médias de 5 e de 12 que terminam em cada solve e os recordes da época) e os
// recordes. Com 100 mil solves, cada conta leva centenas de milissegundos; feita por tela, cada mudança custava várias. Aqui é uma por
// mudança de app.solves, dividida pelas quatro: guardada pela identidade do array (app.solves é trocado a cada mudança, nunca alterado no
// lugar), pelo evento e pela sessão. Uma mudança que não mexe no que a conta usa (uma nota) devolve as mesmas séries e os mesmos recordes,
// com o pool novo (a nota nova aparece na lista): só compara ids e tempos, sem refazer as médias.
import { effectiveMs, pbFlags, records, rollingAverages, type Records } from '../../core/stats';
import type { EventId, Solve } from '../../core/types';
import type { Series } from './rows';

export interface PoolStats {
  pool: Solve[]; // os solves do filtro, em ordem de `at`
  series: Series; // uma posição por solve do pool
  records: Records; // os índices são do pool
}

// Quantos filtros ficam guardados: o da Evolução, e o de uma folha aberta com outro (o detalhe de um solve que saiu do filtro, a folha de
// um recorde de outro evento). O mais antigo sai primeiro.
const KEEP = 4;
const cache = new Map<string, { solves: readonly Solve[]; stats: PoolStats }>();

export function poolStats(solves: readonly Solve[], event: EventId, sessionId: string): PoolStats {
  const key = `${event}|${sessionId}`;
  const hit = cache.get(key);
  cache.delete(key); // volta ao fim: o usado agora é o último a sair
  if (hit?.solves === solves) {
    cache.set(key, hit);
    return hit.stats;
  }
  const pool = solves.filter((s) => s.event === event && (sessionId === 'all' || s.sessionId === sessionId));
  const stats = hit && sameTimes(hit.stats.pool, pool) ? { ...hit.stats, pool } : compute(pool);
  cache.set(key, { solves, stats });
  if (cache.size > KEEP) cache.delete(cache.keys().next().value!);
  return stats;
}

// As médias, os recordes da época e os recordes só dependem da ordem dos solves e dos tempos que contam.
function sameTimes(a: readonly Solve[], b: readonly Solve[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i]!.id !== b[i]!.id || effectiveMs(a[i]!) !== effectiveMs(b[i]!)) return false;
  return true;
}

// Os recordes reaproveitam as médias de 5 e de 12 da lista: das cinco médias móveis, só três são feitas de novo.
function compute(pool: Solve[]): PoolStats {
  const ao5 = rollingAverages(pool, 5);
  const ao12 = rollingAverages(pool, 12);
  return { pool, series: { ao5, ao12, pb: pbFlags(pool) }, records: records(pool, { 5: ao5, 12: ao12 }) };
}
