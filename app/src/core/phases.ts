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
}

// As médias por fase dos últimos `last` solves sem DNF com o mesmo número de fases do solve mais recente que tem fases (mistura de 2 e 4
// fases não se compara). Sem nenhum solve com fases, ou sem nenhum válido nesse formato, é null.
export function phaseAverages(pool: readonly Solve[], last = 12): PhaseAverages | null {
  const latest = pool.findLast((s) => s.phases !== undefined && s.phases.length > 0);
  const n = latest?.phases?.length;
  if (n === undefined) return null;
  const used: number[][] = [];
  for (let i = pool.length - 1; i >= 0 && used.length < last; i--) {
    const s = pool[i];
    if (s.penalty !== 'DNF' && s.phases?.length === n) used.push(s.phases);
  }
  if (used.length === 0) return null;
  const means = Array.from({ length: n }, (_, k) => used.reduce((sum, p) => sum + p[k], 0) / used.length);
  const total = means.reduce((a, b) => a + b, 0);
  const shares = means.map((m) => (total > 0 ? m / total : 0));
  return { n, means, shares, heaviest: means.indexOf(Math.max(...means)) };
}
