// Estatísticas puras (porte de prototype/scripts/stats.js). As listas chegam em ordem cronológica (mais antigo primeiro)
// e só com solves ativos: quem chama deixa de fora os da lixeira (deletedAt).
import { eventInfo } from './events';
import type { EventId, Solve } from './types';

export const MILESTONES = Object.freeze(['first', 'sub2', 'n100', 'sub130', 'ao5sub130', 'sub1', 'streak7', 'ao12sub1', 'n1000'] as const);
export type MilestoneId = (typeof MILESTONES)[number];

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

// A média de cada janela de n tempos seguidos (null até haver n), igual a trimmedMean janela a janela, mas com a janela deslizando:
// uma árvore de Fenwick sobre os postos dos tempos guarda quantos há e quanto somam, então cada passo custa O(log N) em vez de
// copiar e ordenar n valores (com 100 mil solves, a diferença entre meio segundo e minutos). DNF (Infinity) não entra na árvore:
// é só uma contagem, e na ordenação ele sempre fica no topo. Os tempos são inteiros em ms, então as somas são exatas e o resultado
// bate com o ingênuo até no arredondamento.
function rollingTrimmed(eff: number[], n: number): (number | null)[] {
  const out: (number | null)[] = new Array(eff.length).fill(null);
  if (eff.length < n) return out;

  // posto de cada tempo finito entre os valores distintos da lista (-1 para DNF)
  const finite = Float64Array.from(eff.filter((v) => v !== Infinity)).sort();
  const vals: number[] = [];
  for (const v of finite) if (vals.length === 0 || vals[vals.length - 1] !== v) vals.push(v);
  const m = vals.length;
  const rankOf = (v: number): number => {
    let lo = 0;
    let hi = m - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (vals[mid]! < v) lo = mid + 1;
      else hi = mid;
    }
    return lo + 1; // posições da árvore começam em 1
  };
  const rank = eff.map((v) => (v === Infinity ? -1 : rankOf(v)));

  const cnt = new Int32Array(m + 1);
  const sum = new Float64Array(m + 1);
  const update = (pos: number, dc: number, dv: number): void => {
    for (let i = pos; i <= m; i += i & -i) {
      cnt[i]! += dc;
      sum[i]! += dv;
    }
  };
  let top = 1;
  while (top * 2 <= m) top *= 2;
  // soma dos q menores tempos finitos da janela: desce a árvore pelas contagens e completa com o valor do posto onde parou
  const sumSmallest = (q: number): number => {
    let pos = 0;
    let rem = q;
    let acc = 0;
    for (let step = top; step > 0; step >>= 1) {
      const next = pos + step;
      if (next <= m && cnt[next]! <= rem) {
        pos = next;
        rem -= cnt[next]!;
        acc += sum[next]!;
      }
    }
    return rem > 0 ? acc + rem * vals[pos]! : acc;
  };

  const t = trimCount(n);
  const keep = n - 2 * t;
  let dnf = 0;
  for (let i = 0; i < eff.length; i++) {
    if (rank[i]! < 0) dnf++;
    else update(rank[i]!, 1, eff[i]!);
    if (i >= n) {
      if (rank[i - n]! < 0) dnf--;
      else update(rank[i - n]!, -1, -eff[i - n]!);
    }
    if (i + 1 < n) continue;
    // sem nada sobrando depois do corte (n de 1 ou 2), o ingênuo divide 0 por 0 e dá NaN: aqui também
    if (keep <= 0) out[i] = Number.NaN;
    // os t piores são todos DNF só se houver até t deles; um DNF a mais fica entre os mantidos
    else if (dnf > t) out[i] = Infinity;
    // mantidos = do posto t ao n - t - 1; como DNF ocupa o topo, "os n - t menores" já os deixa de fora
    else out[i] = toCentisecond((sumSmallest(n - t) - sumSmallest(t)) / keep);
  }
  return out;
}

export function rollingAverages(solves: Solve[], n: number): (number | null)[] {
  return rollingTrimmed(solves.map(effectiveMs), n);
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

// Os recordes da sessão: o melhor single e a melhor Ao5, Ao12, Ao50, Ao100 e Ao1000, cada um com o valor atual.
export const RECORD_SIZES = [5, 12, 50, 100, 1000] as const;

export interface RecordEntry {
  best: number | null; // null sem solves suficientes (ou, nas médias, sem nenhuma janela sem DNF)
  bestEnd: number | null; // índice, na lista dada, do último solve da melhor janela (no single, do próprio solve)
  current: number | null; // a janela que termina no último solve; Infinity se for DNF
}

export interface Records {
  single: RecordEntry;
  averages: Record<(typeof RECORD_SIZES)[number], RecordEntry>;
}

// Mesma regra de bestSingle e bestAverage (DNF não conta como melhor); no empate fica o recorde mais antigo.
export function records(solves: readonly Solve[]): Records {
  const eff = solves.map(effectiveMs);
  const single: RecordEntry = { best: null, bestEnd: null, current: eff.length > 0 ? eff[eff.length - 1]! : null };
  eff.forEach((e, i) => {
    if (e !== Infinity && (single.best === null || e < single.best)) {
      single.best = e;
      single.bestEnd = i;
    }
  });
  const averages = {} as Records['averages'];
  for (const n of RECORD_SIZES) {
    const entry: RecordEntry = { best: null, bestEnd: null, current: null };
    const rolling = rollingTrimmed(eff, n);
    rolling.forEach((v, i) => {
      if (v !== null && v !== Infinity && (entry.best === null || v < entry.best)) {
        entry.best = v;
        entry.bestEnd = i;
      }
    });
    entry.current = rolling.length > 0 ? rolling[rolling.length - 1]! : null;
    averages[n] = entry;
  }
  return { single, averages };
}

// Os n tempos que terminam no solve `end` (em ordem cronológica) e quais deles caem no corte, para mostrar "(melhor)" e "(pior)".
// No empate, o corte de baixo pega os mais antigos e o de cima os mais recentes; DNF é sempre o pior.
export function windowOf(solves: readonly Solve[], n: number, end: number): { values: number[]; trimmed: boolean[] } {
  const values = solves.slice(Math.max(0, end - n + 1), end + 1).map(effectiveMs);
  const t = trimCount(values.length);
  const order = values.map((_, i) => i).sort((a, b) => (values[a]! < values[b]! ? -1 : values[a]! > values[b]! ? 1 : a - b));
  const trimmed = values.map(() => false);
  order.forEach((idx, pos) => {
    if (pos < t || pos >= values.length - t) trimmed[idx] = true;
  });
  return { values, trimmed };
}
