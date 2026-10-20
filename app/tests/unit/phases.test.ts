import { describe, expect, it } from 'vitest';
import { phaseAverages, phaseLabels } from '../../src/core/phases';
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
  });

  it('o formato vem do mais recente com fases, mesmo DNF; sem nenhum válido nesse formato, é null', () => {
    expect(phaseAverages([solve(10000, [4000, 6000]), solve(0, [1, 2, 3], 'DNF')])).toBeNull();
    // Com um válido do mesmo formato mais atrás, a média sai dele.
    expect(phaseAverages([solve(10000, [4000, 3000, 3000]), solve(0, [1, 2, 3], 'DNF')])!.means).toEqual([4000, 3000, 3000]);
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
