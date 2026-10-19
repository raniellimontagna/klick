import { describe, expect, it } from 'vitest';
import { DUEL_SCRAMBLES, DUEL_TARGET, effectiveMs, pointOf, scoreDuel } from '../../src/core/duel/score';
import type { DuelTime } from '../../src/core/types';

const t = (ms: number, penalty: DuelTime['penalty'] = null): DuelTime => ({ ms, penalty });
const dnf = (ms = 9_000): DuelTime => t(ms, 'DNF');

describe('placar Head-to-Head (spec 3)', () => {
  it('as constantes do formato: sete embaralhamentos, três pontos', () => {
    expect(DUEL_SCRAMBLES).toBe(7);
    expect(DUEL_TARGET).toBe(3);
  });

  it('o mais rápido leva o ponto; +2 soma dois segundos na comparação', () => {
    expect(effectiveMs(t(10_000))).toBe(10_000);
    expect(effectiveMs(t(10_000, '+2'))).toBe(12_000);
    expect(pointOf(t(9_000), t(10_000))).toBe('a');
    expect(pointOf(t(10_000), t(9_000))).toBe('b');
    expect(pointOf(t(9_000, '+2'), t(10_000))).toBe('b'); // 11 s contra 10 s
    expect(pointOf(t(8_000, '+2'), t(10_000))).toBeNull(); // 10 s contra 10 s: empate
  });

  it('DNF é o pior; dois DNF ou empate no centésimo, ninguém pontua', () => {
    expect(effectiveMs(dnf())).toBe(Infinity);
    expect(pointOf(dnf(1_000), t(60_000))).toBe('b');
    expect(pointOf(t(60_000), dnf(1_000))).toBe('a');
    expect(pointOf(dnf(), dnf(2_000))).toBeNull();
    expect(pointOf(t(10_004), t(10_009))).toBeNull();
    expect(pointOf(t(10_009), t(10_010))).toBe('a');
  });

  it('quem chega a 3 vence e a partida acaba ali', () => {
    const a = [t(10_000), t(10_000), t(10_000), t(10_000), t(10_000), t(10_000), t(10_000)];
    const partial = scoreDuel(a, [t(9_000), t(9_000)]);
    expect(partial).toMatchObject({ points: { a: 0, b: 2 }, over: false, winner: null });
    // só 4 tempos de B: o 3º ponto de B (3º índice) encerra; o 4º nem conta
    const score = scoreDuel(a, [t(9_000), t(9_000), t(9_000), t(9_000)]);
    expect(score.points).toEqual({ a: 0, b: 3 });
    expect(score.perPoint).toEqual(['b', 'b', 'b']);
    expect(score.over).toBe(true);
    expect(score.winner).toBe('b');
    // quem desafia também vence assim, mesmo com B tendo jogado os sete
    const b = Array.from({ length: 7 }, () => t(20_000));
    const win = scoreDuel(a, b);
    expect(win).toMatchObject({ points: { a: 3, b: 0 }, over: true, winner: 'a' });
    expect(win.perPoint).toHaveLength(3);
  });

  it('sem ninguém em 3 nos sete, vence quem tem mais pontos', () => {
    // a: 2 pontos, b: 1 ponto, quatro empates
    const a = [t(9_000), t(9_000), t(10_000), t(10_000), t(10_000), t(10_000), t(10_000)];
    const b = [t(10_000), t(10_000), t(9_000), t(10_000), t(10_000), t(10_000), t(10_000)];
    const score = scoreDuel(a, b);
    expect(score.perPoint).toEqual(['a', 'a', 'b', null, null, null, null]);
    expect(score).toMatchObject({ points: { a: 2, b: 1 }, over: true, winner: 'a' });
  });

  it('empate em pontos: decide o melhor single jogado; depois, empate', () => {
    const base = (ms: number) => Array.from({ length: 7 }, () => t(ms));
    // 1 a 1; o melhor single de B (8 s) vence o de A (9 s)
    const a = [t(9_000), t(11_000), ...Array.from({ length: 5 }, () => t(10_000))];
    const b = [t(12_000), t(8_000), ...Array.from({ length: 5 }, () => t(10_000))];
    expect(scoreDuel(a, b)).toMatchObject({ points: { a: 1, b: 1 }, over: true, winner: 'b' });
    // melhor single igual no centésimo: empate
    const b2 = [t(12_000), t(9_005), ...Array.from({ length: 5 }, () => t(10_000))];
    expect(scoreDuel(a, b2).winner).toBe('tie');
    // sem ponto algum e tudo igual: empate
    expect(scoreDuel(base(10_000), base(10_000))).toMatchObject({ points: { a: 0, b: 0 }, over: true, winner: 'tie' });
    // dois lados só de DNF: empate
    const allDnf = Array.from({ length: 7 }, () => dnf());
    expect(scoreDuel(allDnf, allDnf)).toMatchObject({ points: { a: 0, b: 0 }, over: true, winner: 'tie' });
  });

  it('o melhor single ignora DNF e conta o +2', () => {
    // 1 a 1, o resto empata em 11 s; o 9 s de A com +2 vale 11 s, então os dois melhores singles empatam
    const a = [t(9_000, '+2'), dnf(), ...Array.from({ length: 5 }, () => t(11_000))];
    const b = [t(12_000), t(30_000), ...Array.from({ length: 5 }, () => t(11_000))];
    const score = scoreDuel(a, b);
    expect(score.points).toEqual({ a: 1, b: 1 });
    expect(score.winner).toBe('tie');
  });
});
