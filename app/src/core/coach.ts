// Escolhe no máximo uma mensagem do coach por solve, pela prioridade da spec (6.5). Porte de prototype/scripts/coach.js,
// com o recorde de média pela média oficial do evento (Ao5, ou Mo3 no 6×6, no 7×7 e no 3BLD).
import { MILESTONE_INFO, T } from '../strings';
import { averageOf, bestAverage, bestMean, bestSingle, effectiveMs, formatMs, officialAverage, officialAverageLabel, solvesOnDay } from './stats';
import type { EventId, Solve } from './types';

export interface CoachMessage {
  id: string;
  text: string;
}

export interface CoachInput {
  solve: Solve; // o solve que acabou de sair
  history: Solve[]; // todos os solves anteriores, do mesmo evento do solve (cronológico): dele saem os recordes
  sessionSolves: Solve[]; // os anteriores da sessão atual
  newMilestones?: string[]; // ids conquistados por este solve; a interface só os passa para o 3×3
  achievedCount?: number; // total de marcos depois dele
  dailyGoal?: number;
  // A meta do dia e o "de volta" são da pessoa, não do evento, e history só tem o evento. A interface passa estes dois:
  todayCount?: number; // solves de hoje em todos os eventos, contando este; sem ele, conta os de hoje que vieram em history
  prevAnyAt?: number; // momento do solve anterior da pessoa, de qualquer evento; sem ele, o do último solve de history
  silent?: boolean;
  event: EventId; // diz qual é a média oficial: Ao5 ou Mo3
}

const DAY = 86400000;

type MilestoneKey = keyof typeof MILESTONE_INFO;
const isMilestone = (id: string): id is MilestoneKey => Object.hasOwn(MILESTONE_INFO, id);

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

export function pickCoachMessage({
  solve,
  history,
  sessionSolves,
  newMilestones = [],
  achievedCount = 0,
  dailyGoal = 20,
  todayCount,
  prevAnyAt,
  silent = false,
  event,
}: CoachInput): CoachMessage | null {
  if (silent || !solve) return null;
  const e = effectiveMs(solve);
  const all = [...history, solve];

  const prevBest = bestSingle(history);
  if (prevBest !== null && e !== Infinity && e < prevBest) return { id: 'pb-single', text: T.coach.pbSingle(prevBest - e) };

  const record = averageRecord(history, all, event);
  if (record) return { id: 'pb-average', text: T.coach.pbAverage(record.n, formatMs(record.value)) };

  // Quem chama só passa marcos do 3×3. Um id que o catálogo não conhece é ignorado em vez de quebrar a mensagem.
  const milestone = newMilestones.findLast(isMilestone);
  if (milestone) return { id: 'milestone', text: T.coach.milestone(MILESTONE_INFO[milestone].msg, achievedCount) };

  // A meta é da pessoa: todayCount já conta todos os eventos. Sem ele, valem os solves de hoje que vieram em history.
  const today = todayCount ?? solvesOnDay(all, solve.at).length;
  if (today === dailyGoal) return { id: 'daily-goal', text: T.coach.dailyGoal(dailyGoal) };

  // A sequência estável olha o histórico; o cansaço, a sessão.
  // Só avisa ao entrar na sequência estável, não a cada solve dela.
  if (stableWindow(all) && !stableWindow(history)) return { id: 'stable', text: T.coach.stable };

  // Só avisa ao entrar no cansaço, não a cada solve dele.
  if (tired([...sessionSolves, solve]) && !tired(sessionSolves)) return { id: 'fatigue', text: T.coach.fatigue };

  if (solve.penalty === 'DNF' && !sessionSolves.some((x) => x.penalty === 'DNF')) return { id: 'first-dnf', text: T.coach.firstDnf };

  // "De volta" também é da pessoa: prevAnyAt é o solve anterior em qualquer evento. Sem ele, o último de history.
  const prevAt = prevAnyAt ?? history.at(-1)?.at;
  if (prevAt !== undefined && solve.at - prevAt >= 3 * DAY) return { id: 'back', text: T.coach.back };

  return null;
}
