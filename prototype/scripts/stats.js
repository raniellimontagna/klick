// Estatísticas puras. Um solve é { id, ms, penalty: null | '+2' | 'DNF', at, scramble, note, session }.
// As listas chegam em ordem cronológica (mais antigo primeiro).
import { T } from './strings.js';

const DAY = 86400000;

export const MILESTONES = Object.freeze(['first', 'sub2', 'n100', 'sub130', 'ao5sub130', 'sub1', 'streak7', 'ao12sub1', 'n1000']);

export function effectiveMs(solve) {
  if (!solve) return null;
  if (solve.penalty === 'DNF') return Infinity;
  return solve.ms + (solve.penalty === '+2' ? 2000 : 0);
}

// Tempo truncado no centésimo, como no display do stackmat.
export function formatMs(ms) {
  if (ms === null || ms === undefined) return '—';
  if (ms === Infinity) return 'DNF';
  const cs = Math.floor(ms / 10);
  const m = Math.floor(cs / 6000);
  const rest = cs - m * 6000;
  const s = Math.floor(rest / 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(rest % 100).padStart(2, '0')}`;
}

export function formatSolve(solve) {
  if (solve.penalty === 'DNF') return 'DNF';
  return formatMs(effectiveMs(solve)) + (solve.penalty === '+2' ? '+' : '');
}

// Convenção do csTimer: descarta 5% de cada lado, arredondando para cima (ao5 e ao12: 1; ao50: 3; ao100: 5).
export const trimCount = (n) => Math.ceil(n * 0.05);

function trimmedMean(values) {
  const t = trimCount(values.length);
  const kept = [...values].sort((a, b) => a - b).slice(t, values.length - t);
  if (kept.some((v) => v === Infinity)) return Infinity;
  return Math.round(kept.reduce((a, b) => a + b, 0) / kept.length / 10) * 10;
}

export function averageOf(solves, n) {
  if (solves.length < n) return null;
  return trimmedMean(solves.slice(-n).map(effectiveMs));
}

export function rollingAverages(solves, n) {
  const eff = solves.map(effectiveMs);
  return eff.map((_, i) => (i + 1 < n ? null : trimmedMean(eff.slice(i + 1 - n, i + 1))));
}

export function bestSingle(solves) {
  let best = null;
  for (const x of solves) {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < best)) best = e;
  }
  return best;
}

export function bestSingleSolve(solves) {
  let best = null;
  for (const x of solves) {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < effectiveMs(best))) best = x;
  }
  return best;
}

export function bestAverage(solves, n) {
  let best = null;
  for (const v of rollingAverages(solves, n)) if (v !== null && v !== Infinity && (best === null || v < best)) best = v;
  return best;
}

export function stdDevMs(solves) {
  const v = solves.map(effectiveMs).filter((e) => e !== Infinity);
  if (v.length < 2) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const noon = (key) => new Date(`${key}T12:00:00`).getTime();

export function solvesOnDay(solves, ts) {
  const k = dayKey(ts);
  return solves.filter((x) => dayKey(x.at) === k);
}

// Dias seguidos terminando hoje (ou ontem, se ainda não houve solve hoje).
export function currentStreak(solves, nowTs) {
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

export function solveDeltas(history, solve) {
  const e = effectiveMs(solve);
  const prevAo5 = averageOf(history, 5);
  const prevPb = bestSingle(history);
  return {
    vsAo5: prevAo5 !== null && prevAo5 !== Infinity && e !== Infinity ? e - prevAo5 : null,
    vsPb: prevPb !== null && e !== Infinity ? e - prevPb : null,
    isPb: prevPb !== null && e !== Infinity && e < prevPb,
  };
}

// Tipo de reação do Centro: 'pb' | 'good' | 'slow' | 'plus2' | 'dnf'.
export function resultKind(history, solve) {
  if (solve.penalty === 'DNF') return 'dnf';
  if (solve.penalty === '+2') return 'plus2';
  const d = solveDeltas(history, solve);
  if (d.isPb) return 'pb';
  return d.vsAo5 === null || d.vsAo5 <= 0 ? 'good' : 'slow';
}

export function monthHeat(solves, nowTs) {
  const now = new Date(nowTs);
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysIn = new Date(y, m + 1, 0).getDate();
  const counts = new Map();
  for (const x of solves) {
    const d = new Date(x.at);
    if (d.getFullYear() === y && d.getMonth() === m) counts.set(d.getDate(), (counts.get(d.getDate()) || 0) + 1);
  }
  const pb = bestSingleSolve(solves);
  const pbDate = pb ? new Date(pb.at) : null;
  const pbDay = pbDate && pbDate.getFullYear() === y && pbDate.getMonth() === m ? pbDate.getDate() : null;
  return Array.from({ length: daysIn }, (_, i) => {
    const day = i + 1;
    const count = counts.get(day) || 0;
    return { day, count, level: count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3, pb: day === pbDay, today: day === now.getDate() };
  });
}

// Marcos da temporada 1, com o momento em que cada um foi conquistado e o progresso dos que faltam.
export function milestoneProgress(solves, nowTs) {
  const at = {};
  const r5 = rollingAverages(solves, 5);
  const r12 = rollingAverages(solves, 12);
  let best = null;
  let run = 0;
  let bestRun = 0;
  let prevDay = null;
  solves.forEach((x, i) => {
    const e = effectiveMs(x);
    if (e !== Infinity && (best === null || e < best)) best = e;
    const k = dayKey(x.at);
    if (k !== prevDay) {
      run = prevDay !== null && Math.round((noon(k) - noon(prevDay)) / DAY) === 1 ? run + 1 : 1;
      bestRun = Math.max(bestRun, run);
      prevDay = k;
    }
    const hit = (id, ok) => {
      if (ok && at[id] === undefined) at[id] = x.at;
    };
    const n = i + 1;
    hit('first', n >= 1);
    hit('sub2', best !== null && best < 120000);
    hit('n100', n >= 100);
    hit('sub130', best !== null && best < 90000);
    hit('ao5sub130', r5[i] !== null && r5[i] < 90000);
    hit('sub1', best !== null && best < 60000);
    hit('streak7', bestRun >= 7);
    hit('ao12sub1', r12[i] !== null && r12[i] < 60000);
    hit('n1000', n >= 1000);
  });
  const n = solves.length;
  const progress = {
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

export function achievedIds(solves, nowTs) {
  return milestoneProgress(solves, nowTs).filter((m) => m.achieved).map((m) => m.id);
}

// true onde o solve bateu o recorde que existia até ali (o primeiro solve não conta).
export function pbFlags(solves) {
  let best = null;
  return solves.map((x) => {
    const e = effectiveMs(x);
    const flag = best !== null && e !== Infinity && e < best;
    if (e !== Infinity && (best === null || e < best)) best = e;
    return flag;
  });
}
