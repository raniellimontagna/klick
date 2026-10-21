import { describe, expect, it } from 'vitest';
import { phaseAverages, phaseLabels, phaseShares, validPhases } from '../../src/core/phases';
import type { Solve } from '../../src/core/types';

let seq = 0;
function solve(ms: number, phases?: number[], penalty: Solve['penalty'] = null): Solve {
  seq += 1;
  return {
    id: `s${seq}`,
    sessionId: 'x',
    event: '333',
    ms,
    penalty,
    at: seq,
    scramble: '',
    note: '',
    createdAt: seq,
    updatedAt: seq,
    deletedAt: null,
    ...(phases ? { phases } : {}),
  };
}

describe('phaseLabels', () => {
  it('nomes do CFOP só com 4 fases no 3×3', () => {
    expect(phaseLabels(4, '333')).toEqual(['Cruz', 'F2L', 'OLL', 'PLL']);
    expect(phaseLabels(4, '222')).toEqual(['Fase 1', 'Fase 2', 'Fase 3', 'Fase 4']);
    expect(phaseLabels(3, '333')).toEqual(['Fase 1', 'Fase 2', 'Fase 3']);
    expect(phaseLabels(2, '333oh')).toEqual(['Fase 1', 'Fase 2']);
  });

  it('zero ou menos fases não tem nome', () => {
    expect(phaseLabels(0, '333')).toEqual([]);
  });
});

describe('phaseAverages', () => {
  it('é null sem nenhum solve com fases', () => {
    expect(phaseAverages([])).toBeNull();
    expect(phaseAverages([solve(10000), solve(11000)])).toBeNull();
  });

  it('usa só os de mesmo número de fases do mais recente, sem DNF', () => {
    const pool = [
      solve(9000, [3000, 6000]), // duas fases: de outro formato, fica de fora
      solve(10000, [1000, 2000, 3000, 4000]),
      solve(0, [1, 1, 1, 1], 'DNF'), // DNF: fora
      solve(12000, [2000, 3000, 3000, 4000]),
      solve(8000), // sem fases: não conta, e o "mais recente com fases" é o de baixo
      solve(14000, [3000, 3000, 4000, 4000]),
      solve(7000), // sem fases, mais novo ainda
    ];
    const a = phaseAverages(pool)!;
    expect(a.n).toBe(4);
    expect(a.means).toEqual([2000, 8000 / 3, 10000 / 3, 4000]);
    expect(a.used).toBe(3); // quantos entraram na média
  });

  it('um solve com fases malformadas (do sync ou de um arquivo) não entra na média', () => {
    const pool = [solve(10000, [4000, 6000]), solve(10000, [2000, Number.NaN]), solve(9000, [4000, 6000])]; // o do meio tem NaN; o último não soma
    const a = phaseAverages(pool)!;
    expect(a.used).toBe(1);
    expect(a.means).toEqual([4000, 6000]);
    expect(phaseAverages([solve(9000, [4000, 6000])])).toBeNull();
  });

  it('o formato vem do mais recente com fases válidas, mesmo DNF; um DNF de fases tortas não manda no formato', () => {
    // O DNF com ms 0 e fases que não fecham não é válido: o formato é o do solve válido anterior.
    expect(phaseAverages([solve(10000, [4000, 6000]), solve(0, [1, 2, 3], 'DNF')])!.means).toEqual([4000, 6000]);
    // Um DNF com fases que fecham o tempo bruto manda no formato; sem nenhum válido nele, é null.
    expect(phaseAverages([solve(10000, [4000, 6000]), solve(6000, [1000, 2000, 3000], 'DNF')])).toBeNull();
    expect(phaseAverages([solve(10000, [4000, 3000, 3000]), solve(6000, [1000, 2000, 3000], 'DNF')])!.means).toEqual([4000, 3000, 3000]);
  });

  // I2 da revisão final: fases que chegam do sync (o servidor e isSolve aceitam o registro) ou de um arquivo não podem derrubar a conta.
  const bad = (phases: unknown, ms = 10000): Solve => ({ ...solve(ms), phases: phases as number[] });
  it.each([
    ['null', null],
    ['objeto', {}],
    ['com NaN', [Number.NaN, 1]],
    ['com cinco fases', [1, 2, 3, 4, 5]],
    ['texto', 'abc'],
  ])('fases %s não derrubam: o solve fica de fora e o resto da média continua', (_n, phases) => {
    expect(() => phaseAverages([bad(phases)])).not.toThrow();
    expect(phaseAverages([bad(phases)])).toBeNull();
    const pool = [solve(10000, [4000, 6000]), bad(phases), solve(9000, [3000, 6000])];
    const a = phaseAverages(pool)!;
    expect(a.used).toBe(2);
    expect(a.means).toEqual([3500, 6000]);
    // O mais recente com fases válidas manda no formato, mesmo com um torto mais novo na frente.
    expect(phaseAverages([solve(10000, [4000, 6000]), bad(phases)])!.means).toEqual([4000, 6000]);
  });

  it('respeita o limite de `last`, pegando os mais recentes', () => {
    const pool = [solve(10000, [5000, 5000]), solve(10000, [2000, 8000]), solve(10000, [4000, 6000])];
    expect(phaseAverages(pool, 2)!.means).toEqual([3000, 7000]);
    expect(phaseAverages(pool)!.means).toEqual([11000 / 3, 19000 / 3]);
  });

  it('shares somam 1 e heaviest aponta a maior', () => {
    const a = phaseAverages([solve(10000, [1000, 6000, 3000]), solve(10000, [1000, 4000, 5000])])!;
    expect(a.means).toEqual([1000, 5000, 4000]);
    expect(a.shares.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 10);
    expect(a.shares[1]).toBeCloseTo(0.5, 10);
    expect(a.heaviest).toBe(1);
  });
});

// As fases que chegam pelo sync ou por um arquivo não passaram pelo timer daqui: a tela só mostra as que fecham o solve.
describe('validPhases', () => {
  const s = (ms: number, phases?: unknown) => ({ ms, phases }) as Pick<Solve, 'ms' | 'phases'>;

  it('devolve uma cópia das fases de 2 a 4 durações, finitas e não negativas, que somam o tempo bruto', () => {
    const phases = [1840, 6120, 2150, 3230];
    const got = validPhases(s(13340, phases));
    expect(got).toEqual(phases);
    expect(got).not.toBe(phases);
    expect(validPhases(s(5000, [0, 5000]))).toEqual([0, 5000]);
  });

  it('o resto é null: sem fases, fora de 2 a 4, número torto, negativo, ou que não fecha o tempo', () => {
    expect(validPhases(s(10000))).toBeNull();
    expect(validPhases(s(10000, [10000]))).toBeNull();
    expect(validPhases(s(10000, [2000, 2000, 2000, 2000, 2000]))).toBeNull();
    expect(validPhases(s(10000, 'abc'))).toBeNull();
    expect(validPhases(s(10000, [5000, '5000']))).toBeNull();
    expect(validPhases(s(10000, [5000, Number.NaN]))).toBeNull();
    expect(validPhases(s(10000, [Number.POSITIVE_INFINITY, 5000]))).toBeNull();
    expect(validPhases(s(10000, [12000, -2000]))).toBeNull();
    expect(validPhases(s(10000, [5000, 4000]))).toBeNull();
    expect(validPhases(s(0, [0, 0]))).toBeNull(); // sem tempo, não há parte de nada
  });
});

describe('phaseShares', () => {
  it('a parte de cada fase em porcentos inteiros, somando 100', () => {
    expect(phaseShares([1840, 6120, 2150, 3230])).toEqual([14, 46, 16, 24]);
    const thirds = phaseShares([1000, 1000, 1000]);
    expect(thirds.reduce((a, b) => a + b, 0)).toBe(100);
    expect([...thirds].sort()).toEqual([33, 33, 34]);
    expect(phaseShares([0, 0])).toEqual([0, 0]);
  });
});
