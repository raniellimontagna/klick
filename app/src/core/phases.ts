// Fases do solve (marcadas por toque no cronômetro): os nomes e as médias por fase. Pura, sem DOM.
import { T } from '../strings';
import type { EventId, Solve } from './types';

// Os nomes das N fases: com 4 fases no 3×3 são os do CFOP (cruz, F2L, OLL e PLL); nos outros casos, "Fase 1"…
export function phaseLabels(n: number, event: EventId): string[] {
  if (n === T.fases.cfop.length && event === '333') return [...T.fases.cfop];
  return Array.from({ length: Math.max(0, n) }, (_, i) => T.fases.n(i + 1));
}

export interface PhaseAverages {
  n: number; // quantas fases
  means: number[]; // a média de cada fase, em ms
  shares: number[]; // a fatia de cada fase no total (média da fase sobre a soma das médias); soma 1
  heaviest: number; // o índice da fase mais demorada
  used: number; // quantos solves entraram na média (até `last`)
}

// As médias por fase dos últimos `last` solves sem DNF com o mesmo número de fases do solve mais recente que tem fases (mistura de 2 e 4
// fases não se compara). Só entram solves cujas fases fecham o tempo (validPhases): as que chegam malformadas pelo sync ou por um arquivo
// não estragam a média com NaN. Sem nenhum solve com fases, ou sem nenhum válido nesse formato, é null.
export function phaseAverages(pool: readonly Solve[], last = 12): PhaseAverages | null {
  const latest = pool.findLast((s) => s.phases !== undefined && s.phases.length > 0);
  const n = latest?.phases?.length;
  if (n === undefined) return null;
  const used: number[][] = [];
  for (let i = pool.length - 1; i >= 0 && used.length < last; i--) {
    const s = pool[i];
    if (s.penalty === 'DNF' || s.phases?.length !== n) continue;
    const valid = validPhases(s);
    if (valid) used.push(valid);
  }
  if (used.length === 0) return null;
  const means = Array.from({ length: n }, (_, k) => used.reduce((sum, p) => sum + p[k], 0) / used.length);
  const total = means.reduce((a, b) => a + b, 0);
  const shares = means.map((m) => (total > 0 ? m / total : 0));
  return { n, means, shares, heaviest: means.indexOf(Math.max(...means)), used: used.length };
}

// As fases de um solve que dá para mostrar (uma cópia), ou null. As que chegam pelo sync ou por um arquivo não passaram pelo timer daqui:
// só valem de 2 a 4 durações, números finitos e não negativos, somando o tempo bruto (`ms`, maior que zero).
export function validPhases(solve: Pick<Solve, 'ms' | 'phases'>): number[] | null {
  const phases: unknown = solve.phases;
  if (!Array.isArray(phases) || phases.length < 2 || phases.length > 4) return null;
  if (!phases.every((d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0)) return null;
  if (!Number.isFinite(solve.ms) || solve.ms <= 0) return null;
  const sum = phases.reduce((a, b) => a + b, 0);
  return Math.abs(sum - solve.ms) < 0.5 ? [...phases] : null;
}

// A parte de cada fase no total, em porcentos inteiros que somam 100: cada uma leva o piso, e os pontos que faltam vão para os maiores
// restos (sem isso, 33 + 33 + 33 daria 99). Sem total, tudo zero.
export function phaseShares(phases: readonly number[]): number[] {
  const total = phases.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return phases.map(() => 0);
  const exact = phases.map((d) => (d / total) * 100);
  const out = exact.map((x) => Math.floor(x));
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const byRest = exact.map((x, i) => ({ i, rest: x - Math.floor(x) })).sort((a, b) => b.rest - a.rest);
  for (const { i } of byRest) {
    if (left <= 0) break;
    out[i] += 1;
    left -= 1;
  }
  return out;
}
