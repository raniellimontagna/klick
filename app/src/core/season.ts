// Temporadas do Centro (spec do sub-projeto 3, seção 5): a escada de degraus, os 9 marcos de cada temporada, a validação do que vem de
// fora e os acabamentos. Tudo puro: quem chama passa os solves ativos em ordem de tempo.
import { bestAverage, bestSingle } from './stats';
import type { FinishId, MarkKind, SeasonBasis, SeasonMark, SeasonProgress, SeasonRecord, SeasonState, Solve } from './types';

// A T1 de hoje, na ordem de MILESTONES (stats.ts): os rótulos dela continuam os de MILESTONE_INFO.
export const T1_MARKS: readonly Readonly<SeasonMark>[] = Object.freeze(
  (
    [
      { kind: 'count', target: 1 },
      { kind: 'single', target: 120000 },
      { kind: 'count', target: 100 },
      { kind: 'single', target: 90000 },
      { kind: 'ao5', target: 90000 },
      { kind: 'single', target: 60000 },
      { kind: 'streak', target: 7 },
      { kind: 'ao12', target: 60000 },
      { kind: 'count', target: 1000 },
    ] as SeasonMark[]
  ).map((m) => Object.freeze(m)),
);

const MIN_TARGET = 1000; // nenhuma meta de tempo fica abaixo de 1 s
const FALLBACK_SINGLE = 60000; // sem nenhum tempo (não acontece: a T2 só vem depois de 1.000 solves), as metas partem de 1 minuto

// O passo da faixa de x (spec 5.2): 5 s acima de 1 min, 2 s até 1 min, 1 s até 30 s, 0,5 s até 10 s.
function stepFor(x: number): number {
  if (x > 60000) return 5000;
  if (x > 30000) return 2000;
  if (x > 10000) return 1000;
  return 500;
}

// O próximo degrau redondo abaixo de x: o maior múltiplo do passo da faixa de x estritamente abaixo de x, nunca abaixo de 1 s.
export function stepBelow(x: number): number {
  const s = stepFor(x);
  return Math.max(MIN_TARGET, Math.ceil(x / s) * s - s);
}

// As marcas de base: o melhor single e as melhores médias de 5 e de 12 dos solves dados (quem chama passa só os de 3×3).
export function basisOf(solves: Solve[]): SeasonBasis {
  return { single: bestSingle(solves), ao5: bestAverage(solves, 5), ao12: bestAverage(solves, 12) };
}

// Os 9 marcos da T2 em diante (spec 5.3). Sem média de 12 vale a de 5; sem a de 5, o single.
export function marksFor(basis: SeasonBasis): SeasonMark[] {
  const single = basis.single ?? FALLBACK_SINGLE;
  const ao5 = basis.ao5 ?? single;
  const ao12 = basis.ao12 ?? ao5;
  const ao5First = stepBelow(ao5);
  const ao12First = stepBelow(ao12);
  return [
    { kind: 'count', target: 50 },
    { kind: 'single', target: stepBelow(single) },
    { kind: 'ao5', target: ao5First },
    { kind: 'streak', target: 7 },
    { kind: 'ao12', target: ao12First },
    { kind: 'count', target: 300 },
    { kind: 'ao5', target: stepBelow(ao5First) },
    { kind: 'steady', target: Math.max(MIN_TARGET, Math.round(ao5 / 1000) * 100) }, // 10% da média de 5, arredondado ao décimo
    { kind: 'ao12', target: stepBelow(ao12First) },
  ];
}

export function seasonOne(): SeasonState {
  return { n: 1, startedAt: 0, marks: T1_MARKS.map((m) => ({ ...m })), basis: { single: null, ao5: null, ao12: null } };
}

export function defaultSeason(): SeasonProgress {
  return { current: seasonOne(), past: [] };
}

// O acabamento que cada uma das três primeiras temporadas libera (spec 5.1). Da T4 em diante, nenhum.
const SEASON_FINISH: Readonly<Record<number, FinishId>> = Object.freeze({ 1: 'brilho', 2: 'gelo', 3: 'carbono' });
const UNLOCK_AT: Readonly<Record<FinishId, number>> = Object.freeze({ fosco: 0, brilho: 1, gelo: 2, carbono: 3 });

export const seasonFinish = (n: number): FinishId | null => SEASON_FINISH[n] ?? null;
// `closed` é quantas temporadas a pessoa já fechou (season.past.length).
export const finishUnlocked = (finish: FinishId, closed: number): boolean => closed >= UNLOCK_AT[finish];

// --- O que vem de fora (arquivo do Klick, cópia de segurança) ---

const MARK_KINDS: readonly string[] = ['count', 'single', 'ao5', 'ao12', 'streak', 'steady'];
const isRec = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isPos = (v: unknown): v is number => isNum(v) && v > 0;
const isWhole = (v: unknown, min: number): v is number => Number.isInteger(v) && (v as number) >= min;
const isTime = (v: unknown): v is number | null => v === null || isPos(v);

function markFrom(v: unknown): SeasonMark | null {
  if (!isRec(v)) return null;
  const { kind, target } = v;
  if (typeof kind !== 'string' || !MARK_KINDS.includes(kind) || !isPos(target)) return null;
  return { kind: kind as MarkKind, target };
}

function stateFrom(v: unknown): SeasonState | null {
  if (!isRec(v)) return null;
  const { n, startedAt, marks, basis } = v;
  if (!isWhole(n, 1) || !isNum(startedAt) || startedAt < 0 || !Array.isArray(marks) || marks.length !== 9 || !isRec(basis)) return null;
  const parsed = marks.map(markFrom);
  const { single, ao5, ao12 } = basis;
  if (parsed.some((m) => m === null) || !isTime(single) || !isTime(ao5) || !isTime(ao12)) return null;
  return { n, startedAt, marks: parsed as SeasonMark[], basis: { single, ao5, ao12 } };
}

function recordFrom(v: unknown): SeasonRecord | null {
  if (!isRec(v)) return null;
  const { n, startedAt, endedAt, solves, startAo12, endAo12 } = v;
  if (!isWhole(n, 1) || !isNum(startedAt) || !isNum(endedAt) || !isWhole(solves, 0) || !isTime(startAo12) || !isTime(endAo12)) return null;
  return { n, startedAt, endedAt, solves, startAo12, endAo12 };
}

// Uma temporada que veio de fora: só passa inteira e bem formada (os números das temporadas não se repetem); senão, null.
export function seasonFrom(v: unknown): SeasonProgress | null {
  if (!isRec(v) || !Array.isArray(v.past)) return null;
  const current = stateFrom(v.current);
  const past = v.past.map(recordFrom);
  if (!current || past.some((r) => r === null)) return null;
  const records = past as SeasonRecord[];
  if (new Set([...records.map((r) => r.n), current.n]).size !== records.length + 1) return null;
  return { current, past: records };
}

// A mais adiantada das duas: a de mais temporadas fechadas; no empate, a primeira (a daqui). Progresso nunca regride (spec 5.6).
export const moreAdvanced = (mine: SeasonProgress, theirs: SeasonProgress | null | undefined): SeasonProgress =>
  theirs && theirs.past.length > mine.past.length ? theirs : mine;
