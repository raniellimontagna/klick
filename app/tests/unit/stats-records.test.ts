import { describe, expect, it } from 'vitest';
import {
  RECORD_SIZES, averageOf, bestAverage, bestSingle, effectiveMs, records, rollingAverages, trimCount, windowOf,
} from '../../src/core/stats';
import type { Solve } from '../../src/core/types';

let id = 0;
const sv = (ms: number, penalty: Solve['penalty'] = null, at = 1_000_000): Solve => ({
  id: String(++id), sessionId: 's1', event: '333', ms, penalty, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});

// Gerador pseudoaleatório com semente (mulberry32): o teste não pode mudar de uma rodada para outra.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cópia literal do algoritmo de antes da janela deslizante: cada janela é copiada, ordenada e cortada. É a referência.
const toCentisecondRef = (ms: number): number => Math.round(ms / 10) * 10;
function trimmedMeanRef(values: number[]): number {
  const t = Math.ceil(values.length * 0.05);
  const kept = [...values].sort((a, b) => a - b).slice(t, values.length - t);
  if (kept.some((v) => v === Infinity)) return Infinity;
  return toCentisecondRef(kept.reduce((a, b) => a + b, 0) / kept.length);
}
function rollingAveragesRef(solves: Solve[], n: number): (number | null)[] {
  const eff = solves.map(effectiveMs);
  return eff.map((_, i) => (i + 1 < n ? null : trimmedMeanRef(eff.slice(i + 1 - n, i + 1))));
}

// Solves sintéticos: faixa de tempos curta gera muitos empates; dnf e plus2 são as chances de cada penalidade.
function gen(rand: () => number, count: number, spread: number, dnf: number, plus2: number): Solve[] {
  return Array.from({ length: count }, () => {
    const r = rand();
    const penalty: Solve['penalty'] = r < dnf ? 'DNF' : r < dnf + plus2 ? '+2' : null;
    return sv(5000 + Math.floor(rand() * spread), penalty);
  });
}

describe('rollingAverages incremental', () => {
  it('rollingAverages incremental é igual ao ingênuo', () => {
    const rand = rng(20261020);
    for (let k = 0; k < 1000; k++) {
      // n de 3 a 1000, com a maioria pequena (como nas médias de verdade) e alguns grandes
      const n = 3 + Math.floor(rand() ** 3 * 998);
      const count = n + Math.floor(rand() * 40);
      const spread = [20, 300, 30000][k % 3]!;
      const dnf = [0, 0.02, 0.15][Math.floor(k / 3) % 3]!;
      const solves = gen(rand, count, spread, dnf, 0.1);
      expect(rollingAverages(solves, n), `caso ${k}: n=${n}, N=${count}`).toEqual(rollingAveragesRef(solves, n));
    }
  });

  it('janelas curtas dão null, e n = 1 e 2 (corte come tudo) seguem o ingênuo', () => {
    const rand = rng(7);
    const solves = gen(rand, 30, 500, 0.1, 0.1);
    for (const n of [1, 2, 3, 5, 12, 29, 30, 31, 50]) {
      expect(rollingAverages(solves, n)).toEqual(rollingAveragesRef(solves, n));
    }
    expect(rollingAverages([], 5)).toEqual([]);
  });

  it('DNF acima do corte vira Infinity, e dentro do corte some', () => {
    const base = [60000, 61000, 62000, 63000, 64000].map((ms) => sv(ms));
    const um = rollingAverages([...base, sv(1, 'DNF')], 5);
    expect(um[5]).toBe(63000); // 1 DNF cabe no corte de 1 (ao5): sobram 62000, 63000, 64000
    const dois = rollingAverages([sv(60000), sv(61000), sv(1, 'DNF'), sv(63000), sv(2, 'DNF')], 5);
    expect(dois[4]).toBe(Infinity);
  });

  it('bestAverage usa o incremental e dá o mesmo que a versão ingênua', () => {
    const rand = rng(99);
    const solves = gen(rand, 400, 4000, 0.05, 0.1);
    for (const n of [5, 12, 50, 100]) {
      let best: number | null = null;
      for (const v of rollingAveragesRef(solves, n)) if (v !== null && v !== Infinity && (best === null || v < best)) best = v;
      expect(bestAverage(solves, n)).toBe(best);
    }
  });
});

describe('records', () => {
  it('records: melhor e atual de single e das cinco médias, com o índice da melhor janela', () => {
    // 1.200 solves: o trecho bom (tempos baixos) ocupa os índices 300 a 399
    const rand = rng(3);
    const solves = gen(rand, 1200, 3000, 0.01, 0.05);
    for (let i = 300; i < 400; i++) solves[i] = sv(1000 + (i % 7) * 5);
    solves[777] = sv(900); // melhor single
    const r = records(solves);

    expect(r.single.best).toBe(900);
    expect(r.single.bestEnd).toBe(777);
    expect(r.single.current).toBe(effectiveMs(solves[1199]!));

    expect(RECORD_SIZES).toEqual([5, 12, 50, 100, 1000]);
    for (const n of RECORD_SIZES) {
      const ref = rollingAveragesRef(solves, n);
      let bestIdx = -1;
      ref.forEach((v, i) => { if (v !== null && v !== Infinity && (bestIdx < 0 || v < (ref[bestIdx] as number))) bestIdx = i; });
      expect(r.averages[n].best, `ao${n}`).toBe(ref[bestIdx]);
      expect(r.averages[n].bestEnd, `ao${n} fim`).toBe(bestIdx);
      expect(r.averages[n].current, `ao${n} atual`).toBe(ref[1199]);
      expect(r.averages[n].best).toBe(bestAverage(solves, n));
      expect(r.averages[n].current).toBe(averageOf(solves, n));
    }
    // a melhor ao100 cobre o trecho bom (o corte de 5 de cada lado deixa a janela escorregar uns solves), e a melhor ao5 cai dentro dele
    expect(r.averages[100].bestEnd).toBeGreaterThanOrEqual(390);
    expect(r.averages[100].bestEnd).toBeLessThanOrEqual(410);
    expect(r.averages[5].bestEnd).toBeGreaterThanOrEqual(304);
    expect(r.averages[5].bestEnd).toBeLessThanOrEqual(399);
    expect(r.single.best).toBe(bestSingle(solves));
  });

  it('records: média sem solves suficientes é null', () => {
    const vazio = records([]);
    expect(vazio.single).toEqual({ best: null, bestEnd: null, current: null });
    for (const n of RECORD_SIZES) expect(vazio.averages[n]).toEqual({ best: null, bestEnd: null, current: null });

    const sete = records([60000, 61000, 62000, 63000, 64000, 65000, 66000].map((ms) => sv(ms)));
    expect(sete.averages[5].best).not.toBeNull();
    expect(sete.averages[5].bestEnd).toBe(4);
    expect(sete.averages[12]).toEqual({ best: null, bestEnd: null, current: null });
    expect(sete.averages[1000]).toEqual({ best: null, bestEnd: null, current: null });
  });

  it('records: janela só de DNF não tem melhor, mas o atual é DNF', () => {
    const r = records([sv(1, 'DNF'), sv(1, 'DNF'), sv(1, 'DNF'), sv(1, 'DNF'), sv(1, 'DNF')]);
    expect(r.single).toEqual({ best: null, bestEnd: null, current: Infinity });
    expect(r.averages[5]).toEqual({ best: null, bestEnd: null, current: Infinity });
  });

  it('records: empate fica com o recorde mais antigo', () => {
    // mesma ao5 (e mesmo single) duas vezes; o recorde fica na primeira
    const tempos = [60000, 61000, 62000, 63000, 64000];
    const solves = [...tempos.map((ms) => sv(ms)), sv(90000), ...tempos.map((ms) => sv(ms))];
    const r = records(solves);
    expect(r.single.best).toBe(60000);
    expect(r.single.bestEnd).toBe(0);
    expect(r.averages[5].best).toBe(62000);
    expect(r.averages[5].bestEnd).toBe(4);
  });

  it('100 mil solves: records sai em menos de 1,5 s', () => {
    const solves = gen(rng(100000), 100_000, 30000, 0.02, 0.08);
    const t0 = performance.now();
    const r = records(solves);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
    expect(r.averages[1000].best).not.toBeNull();
    expect(r.single.best).toBe(bestSingle(solves));
  });
});

describe('windowOf', () => {
  it('windowOf marca o melhor e o pior na ao5 e os 50 da ao1000', () => {
    const cinco = [62000, 60000, 65000, 61000, 63000].map((ms) => sv(ms));
    const w5 = windowOf([sv(1), ...cinco, sv(2)], 5, 5);
    expect(w5.values).toEqual([62000, 60000, 65000, 61000, 63000]);
    expect(w5.trimmed).toEqual([false, true, true, false, false]);

    // ao1000 com valores todos diferentes: cortam-se os 50 menores e os 50 maiores
    const mil = Array.from({ length: 1000 }, (_, i) => sv(10000 + ((i * 37) % 1000) * 10));
    const w = windowOf(mil, 1000, 999);
    expect(trimCount(1000)).toBe(50);
    expect(w.values.length).toBe(1000);
    expect(w.trimmed.filter(Boolean).length).toBe(100);
    const cortados = w.values.filter((_, i) => w.trimmed[i]);
    const ordenados = [...w.values].sort((a, b) => a - b);
    expect([...cortados].sort((a, b) => a - b)).toEqual([...ordenados.slice(0, 50), ...ordenados.slice(950)]);
  });

  it('windowOf com DNF: o DNF é o pior, e os valores vêm em ordem cronológica', () => {
    const w = windowOf([sv(60000), sv(1, 'DNF'), sv(62000, '+2'), sv(61000), sv(63000)], 5, 4);
    expect(w.values).toEqual([60000, Infinity, 64000, 61000, 63000]);
    expect(w.trimmed).toEqual([true, true, false, false, false]);
  });

  it('windowOf com empate corta exatamente trimCount de cada lado', () => {
    const w = windowOf([60000, 60000, 60000, 60000, 60000].map((ms) => sv(ms)), 5, 4);
    expect(w.trimmed.filter(Boolean).length).toBe(2);
  });
});
