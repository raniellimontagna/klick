// Escolhe no máximo uma mensagem do coach por solve, pela prioridade da spec (6.5).
import { effectiveMs, bestSingle, bestAverage, averageOf, dayKey, formatMs } from './stats.js';
import { T, MILESTONE_INFO } from './strings.js';

const DAY = 86400000;

// Estável: os últimos 5 solves, sem DNF, dentro de 3 s entre o melhor e o pior.
function stableWindow(list) {
  const w = list.slice(-5).map(effectiveMs);
  return w.length === 5 && w.every((v) => v !== Infinity) && Math.max(...w) - Math.min(...w) <= 3000;
}

// Cansaço: 30+ solves na sessão e a média de 5 atual mais de 8% acima da média dos 12 primeiros.
function tired(session) {
  if (session.length < 30) return false;
  const first12 = averageOf(session.slice(0, 12), 12);
  const current5 = averageOf(session, 5);
  return first12 !== null && first12 !== Infinity && current5 !== null && current5 !== Infinity && current5 > first12 * 1.08;
}

// history: todos os solves anteriores (cronológico). sessionSolves: os anteriores da sessão atual.
// newMilestones: ids conquistados por este solve. achievedCount: total de marcos depois dele.
export function pickCoachMessage({ solve, history, sessionSolves, newMilestones = [], achievedCount = 0, dailyGoal = 20, silent = false }) {
  if (silent || !solve) return null;
  const e = effectiveMs(solve);
  const all = [...history, solve];

  const prevBest = bestSingle(history);
  if (prevBest !== null && e !== Infinity && e < prevBest) return { id: 'pb-single', text: T.coach.pbSingle(prevBest - e) };

  for (const n of [5, 12]) {
    const prevBestAvg = bestAverage(history, n);
    const current = averageOf(all, n);
    if (prevBestAvg !== null && current !== null && current !== Infinity && current < prevBestAvg) {
      return { id: 'pb-average', text: T.coach.pbAverage(n, formatMs(current)) };
    }
  }

  if (newMilestones.length) {
    const id = newMilestones[newMilestones.length - 1];
    return { id: 'milestone', text: T.coach.milestone(MILESTONE_INFO[id].msg, achievedCount) };
  }

  const today = all.filter((x) => dayKey(x.at) === dayKey(solve.at)).length;
  if (today === dailyGoal) return { id: 'daily-goal', text: T.coach.dailyGoal(dailyGoal) };

  // Só avisa ao entrar na sequência estável, não a cada solve dela.
  if (stableWindow(all) && !stableWindow(history)) return { id: 'stable', text: T.coach.stable };

  // Só avisa ao entrar no cansaço, não a cada solve dele.
  if (tired([...sessionSolves, solve]) && !tired(sessionSolves)) return { id: 'fatigue', text: T.coach.fatigue };

  if (solve.penalty === 'DNF' && !sessionSolves.some((x) => x.penalty === 'DNF')) return { id: 'first-dnf', text: T.coach.firstDnf };

  const prev = history[history.length - 1];
  if (prev && solve.at - prev.at >= 3 * DAY) return { id: 'back', text: T.coach.back };

  return null;
}
