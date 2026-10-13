// Estatísticas puras (porte de prototype/scripts/stats.js). As listas chegam em ordem cronológica (mais antigo primeiro)
// e só com solves ativos: quem chama deixa de fora os da lixeira (deletedAt).
import { T } from '../strings';
import { eventInfo } from './events';
import type { EventId, Solve } from './types';

const DAY = 86400000;

export const MILESTONES = Object.freeze(['first', 'sub2', 'n100', 'sub130', 'ao5sub130', 'sub1', 'streak7', 'ao12sub1', 'n1000'] as const);
export type MilestoneId = (typeof MILESTONES)[number];

export interface MilestoneStatus {
  id: MilestoneId;
  achieved: boolean;
  at: number | null; // quando foi conquistado
  progress: string | null; // o que falta, enquanto não foi conquistado
}

export interface SolveDeltas {
  vsAvg: number | null; // contra a média oficial do evento (Ao5 ou Mo3), pela sessão
  avgN: number; // de quantos solves é essa média: 5 ou 3
  vsPb: number | null;
  isPb: boolean;
}

// Reação do Centro a um solve.
export type ResultKind = 'pb' | 'good' | 'slow' | 'plus2' | 'dnf';

export interface HeatDay {
  day: number;
  count: number;
  level: 0 | 1 | 2 | 3;
  pb: boolean;
  today: boolean;
}

export function effectiveMs(solve: Solve): number {
  if (solve.penalty === 'DNF') return Infinity;
  return solve.ms + (solve.penalty === '+2' ? 2000 : 0);
}

// Tempo truncado no centésimo, como no display do stackmat.
export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms === Infinity) return 'DNF';
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const rest = cs - m * 6000;
  const s = Math.floor(rest / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}

export function formatSolve(solve: Solve): string {
  if (solve.penalty === 'DNF') return 'DNF';
  return formatMs(effectiveMs(solve)) + (solve.penalty === '+2' ? '+' : '');
}

// Convenção do csTimer: descarta 5% de cada lado, arredondando para cima (ao5 e ao12: 1; ao50: 3; ao100: 5).
export const trimCount = (n: number): number => Math.ceil(n * 0.05);

// Médias e Mo3 valem ao centésimo (a WCA arredonda), então o cálculo arredonda para 10 ms antes de o display truncar.
const toCentisecond = (ms: number): number => Math.round(ms / 10) * 10;

export function trimmedMean(values: number[]): number {
  const t = trimCount(values.length);
  const kept = [...values].sort((a, b) => a - b).slice(t, values.length - t);
  if (kept.some((v) => v === Infinity)) return Infinity;
  return toCentisecond(kept.reduce((a, b) => a + b, 0) / kept.length);
}

// Média com descarte (Ao5, Ao12, Ao100). Para o Mo3 use meanOf: com n = 3 o descarte deixa só a mediana.
export function averageOf(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  return trimmedMean(solves.slice(-n).map(effectiveMs));
}

export function rollingAverages(solves: Solve[], n: number): (number | null)[] {
  const eff = solves.map(effectiveMs);
  return eff.map((_, i) => (i + 1 < n ? null : trimmedMean(eff.slice(i + 1 - n, i + 1))));
}

export function bestSingle(solves: Solve[]): number | null {
  let best: number | null = null;
  for (const x of solves) {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < best)) best = e;
  }
  return best;
}

export function bestSingleSolve(solves: Solve[]): Solve | null {
  let best: Solve | null = null;
  for (const x of solves) {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < effectiveMs(best))) best = x;
  }
  return best;
}

export function bestAverage(solves: Solve[], n: number): number | null {
  let best: number | null = null;
  for (const v of rollingAverages(solves, n)) if (v !== null && v !== Infinity && (best === null || v < best)) best = v;
  return best;
}

export function stdDevMs(solves: Solve[]): number | null {
  const v = solves.map(effectiveMs).filter((e) => e !== Infinity);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
}

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const noon = (key: string): number => new Date(`${key}T12:00:00`).getTime();

export function solvesOnDay(solves: Solve[], ts: number): Solve[] {
  const k = dayKey(ts);
  return solves.filter((x) => dayKey(x.at) === k);
}

// Dias seguidos terminando hoje (ou ontem, se ainda não houve solve hoje).
export function currentStreak(solves: Solve[], nowTs: number): number {
  const days = new Set(solves.map((x) => dayKey(x.at)));
  const d = new Date(nowTs);
  d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d.getTime()))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// Mo n: média simples dos n últimos, sem descartar nenhum, arredondada ao centésimo como o Ao5.
// DNF entre os n vira DNF; sem n solves, null.
export function meanOf(solves: Solve[], n: number): number | null {
  if (solves.length < n) return null;
  const eff = solves.slice(-n).map(effectiveMs);
  if (eff.some((v) => v === Infinity)) return Infinity;
  return toCentisecond(eff.reduce((a, b) => a + b, 0) / n);
}

// Melhor Mo n: a menor média simples entre as janelas de n solves seguidos (o equivalente de bestAverage para o Mo3).
// Como em bestAverage, janela com DNF não conta; sem nenhuma janela válida (menos de n solves, ou todas com DNF), null.
export function bestMean(solves: Solve[], n: number): number | null {
  let best: number | null = null;
  for (let end = n; end <= solves.length; end++) {
    const v = meanOf(solves.slice(end - n, end), n);
    if (v !== null && v !== Infinity && (best === null || v < best)) best = v;
  }
  return best;
}

// Média oficial do evento: Mo3 no 6×6, no 7×7 e no 3BLD, Ao5 nos demais (o catálogo diz qual).
export function officialAverageLabel(event: EventId): { n: number; kind: 'ao' | 'mo' } {
  return eventInfo(event).average === 'mo3' ? { n: 3, kind: 'mo' } : { n: 5, kind: 'ao' };
}

export function officialAverage(solves: Solve[], event: EventId): number | null {
  const { n, kind } = officialAverageLabel(event);
  return kind === 'mo' ? meanOf(solves, n) : averageOf(solves, n);
}

// A média oficial do evento compara com avgHistory (a sessão); o recorde, com history (todos os solves do evento).
export function solveDeltas(history: Solve[], solve: Solve, avgHistory: Solve[] = history): SolveDeltas {
  const e = effectiveMs(solve);
  const prevAvg = officialAverage(avgHistory, solve.event);
  const prevPb = bestSingle(history);
  return {
    vsAvg: prevAvg !== null && prevAvg !== Infinity && e !== Infinity ? e - prevAvg : null,
    avgN: officialAverageLabel(solve.event).n,
    vsPb: prevPb !== null && e !== Infinity ? e - prevPb : null,
    isPb: prevPb !== null && e !== Infinity && e < prevPb,
  };
}

export function resultKind(history: Solve[], solve: Solve, avgHistory: Solve[] = history): ResultKind {
  if (solve.penalty === 'DNF') return 'dnf';
  if (solve.penalty === '+2') return 'plus2';
  const d = solveDeltas(history, solve, avgHistory);
  if (d.isPb) return 'pb';
  return d.vsAvg === null || d.vsAvg <= 0 ? 'good' : 'slow';
}

export function monthHeat(solves: Solve[], nowTs: number): HeatDay[] {
  const now = new Date(nowTs);
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const counts = new Map<number, number>();
  for (const x of solves) {
    const d = new Date(x.at);
    if (d.getFullYear() === y && d.getMonth() === m) counts.set(d.getDate(), (counts.get(d.getDate()) || 0) + 1);
  }
  const pb = bestSingleSolve(solves);
  const pbDate = pb ? new Date(pb.at) : null;
  const pbDay = pbDate && pbDate.getFullYear() === y && pbDate.getMonth() === m ? pbDate.getDate() : null;
  return Array.from({ length: daysIn }, (_, i): HeatDay => {
    const day = i + 1;
    const count = counts.get(day) || 0;
    return { day, count, level: count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3, pb: day === pbDay, today: day === now.getDate() };
  });
}

// Marcos da temporada 1, com o momento em que cada um foi conquistado e o progresso dos que faltam.
// Quem chama passa só os solves do 3×3: os marcos não valem para os outros eventos.
// Quando cada marco foi conquistado (o instante do solve que o acendeu), sobre a lista inteira. Só as contas que os marcos pedem:
// os textos de progresso ficam em milestoneProgress.
// A conta dos marcos como uma dobra, solve a solve: o estado guarda o que ela precisa para continuar (o melhor tempo, a sequência de
// dias, os últimos 12 tempos para as médias). reachedAt dobra a lista inteira; o rastreador continua a dobra quando a lista só
// ganhou solves no fim.
interface ReachState {
  at: Partial<Record<MilestoneId, number>>;
  count: number;
  best: number | null;
  run: number;
  bestRun: number;
  prevDay: string | null;
  last: number[]; // os últimos 12 tempos efetivos (Infinity = DNF), do mais antigo ao mais novo
}

const initReach = (): ReachState => ({ at: {}, count: 0, best: null, run: 0, bestRun: 0, prevDay: null, last: [] });

function stepReach(st: ReachState, x: Solve): void {
  const e = effectiveMs(x);
  st.count += 1;
  if (e !== Infinity && (st.best === null || e < st.best)) st.best = e;
  const k = dayKey(x.at);
  if (k !== st.prevDay) {
    st.run = st.prevDay !== null && Math.round((noon(k) - noon(st.prevDay)) / DAY) === 1 ? st.run + 1 : 1;
    st.bestRun = Math.max(st.bestRun, st.run);
    st.prevDay = k;
  }
  st.last.push(e);
  if (st.last.length > 12) st.last.shift();
  const ao5 = st.last.length >= 5 ? trimmedMean(st.last.slice(-5)) : null;
  const ao12 = st.last.length >= 12 ? trimmedMean(st.last) : null;
  const hit = (id: MilestoneId, ok: boolean): void => {
    if (ok && st.at[id] === undefined) st.at[id] = x.at;
  };
  const best = st.best;
  hit('first', st.count >= 1);
  hit('sub2', best !== null && best < 120000);
  hit('n100', st.count >= 100);
  hit('sub130', best !== null && best < 90000);
  hit('ao5sub130', ao5 !== null && ao5 < 90000);
  hit('sub1', best !== null && best < 60000);
  hit('streak7', st.bestRun >= 7);
  hit('ao12sub1', ao12 !== null && ao12 < 60000);
  hit('n1000', st.count >= 1000);
}

function reachedAt(solves: Solve[]): Partial<Record<MilestoneId, number>> {
  const st = initReach();
  for (const x of solves) stepReach(st, x);
  return st.at;
}

export function milestoneProgress(solves: Solve[], nowTs: number): MilestoneStatus[] {
  const at = reachedAt(solves);
  const best = bestSingle(solves);
  const n = solves.length;
  const progress: Record<MilestoneId, string | null> = {
    first: null,
    sub2: best === null ? null : T.progress.best(formatMs(best)),
    n100: T.progress.count(Math.min(n, 100), 100),
    sub130: best === null ? null : T.progress.best(formatMs(best)),
    ao5sub130: T.progress.best(formatMs(bestAverage(solves, 5))),
    sub1: best === null ? null : T.progress.best(formatMs(best)),
    streak7: T.progress.count(currentStreak(solves, nowTs), 7),
    ao12sub1: T.progress.best(formatMs(bestAverage(solves, 12))),
    n1000: T.progress.count(Math.min(n, 1000), 1000),
  };
  return MILESTONES.map((id) => ({ id, achieved: at[id] !== undefined, at: at[id] ?? null, progress: at[id] !== undefined ? null : progress[id] }));
}

// Só os marcos conquistados, sem os textos de progresso (a tela os calcula a cada solve; não precisam dos textos).
export function achievedIds(solves: Solve[], _nowTs: number): MilestoneId[] {
  const at = reachedAt(solves);
  return MILESTONES.filter((id) => at[id] !== undefined);
}

// true onde o solve bateu o recorde que existia até ali (o primeiro solve não conta).
export function pbFlags(solves: Solve[]): boolean[] {
  let best: number | null = null;
  return solves.map((x) => {
    const e = effectiveMs(x);
    const flag = best !== null && e !== Infinity && e < best;
    if (e !== Infinity && (best === null || e < best)) best = e;
    return flag;
  });
}
