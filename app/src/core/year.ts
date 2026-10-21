// O ano de treino: 53 colunas de semanas (segunda a domingo, a última com hoje) com a intensidade de cada dia, os totais do período e as
// sequências de dias seguidos. Fuso do aparelho; os dias andam pelo calendário (meio-dia, setDate), nunca somando 86 400 000 ms.
import { dayKey, heatLevel } from './stats';
import type { Solve } from './types';
import { shiftWeeks, weekStart } from './weeks';

export const YEAR_WEEKS = 53;

export interface YearDay {
  ts: number; // meio-dia do dia
  count: number;
  level: 0 | 1 | 2 | 3;
  today: boolean;
  future: boolean;
}

export interface Streak {
  days: number;
  from: number | null; // meio-dia do primeiro dia
  to: number | null; // meio-dia do último
}

export interface YearCalendar {
  start: number; // segunda 00:00 da primeira coluna
  weeks: YearDay[][];
  daysTrained: number; // de start até hoje
  periodDays: number; // idem, inclusive: 367 em 21/10/2026
  solves: number;
  current: Streak; // termina hoje ou ontem
  best: Streak; // a maior de todo o histórico; no empate, a mais recente
  months: { ts: number; days: number; solves: number }[]; // cada mês tocado por [start, hoje], do mais antigo; days = dias com solve
}

const EMPTY: Streak = { days: 0, from: null, to: null };
const noonOf = (y: number, m: number, d: number): number => new Date(y, m, d, 12).getTime();
// número do dia no calendário (independe do fuso e do horário de verão), a partir da chave 'AAAA-MM-DD'
const dayNumber = (key: string): number => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86_400_000;
const noonOfKey = (key: string): number => noonOf(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));

// Sequências de dias seguidos entre as chaves já ordenadas.
function streaks(keys: string[]): (Streak & { endKey: string })[] {
  const out: (Streak & { endKey: string })[] = [];
  let runStart = 0;
  for (let i = 0; i < keys.length; i++) {
    if (i + 1 < keys.length && dayNumber(keys[i + 1]!) === dayNumber(keys[i]!) + 1) continue;
    out.push({ days: i - runStart + 1, from: noonOfKey(keys[runStart]!), to: noonOfKey(keys[i]!), endKey: keys[i]! });
    runStart = i + 1;
  }
  return out;
}

let memo: { solves: readonly Solve[]; day: string; calendar: YearCalendar } | null = null;

// Todos os eventos e sessões. Uma entrada de memória: a mesma lista (pela identidade) no mesmo dia devolve o mesmo objeto.
export function yearCalendar(solves: readonly Solve[], nowTs: number): YearCalendar {
  const today = dayKey(nowTs);
  if (memo && memo.solves === solves && memo.day === today) return memo.calendar;

  const counts = new Map<string, number>();
  for (const x of solves) {
    const k = dayKey(x.at);
    if (k <= today) counts.set(k, (counts.get(k) ?? 0) + 1); // solve de amanhã (relógio errado) não entra
  }

  const start = shiftWeeks(weekStart(nowTs), -(YEAR_WEEKS - 1));
  const s = new Date(start);
  const [sy, sm, sd] = [s.getFullYear(), s.getMonth(), s.getDate()];
  let daysTrained = 0;
  let periodDays = 0;
  let total = 0;
  const monthList: YearCalendar['months'] = [];
  const weeks: YearDay[][] = [];
  for (let w = 0; w < YEAR_WEEKS; w++) {
    const week: YearDay[] = [];
    for (let k = 0; k < 7; k++) {
      const ts = noonOf(sy, sm, sd + w * 7 + k);
      const key = dayKey(ts);
      const future = key > today;
      const count = counts.get(key) ?? 0;
      week.push({ ts, count, level: heatLevel(count), today: key === today, future });
      if (future) continue;
      periodDays++;
      total += count;
      if (count > 0) daysTrained++;
      const d = new Date(ts);
      let month = monthList[monthList.length - 1];
      if (!month || new Date(month.ts).getMonth() !== d.getMonth()) {
        month = { ts: monthList.length === 0 ? ts : noonOf(d.getFullYear(), d.getMonth(), 1), days: 0, solves: 0 };
        monthList.push(month);
      }
      month.solves += count;
      if (count > 0) month.days++;
    }
    weeks.push(week);
  }

  const runs = streaks([...counts.keys()].sort());
  let best: Streak = EMPTY;
  for (const r of runs) if (r.days >= best.days) best = r; // >=: no empate fica a mais recente
  const yesterday = new Date(nowTs);
  yesterday.setHours(12, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);
  const last = runs[runs.length - 1];
  const current = last && (last.endKey === today || last.endKey === dayKey(yesterday.getTime())) ? last : EMPTY;
  const plain = (r: Streak): Streak => ({ days: r.days, from: r.from, to: r.to });

  const calendar: YearCalendar = { start, weeks, daysTrained, periodDays, solves: total, current: plain(current), best: plain(best), months: monthList };
  memo = { solves, day: today, calendar };
  return calendar;
}
