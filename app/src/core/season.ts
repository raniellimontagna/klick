// Temporadas do Centro (spec do sub-projeto 3, seção 5): a escada de degraus, os 9 marcos de cada temporada, a validação do que vem de
// fora e os acabamentos. Tudo puro: quem chama passa os solves ativos em ordem de tempo.
import { MILESTONE_INFO, T } from '../strings';
import { countsForMilestones } from './events';
import { bestAverage, bestSingle, dayKey, effectiveMs, MILESTONES, noon, trimmedMean } from './stats';
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
// Marcas de base e médias dos registros: 0 ms vale (um solve pode ter 0 ms, e o app grava a marca dele). As metas seguem acima de zero.
const isTime = (v: unknown): v is number | null => v === null || (isNum(v) && v >= 0);

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
  if (!isWhole(n, 1) || !isNum(startedAt) || startedAt < 0 || !isNum(endedAt) || endedAt < startedAt) return null;
  if (!isWhole(solves, 0) || !isTime(startAo12) || !isTime(endAo12)) return null;
  return { n, startedAt, endedAt, solves, startAo12, endAo12 };
}

// Uma temporada que veio de fora: só passa inteira e bem formada, com a numeração que o app grava (as fechadas são a 1, a 2, a 3… em
// ordem, e a atual é a seguinte: assim as fechadas contam as temporadas de verdade e um arquivo adulterado não libera acabamento) e
// cada registro fechando depois de começar; senão, null.
export function seasonFrom(v: unknown): SeasonProgress | null {
  if (!isRec(v) || !Array.isArray(v.past)) return null;
  const current = stateFrom(v.current);
  const past = v.past.map(recordFrom);
  if (!current || past.some((r) => r === null)) return null;
  const records = past as SeasonRecord[];
  if (records.some((r, i) => r.n !== i + 1) || current.n !== records.length + 1) return null;
  return { current, past: records };
}

// A mais adiantada das duas: a de mais temporadas fechadas; no empate, a primeira (a daqui). Progresso nunca regride (spec 5.6).
export const moreAdvanced = (mine: SeasonProgress, theirs: SeasonProgress | null | undefined): SeasonProgress =>
  theirs && theirs.past.length > mine.past.length ? theirs : mine;

// --- Avaliação (spec 5.4) ---

const DAY = 86400000;

export interface MarkStatus {
  mark: SeasonMark;
  achieved: boolean;
  at: number | null; // o at do solve que acendeu o marco
  // count: solves da temporada; single, ao5 e ao12: o melhor até agora (ms); streak: a sequência que termina no último solve (dias);
  // steady: a menor variação entre 5 seguidos sem DNF (ms). null enquanto não há o que medir.
  current: number | null;
}

// Os solves que contam para a temporada: os eventos com marcos no catálogo (o 3×3) e depois do início.
export function seasonSolves(solves: Solve[], state: SeasonState): Solve[] {
  return solves.filter((s) => s.at > state.startedAt && countsForMilestones(s.event));
}

// A conta como uma dobra, solve a solve: o estado guarda o que ela precisa para continuar.
interface Fold {
  count: number;
  best: number | null;
  bestAo5: number | null;
  bestAo12: number | null;
  run: number;
  bestRun: number;
  prevDay: string | null;
  bestSpread: number | null;
  last: number[]; // os últimos 12 tempos efetivos (Infinity = DNF), do mais antigo ao mais novo
  at: (number | null)[]; // por marco
}

const initFold = (n: number): Fold => ({
  count: 0, best: null, bestAo5: null, bestAo12: null, run: 0, bestRun: 0, prevDay: null, bestSpread: null, last: [], at: Array<number | null>(n).fill(null),
});

// O menor entre o valor e o melhor até agora; DNF (Infinity) não conta.
const lower = (v: number | null, best: number | null): number | null => (v !== null && v !== Infinity && (best === null || v < best) ? v : best);

function met(mark: SeasonMark, f: Fold): boolean {
  switch (mark.kind) {
    case 'count':
      return f.count >= mark.target;
    case 'single':
      return f.best !== null && f.best < mark.target;
    case 'ao5':
      return f.bestAo5 !== null && f.bestAo5 < mark.target;
    case 'ao12':
      return f.bestAo12 !== null && f.bestAo12 < mark.target;
    case 'streak':
      return f.bestRun >= mark.target;
    case 'steady':
      return f.bestSpread !== null && f.bestSpread <= mark.target;
  }
}

function stepFold(f: Fold, marks: readonly SeasonMark[], x: Solve): void {
  const e = effectiveMs(x);
  f.count += 1;
  f.best = lower(e, f.best);
  const k = dayKey(x.at);
  if (k !== f.prevDay) {
    f.run = f.prevDay !== null && Math.round((noon(k) - noon(f.prevDay)) / DAY) === 1 ? f.run + 1 : 1;
    f.bestRun = Math.max(f.bestRun, f.run);
    f.prevDay = k;
  }
  f.last.push(e);
  if (f.last.length > 12) f.last.shift();
  if (f.last.length >= 5) {
    const five = f.last.slice(-5);
    f.bestAo5 = lower(trimmedMean(five), f.bestAo5);
    if (five.every((v) => v !== Infinity)) f.bestSpread = lower(Math.max(...five) - Math.min(...five), f.bestSpread);
  }
  if (f.last.length >= 12) f.bestAo12 = lower(trimmedMean(f.last), f.bestAo12);
  marks.forEach((m, i) => {
    if (f.at[i] === null && met(m, f)) f.at[i] = x.at;
  });
}

function currentOf(mark: SeasonMark, f: Fold): number | null {
  switch (mark.kind) {
    case 'count':
      return f.count;
    case 'single':
      return f.best;
    case 'ao5':
      return f.bestAo5;
    case 'ao12':
      return f.bestAo12;
    case 'streak':
      return f.run;
    case 'steady':
      return f.bestSpread;
  }
}

const statusOf = (marks: readonly SeasonMark[], f: Fold): MarkStatus[] =>
  marks.map((mark, i) => ({ mark: { ...mark }, achieved: f.at[i] !== null, at: f.at[i], current: currentOf(mark, f) }));

// Os marcos da temporada sobre a lista inteira (sem guardar nada). Para a conta de cada solve, use createSeasonTracker.
export function evaluateSeason(state: SeasonState, solves: Solve[]): MarkStatus[] {
  const f = initFold(state.marks.length);
  for (const x of seasonSolves(solves, state)) stepFold(f, state.marks, x);
  return statusOf(state.marks, f);
}

// A identidade de uma temporada para os rastreadores: o número, o início e as metas.
export const seasonKey = (state: SeasonState): string =>
  `${state.n}|${state.startedAt}|${state.marks.map((m) => `${m.kind}:${m.target}`).join(',')}`;

export interface SeasonTracker {
  evaluate(state: SeasonState, solves: Solve[]): MarkStatus[]; // o mesmo que evaluateSeason, sem recontar o que já contou
  lastRun(): 'cached' | 'appended' | 'full'; // como foi a última conta (para os testes e para medir)
}

// Guarda a última lista contada e o estado da dobra. Mesma temporada e uma lista que começa com os mesmos solves (os mesmos objetos,
// na mesma ordem): só os novos do fim entram na conta. Outra temporada, ou qualquer outra mudança na lista, refaz do zero.
export function createSeasonTracker(): SeasonTracker {
  let key = '';
  let marks: SeasonMark[] = [];
  let seen: Solve[] = [];
  let fold = initFold(0);
  let run: 'cached' | 'appended' | 'full' = 'full';
  return {
    evaluate(state, solves) {
      const k = seasonKey(state);
      const list = seasonSolves(solves, state);
      let prefix = k === key && list.length >= seen.length;
      for (let i = 0; prefix && i < seen.length; i++) prefix = list[i] === seen[i];
      if (prefix) {
        run = seen.length === 0 ? 'full' : list.length === seen.length ? 'cached' : 'appended';
      } else {
        key = k;
        marks = state.marks.map((m) => ({ ...m }));
        fold = initFold(marks.length);
        run = 'full';
      }
      for (let i = prefix ? seen.length : 0; i < list.length; i++) stepFold(fold, marks, list[i]);
      seen = list;
      return statusOf(marks, fold);
    },
    lastRun: () => run,
  };
}

// --- Virada (spec 5.5) ---

export interface SeasonAdvance {
  fromN: number; // a temporada que fecha: advanceSeason só grava se ela ainda for a atual
  record: SeasonRecord;
  next: SeasonState;
}

// O registro de uma temporada completa: fecha no solve que deu o último marco. A T1 começa no primeiro solve de 3×3.
export function closeRecord(state: SeasonState, solves: Solve[], status: MarkStatus[]): SeasonRecord {
  const endedAt = Math.max(...status.map((m) => m.at ?? -Infinity));
  const inSeason = seasonSolves(solves, state);
  const upToEnd = inSeason.filter((s) => s.at <= endedAt);
  return {
    n: state.n,
    startedAt: state.n === 1 ? (inSeason[0]?.at ?? state.startedAt) : state.startedAt,
    endedAt,
    solves: upToEnd.length,
    startAo12: state.basis.ao12,
    endAo12: bestAverage(upToEnd, 12),
  };
}

// A virada, quando os 9 marcos estão feitos; null se falta algum. A próxima começa no instante da conferência (na virada ao vivo, a
// milissegundos do solve que fechou) e tira as metas das marcas de todo o histórico de 3×3: sem solve nenhum ainda, ela não fecha na
// hora, e uma importação não vira temporadas em cascata.
export function planAdvance(
  progress: SeasonProgress,
  solves: Solve[],
  now: number,
  status: MarkStatus[] = evaluateSeason(progress.current, solves),
): SeasonAdvance | null {
  const cur = progress.current;
  if (status.length === 0 || !status.every((m) => m.achieved)) return null;
  const record = closeRecord(cur, solves, status);
  const basis = basisOf(solves.filter((s) => countsForMilestones(s.event)));
  return { fromN: cur.n, record, next: { n: cur.n + 1, startedAt: Math.max(now, record.endedAt), marks: marksFor(basis), basis } };
}

// --- Textos dos marcos ---

// A meta redonda como a pessoa fala: "18 s", "9.5 s", "1:30".
export function targetText(ms: number): string {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    const s = Math.round((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  const s = ms / 1000;
  return `${Number.isInteger(s) ? s : s.toFixed(1)} s`;
}

// O rótulo de um marco na lista. A T1 mantém os de hoje (MILESTONE_INFO, na ordem de MILESTONES).
export function markLabel(n: number, index: number, mark: SeasonMark): string {
  if (n === 1) return MILESTONE_INFO[MILESTONES[index]].label;
  switch (mark.kind) {
    case 'count':
      return T.marks.count(mark.target);
    case 'single':
      return T.marks.single(targetText(mark.target));
    case 'ao5':
      return T.marks.ao5(targetText(mark.target));
    case 'ao12':
      return T.marks.ao12(targetText(mark.target));
    case 'streak':
      return T.marks.streak(mark.target);
    case 'steady':
      return T.marks.steady((mark.target / 1000).toFixed(1));
  }
}

// A frase do coach para um marco conquistado. A T1 mantém as de hoje; da T2 em diante, o próprio rótulo.
export function markMessage(n: number, index: number, mark: SeasonMark): string {
  return n === 1 ? MILESTONE_INFO[MILESTONES[index]].msg : markLabel(n, index, mark);
}

// --- "Quase lá" (spec 7.2) ---

const NEAR = 1.03; // até 3% acima da meta
const NEAR_COUNT = 10; // faltam até 10 solves

export interface NearMark {
  index: number;
  mark: SeasonMark;
  gap: number; // tempo: ms acima da meta; count: solves que faltam; streak: 1 (falta um dia)
}

// Dias seguidos com solve, terminando no dia do solve `end` (a lista em ordem de tempo).
function runEndingAt(list: Solve[], end: number): number {
  let run = 1;
  let day = dayKey(list[end].at);
  for (let i = end - 1; i >= 0; i--) {
    const k = dayKey(list[i].at);
    if (k === day) continue;
    if (Math.round((noon(day) - noon(k)) / DAY) !== 1) break;
    run += 1;
    day = k;
  }
  return run;
}

// Quanto falta quando o solve `end` da lista (os da temporada, em ordem) deixa o marco perto; null quando não deixa.
function nearGap(mark: SeasonMark, list: Solve[], end: number): number | null {
  const solve = list[end];
  switch (mark.kind) {
    case 'ao5':
    case 'ao12': {
      const n = mark.kind === 'ao5' ? 5 : 12;
      if (end + 1 < n) return null;
      const v = trimmedMean(list.slice(end + 1 - n, end + 1).map(effectiveMs));
      return v !== Infinity && v > mark.target && v <= mark.target * NEAR ? v - mark.target : null;
    }
    case 'single': {
      const e = effectiveMs(solve);
      return e !== Infinity && e > mark.target && e <= mark.target * NEAR ? e - mark.target : null;
    }
    case 'count': {
      const left = mark.target - (end + 1);
      return left >= 1 && left <= NEAR_COUNT ? left : null;
    }
    case 'streak':
      if (end > 0 && dayKey(list[end - 1].at) === dayKey(solve.at)) return null; // só o primeiro solve do dia
      return runEndingAt(list, end) === mark.target - 1 ? 1 : null;
    case 'steady':
      return null;
  }
}

// O primeiro marco pendente que este solve deixou perto e que nenhum solve anterior da sessão, no mesmo dia, já tinha deixado: uma vez
// por marco por sessão e por dia (sessões duram semanas), sem memória (a conta refaz os anteriores). `prior` são os solves da temporada
// antes dele; `sessionPrior`, os da sessão.
export function firstNearToday(
  marks: readonly SeasonMark[],
  achieved: readonly boolean[],
  prior: Solve[],
  sessionPrior: Solve[],
  solve: Solve,
): NearMark | null {
  const list = [...prior, solve];
  const end = prior.length;
  const today = dayKey(solve.at);
  const inSession = new Set(sessionPrior.filter((s) => dayKey(s.at) === today).map((s) => s.id));
  for (let index = 0; index < marks.length; index++) {
    if (achieved[index]) continue;
    const mark = marks[index];
    const gap = nearGap(mark, list, end);
    if (gap === null) continue;
    let said = false;
    for (let j = 0; j < end && !said; j++) said = inSession.has(list[j].id) && nearGap(mark, list, j) !== null;
    if (!said) return { index, mark: { ...mark }, gap };
  }
  return null;
}
