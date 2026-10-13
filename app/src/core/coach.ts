// Escolhe no máximo uma mensagem do coach por solve, pela prioridade da spec do sub-projeto 3 (seção 7.1). Porte de
// prototype/scripts/coach.js, com o recorde de média pela média oficial do evento (Ao5, ou Mo3 no 6×6, no 7×7 e no 3BLD) e os gatilhos
// novos: fim de temporada, quase lá, semana melhor e fora da curva. Tudo sai do histórico, sem estado guardado.
import { FINISH_INFO, T } from '../strings';
import { eventInfo } from './events';
import { firstNearInSession, type MarkStatus, markMessage, type NearMark, targetText } from './season';
import {
  averageOf,
  bestAverage,
  bestMean,
  bestSingle,
  effectiveMs,
  formatMs,
  officialAverage,
  officialAverageLabel,
  solvesOnDay,
  trimmedMean,
} from './stats';
import type { EventId, FinishId, SeasonState, Solve } from './types';

export interface CoachMessage {
  id: string;
  text: string;
}

// O solve fechou a temporada: o resumo que o coach fala.
export interface SeasonEnd {
  n: number;
  solves: number;
  startAo12: number | null;
  endAo12: number | null;
  finish: FinishId | null; // o acabamento que a temporada liberou (só as três primeiras)
}

// A temporada do solve, para os gatilhos de marco e de "quase lá". Só o 3×3 tem.
export interface CoachSeason {
  state: SeasonState; // a temporada em que o solve caiu (a de quando ele começou: a virada pode já ter gravado a próxima)
  before: MarkStatus[]; // os marcos antes do solve
  after: MarkStatus[]; // os marcos depois dele
  prior: Solve[]; // os solves da temporada antes dele
  end: SeasonEnd | null; // o solve fechou a temporada
}

export interface CoachInput {
  solve: Solve; // o solve que acabou de sair
  history: Solve[]; // todos os solves anteriores, do mesmo evento do solve (cronológico): dele saem os recordes
  sessionSolves: Solve[]; // os anteriores da sessão atual
  season?: CoachSeason; // a interface só passa no 3×3
  dailyGoal?: number;
  // A meta do dia e o "de volta" são da pessoa, não do evento, e history só tem o evento. A interface passa estes dois:
  todayCount?: number; // solves de hoje em todos os eventos, contando este; sem ele, conta os de hoje que vieram em history
  prevAnyAt?: number; // momento do solve anterior da pessoa, de qualquer evento; sem ele, o do último solve de history
  silent?: boolean;
  event: EventId; // diz qual é a média oficial: Ao5 ou Mo3
}

const DAY = 86400000;

// Estável: os últimos 5 solves, sem DNF, dentro de 3 s entre o melhor e o pior.
function stableWindow(list: Solve[]): boolean {
  const w = list.slice(-5).map(effectiveMs);
  return w.length === 5 && w.every((v) => v !== Infinity) && Math.max(...w) - Math.min(...w) <= 3000;
}

// Cansaço: 30+ solves na sessão e a média de 5 atual mais de 8% acima da média dos 12 primeiros.
function tired(session: Solve[]): boolean {
  if (session.length < 30) return false;
  const first12 = averageOf(session.slice(0, 12), 12);
  const current5 = averageOf(session, 5);
  return first12 !== null && first12 !== Infinity && current5 !== null && current5 !== Infinity && current5 > first12 * 1.08;
}

// A média nova bate a melhor de antes: precisa ser válida (DNF não é recorde) e estritamente menor. Sem melhor de antes, não bate.
const beats = (current: number, previousBest: number | null): boolean => previousBest !== null && current !== Infinity && current < previousBest;

// Recorde de média, com o tamanho da média que o bateu. Vale a média oficial do evento e, nos eventos de Ao5, também a de 12.
// O Mo3 é média simples, então o melhor de antes sai de bestMean: bestAverage(s, 3) daria a mediana de cada janela.
function averageRecord(history: Solve[], all: Solve[], event: EventId): { n: number; value: number } | null {
  const { n, kind } = officialAverageLabel(event);
  const official = officialAverage(all, event);
  if (official !== null && beats(official, kind === 'mo' ? bestMean(history, n) : bestAverage(history, n))) return { n, value: official };
  if (kind === 'ao') {
    const twelve = averageOf(all, 12);
    if (twelve !== null && beats(twelve, bestAverage(history, 12))) return { n: 12, value: twelve };
  }
  return null;
}

function nearText(n: number, near: NearMark): string {
  const { mark, gap } = near;
  switch (mark.kind) {
    case 'ao5':
      return T.coach.nearAverage(5, gap, targetText(mark.target));
    case 'ao12':
      return T.coach.nearAverage(12, gap, targetText(mark.target));
    case 'single':
      return T.coach.nearSingle(gap, targetText(mark.target));
    case 'count':
      return T.coach.nearCount(gap, mark.target, n > 1);
    default:
      return T.coach.nearStreak(mark.target);
  }
}

// O começo do dia local de ts, `back` dias antes (setDate respeita o horário de verão).
function dayStart(ts: number, back = 0): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - back);
  return d.getTime();
}

const WEEK_MIN = 12; // solves sem DNF em cada janela
const WEEK_GAIN = 0.01; // a semana recente precisa ser pelo menos 1% mais rápida

function finiteMean(list: Solve[]): { n: number; mean: number } {
  const v = list.map(effectiveMs).filter((x) => x !== Infinity);
  return { n: v.length, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : Infinity };
}

// Semana melhor: no primeiro solve do dia no evento, a média (sem DNF) dos 7 dias anteriores contra a dos 7 antes deles. Devolve
// quanto a semana recente foi mais rápida (ms), ou null.
function weekBetter(history: Solve[], solve: Solve): number | null {
  const today = dayStart(solve.at);
  if (history.some((s) => s.at >= today)) return null;
  const weekAgo = dayStart(solve.at, 7);
  const recent = finiteMean(history.filter((s) => s.at >= weekAgo && s.at < today));
  const before = finiteMean(history.filter((s) => s.at >= dayStart(solve.at, 14) && s.at < weekAgo));
  if (recent.n < WEEK_MIN || before.n < WEEK_MIN) return null;
  const gain = before.mean - recent.mean;
  return gain >= before.mean * WEEK_GAIN ? gain : null;
}

const OUTLIER = 1.25;

// Fora da curva no solve `end` da lista: sem DNF, com 12 antes, acima de 1,25 vez a média de 12 deles, e a média de 12 com ele continua
// válida (a frase diz que ela "segue"). Devolve essa média, ou null.
function outlierAt(list: Solve[], end: number): number | null {
  if (end < 12) return null;
  const e = effectiveMs(list[end]);
  if (e === Infinity) return null;
  const before = trimmedMean(list.slice(end - 12, end).map(effectiveMs));
  if (before === Infinity || e <= before * OUTLIER) return null;
  const withIt = trimmedMean(list.slice(end - 11, end + 1).map(effectiveMs));
  return withIt === Infinity ? null : withIt;
}

// Só o primeiro da sessão: nenhum solve anterior da sessão foi fora da curva.
function outlier(session: Solve[]): number | null {
  const end = session.length - 1;
  const value = outlierAt(session, end);
  if (value === null) return null;
  for (let i = 12; i < end; i++) if (outlierAt(session, i) !== null) return null;
  return value;
}

export function pickCoachMessage({
  solve,
  history,
  sessionSolves,
  season,
  dailyGoal = 20,
  todayCount,
  prevAnyAt,
  silent = false,
  event,
}: CoachInput): CoachMessage | null {
  if (silent || !solve) return null;
  const e = effectiveMs(solve);
  const all = [...history, solve];

  const end = season?.end;
  if (end) {
    const from = end.startAo12 === null ? null : formatMs(end.startAo12);
    const to = end.endAo12 === null ? null : formatMs(end.endAo12);
    return { id: 'season-end', text: T.coach.seasonEnd(end.n, end.solves, from, to, end.finish ? FINISH_INFO[end.finish].label : null) };
  }

  const prevBest = bestSingle(history);
  if (prevBest !== null && e !== Infinity && e < prevBest) return { id: 'pb-single', text: T.coach.pbSingle(prevBest - e) };

  const record = averageRecord(history, all, event);
  if (record) return { id: 'pb-average', text: T.coach.pbAverage(record.n, formatMs(record.value)) };

  if (season) {
    // O marco que este solve acendeu (o último, se foram vários) e, sem marco, o primeiro que ficou perto.
    const fresh = season.after.flatMap((m, i) => (m.achieved && !season.before[i]?.achieved ? [i] : []));
    const lit = fresh.at(-1);
    if (lit !== undefined) {
      const count = season.after.filter((m) => m.achieved).length;
      return { id: 'milestone', text: T.coach.milestone(markMessage(season.state.n, lit, season.state.marks[lit]), count) };
    }
    const near = firstNearInSession(season.state.marks, season.after.map((m) => m.achieved), season.prior, sessionSolves, solve);
    if (near) return { id: 'near', text: nearText(season.state.n, near) };
  }

  // A meta é da pessoa: todayCount já conta todos os eventos. Sem ele, valem os solves de hoje que vieram em history.
  const today = todayCount ?? solvesOnDay(all, solve.at).length;
  if (today === dailyGoal) return { id: 'daily-goal', text: T.coach.dailyGoal(dailyGoal) };

  const week = weekBetter(history, solve);
  if (week !== null) return { id: 'week', text: T.coach.week(eventInfo(event).name, week) };

  // A sequência estável olha o histórico; o cansaço, a sessão. Os dois avisam só ao entrar, não a cada solve.
  if (stableWindow(all) && !stableWindow(history)) return { id: 'stable', text: T.coach.stable };
  if (tired([...sessionSolves, solve]) && !tired(sessionSolves)) return { id: 'fatigue', text: T.coach.fatigue };

  const out = outlier([...sessionSolves, solve]);
  if (out !== null) return { id: 'outlier', text: T.coach.outlier(formatMs(out)) };

  if (solve.penalty === 'DNF' && !sessionSolves.some((x) => x.penalty === 'DNF')) return { id: 'first-dnf', text: T.coach.firstDnf };

  // "De volta" também é da pessoa: prevAnyAt é o solve anterior em qualquer evento. Sem ele, o último de history.
  const prevAt = prevAnyAt ?? history.at(-1)?.at;
  if (prevAt !== undefined && solve.at - prevAt >= 3 * DAY) return { id: 'back', text: T.coach.back };

  return null;
}
