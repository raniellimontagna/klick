// Semanas de treino (segunda 00:00 a domingo, no fuso do aparelho) e o resumo de 28 dias. Funções puras: as listas chegam com os solves
// ativos do recorte (evento, sessão ou todos). Os dias de calendário andam por setDate, nunca somando 86 400 000 ms (horário de verão).
import { bestSingle, effectiveMs, trimmedMean } from './stats';
import type { Solve } from './types';

export const WEEKS = 12;

// Quantos tempos válidos a semana precisa para ter média.
const MIN_WEEK_SOLVES = 5;

export interface WeekRow {
  start: number; // segunda 00:00 da semana
  current: boolean;
  count: number; // todos os solves da semana, DNF incluídos
  dnf: number;
  mean: number | null;
  best: number | null;
  change: number | null; // mean − mean da semana anterior (negativo é mais rápida); null se falta uma das duas
}

// O começo do dia `offset` dias depois (ou antes) do de ts, pelas partes da data: num dia de horário de verão cuja meia-noite não existe,
// é o primeiro instante dele (setHours(0) cairia na 01:00 do mesmo dia e levaria a hora errada aos outros dias).
function dayStart(ts: number, offset = 0): number {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset).getTime();
}

// Segunda-feira 00:00 local da semana de ts.
export function weekStart(ts: number): number {
  return dayStart(ts, -((new Date(ts).getDay() + 6) % 7));
}

// Média da semana: só os tempos válidos (DNF sai antes do corte), no corte de 5% das médias.
export function weekMean(solves: readonly Solve[]): number | null {
  const valid = solves.map(effectiveMs).filter((e) => e !== Infinity);
  return valid.length < MIN_WEEK_SOLVES ? null : trimmedMean(valid);
}

// A segunda de `weeks` semanas depois (ou antes, se negativo) da segunda `start`.
export function shiftWeeks(start: number, weeks: number): number {
  const d = new Date(start);
  d.setDate(d.getDate() + weeks * 7);
  return weekStart(d.getTime());
}

// Da semana atual para trás, até `count` semanas. Não mostra as semanas de antes da do primeiro solve (não existiam), mas mostra as
// vazias no meio; sem nenhum solve nelas, []. A mais antiga compara com a semana anterior a ela, que é calculada e não vem na lista.
export function weekRows(pool: readonly Solve[], nowTs: number, count = WEEKS): WeekRow[] {
  if (pool.length === 0) return [];
  let first = Infinity;
  const byWeek = new Map<number, Solve[]>();
  for (const x of pool) {
    if (x.at < first) first = x.at;
    const k = weekStart(x.at);
    const list = byWeek.get(k);
    if (list) list.push(x);
    else byWeek.set(k, [x]);
  }
  const firstWeek = weekStart(first);
  const current = weekStart(nowTs);
  // count semanas mais a anterior à mais antiga, só para a comparação
  const starts = Array.from({ length: count + 1 }, (_, i) => shiftWeeks(current, -i));
  const means = starts.map((s) => (s < firstWeek ? null : weekMean(byWeek.get(s) ?? [])));
  const rows: WeekRow[] = [];
  for (let i = 0; i < count; i++) {
    const start = starts[i]!;
    if (start < firstWeek) break;
    const solves = byWeek.get(start) ?? [];
    const mean = means[i]!;
    const prev = means[i + 1]!;
    rows.push({
      start,
      current: i === 0,
      count: solves.length,
      dnf: solves.filter((x) => x.penalty === 'DNF').length,
      mean,
      best: bestSingle(solves),
      change: mean !== null && prev !== null ? mean - prev : null,
    });
  }
  return rows.some((r) => r.count > 0) ? rows : [];
}

// Média dos últimos 28 dias (hoje e os 27 anteriores, de 00:00 até agora) menos a dos 28 antes deles; null se falta uma.
export function periodSummary(pool: readonly Solve[], nowTs: number): number | null {
  const recentFrom = dayStart(nowTs, -27);
  const beforeFrom = dayStart(nowTs, -55);
  const recent = pool.filter((x) => x.at >= recentFrom && x.at <= nowTs);
  const before = pool.filter((x) => x.at >= beforeFrom && x.at < recentFrom);
  const a = weekMean(recent);
  const b = weekMean(before);
  return a !== null && b !== null ? a - b : null;
}
