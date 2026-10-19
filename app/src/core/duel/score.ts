// O placar do Head-to-Head (spec do desafio, seção 3): puro, sem relógio nem armazenamento.
import type { DuelSide, DuelTime } from '../types';

export const DUEL_SCRAMBLES = 7; // embaralhamentos de um desafio
export const DUEL_TARGET = 3; // pontos para vencer

// O tempo que vale na comparação: +2 soma dois segundos; DNF é o pior possível.
export function effectiveMs(t: DuelTime): number {
  if (t.penalty === 'DNF') return Infinity;
  return t.penalty === '+2' ? t.ms + 2000 : t.ms;
}

// A comparação é no centésimo (a resolução do cronômetro): 10,004 s e 10,009 s empatam.
function centis(t: DuelTime): number {
  return Math.floor(effectiveMs(t) / 10);
}

// null: empate, ninguém pontua (inclui dois DNF).
export function pointOf(a: DuelTime, b: DuelTime): DuelSide | null {
  const ca = centis(a);
  const cb = centis(b);
  if (ca === cb) return null;
  return ca < cb ? 'a' : 'b';
}

export interface DuelScore {
  points: Record<DuelSide, number>;
  perPoint: (DuelSide | null)[]; // um item por embaralhamento jogado, até a partida acabar
  over: boolean;
  winner: DuelSide | 'tie' | null; // só quando a partida acabou
}

// Menor tempo efetivo entre os índices jogados, sem contar DNF (só DNF dá Infinity).
function bestSingle(times: readonly DuelTime[], played: number): number {
  let best = Infinity;
  for (let i = 0; i < played; i++) best = Math.min(best, centis(times[i]!));
  return best;
}

// Compara índice a índice até o menor dos dois lados (B joga um por vez). A partida acaba quando alguém chega a DUEL_TARGET
// (o que sobrou não conta) ou quando os sete foram jogados.
export function scoreDuel(a: readonly DuelTime[], b: readonly DuelTime[]): DuelScore {
  const available = Math.min(a.length, b.length, DUEL_SCRAMBLES);
  const points: Record<DuelSide, number> = { a: 0, b: 0 };
  const perPoint: (DuelSide | null)[] = [];
  let played = 0;
  while (played < available && points.a < DUEL_TARGET && points.b < DUEL_TARGET) {
    const side = pointOf(a[played]!, b[played]!);
    if (side) points[side]++;
    perPoint.push(side);
    played++;
  }
  const over = points.a >= DUEL_TARGET || points.b >= DUEL_TARGET || played >= DUEL_SCRAMBLES;
  if (!over) return { points, perPoint, over, winner: null };
  if (points.a !== points.b) return { points, perPoint, over, winner: points.a > points.b ? 'a' : 'b' };
  // Empate em pontos: o melhor single entre os embaralhamentos jogados decide; igual (ou só DNF dos dois lados), empate.
  const bestA = bestSingle(a, played);
  const bestB = bestSingle(b, played);
  return { points, perPoint, over, winner: bestA === bestB ? 'tie' : bestA < bestB ? 'a' : 'b' };
}
