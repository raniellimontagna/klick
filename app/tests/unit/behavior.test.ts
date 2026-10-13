import { describe, expect, it } from 'vitest';
import { type Behavior, createBehavior, REST, TIMING } from '../../src/ui/centro/behavior';

// Sorteio com semente (mulberry32): os testes repetem tudo igual.
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Os instantes em que uma piscada começa (o fechamento sai do zero), amostrando de 5 em 5 ms.
function blinkStarts(b: Behavior, from: number, to: number): number[] {
  const starts: number[] = [];
  let prev = 0;
  for (let t = from; t <= to; t += 5) {
    const v = b.overlay(t).blink;
    if (v > 0 && prev === 0) starts.push(t);
    prev = v;
  }
  return starts;
}

describe('comportamentos do Centro', () => {
  it('parado: pisca a cada 2 a 7 s, com cerca de 10% de piscadas duplas', () => {
    const b = createBehavior(seeded(7));
    b.setMood('idle', 0);
    const groups: number[][] = [];
    for (const s of blinkStarts(b, 0, 3_600_000)) {
      const g = groups.at(-1);
      if (g && s - g[g.length - 1] < 400) g.push(s);
      else groups.push([s]);
    }
    expect(groups.length).toBeGreaterThan(500);
    expect(groups.every((g) => g.length <= 2)).toBe(true);
    const doubles = groups.filter((g) => g.length === 2).length / groups.length;
    expect(doubles).toBeGreaterThan(0.05);
    expect(doubles).toBeLessThan(0.15);
    for (let i = 1; i < groups.length; i++) {
      const prevEnd = groups[i - 1][0] + (groups[i - 1].length === 2 ? 440 : 180);
      const gap = groups[i][0] - prevEnd;
      expect(gap).toBeGreaterThanOrEqual(2000 - 10);
      expect(gap).toBeLessThanOrEqual(7000 + 10);
    }
  });

  it('a olhadinha só acontece no parado e salta, sem valores no meio', () => {
    const b = createBehavior(seeded(3));
    b.setMood('idle', 0);
    const seen = new Set<number>();
    for (let t = 0; t <= 120_000; t += 5) seen.add(b.overlay(t).lookX);
    expect([...seen].every((v) => v === 0 || Math.abs(v) === TIMING.lookReach)).toBe(true);
    expect([...seen].some((v) => v !== 0)).toBe(true);
    const insp = createBehavior(seeded(3));
    insp.setMood('inspect', 0);
    for (let t = 0; t <= 60_000; t += 25) expect(insp.overlay(t).lookX).toBe(0);
  });

  it('no solve nada se move nem fica agendado, mesmo com um salto pedido', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('pb', 0);
    b.setMood('running', 10);
    b.trigger('pb', 20);
    for (const t of [10, 100, 300, 5000]) expect(b.overlay(t)).toEqual(REST);
    expect(b.busy(100)).toBe(false);
    expect(b.nextAt(100)).toBeNull();
    expect(b.orbit(100)).toBeNull();
  });

  it('salto do recorde: sobe 4 e volta em 400 ms, com squash na aterrissagem', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('pb', 1000);
    expect(b.overlay(1200).lift).toBeCloseTo(4, 5);
    expect(b.overlay(1100).squash).toBe(1);
    expect(b.overlay(1340).squash).toBeCloseTo(0.94, 5);
    expect(b.busy(1300)).toBe(true);
    expect(b.overlay(1400)).toMatchObject({ lift: 0, squash: 1 });
    expect(b.busy(1400)).toBe(false);
  });

  it('fim de temporada: a face de cima apaga uma vez, em 600 ms', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('seasonEnd', 0);
    expect(b.overlay(150).topDim).toBeGreaterThan(0);
    expect(b.overlay(300).topDim).toBeCloseTo(0.7, 5);
    expect(b.overlay(600).topDim).toBe(0);
    expect(b.overlay(900).topDim).toBe(0);
  });

  it('segurar de novo (outro humor) cancela o salto e a piscada da face de cima', () => {
    const b = createBehavior(seeded(1));
    b.setMood('reaction', 0);
    b.trigger('pb', 0);
    b.trigger('seasonEnd', 0);
    b.setMood('arming', 100);
    expect(b.overlay(200)).toEqual(REST);
  });

  it('estático: nada se move, nada é agendado; a órbita e a respiração somem', () => {
    const b = createBehavior(seeded(1));
    b.setMood('idle', 0);
    b.setAnimated(false, 0);
    b.trigger('pb', 0);
    for (let t = 0; t <= 30_000; t += 50) expect(b.overlay(t)).toEqual(REST);
    expect(b.nextAt(10)).toBeNull();
    expect(b.orbit(5000)).toBeNull();
    b.setMood('sleep', 100);
    expect(b.breath(3000)).toBeNull();
  });

  it('órbita a cada 0,95 s no parado; a respiração alterna a cada 2 s no sono; nextAt aponta o próximo passo', () => {
    const b = createBehavior(() => 0.99); // piscadas e olhadinhas longe: o próximo evento é a órbita
    b.setMood('idle', 1000);
    expect(b.orbit(1000)).toBe(0);
    expect(b.orbit(1949)).toBe(0);
    expect(b.orbit(1950)).toBe(1);
    expect(b.nextAt(1000)).toBe(1950);
    b.setMood('sleep', 5000);
    expect(b.orbit(5000)).toBeNull();
    expect(b.breath(5000)).toBe(false);
    expect(b.breath(7000)).toBe(true);
    expect(b.breath(9000)).toBe(false);
    expect(b.nextAt(5100)).toBe(7000);
  });
});
