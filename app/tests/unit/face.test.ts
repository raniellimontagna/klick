import { describe, expect, it } from 'vitest';
import { approach, EXPRESSIONS, EYE_X, EYE_Y, eyePath, OPEN_MIN, settled } from '../../src/ui/centro/face';

// Os 14 números do caminho: x0 y | x0 yT x1 yT x1 y | x1 yB x0 yB x0 y.
const nums = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
// Com os dois controles na mesma altura, a curva cúbica chega a 3/4 do caminho até eles.
const shape = (d: string) => {
  const [x0, y, , yT, x1, , , , , yB] = nums(d);
  return { width: x1 - x0, top: y + 0.75 * (yT - y), bottom: y + 0.75 * (yB - y), ends: y, left: x0 };
};

describe('rosto do Centro', () => {
  it('todas as expressões têm a mesma estrutura de caminho (interpolam entre si)', () => {
    for (const face of Object.values(EXPRESSIONS)) {
      const d = eyePath(face, EYE_X.l);
      expect(d).toMatch(/^M[\d.]+ [\d.]+C[\d. ]+C[\d. ]+Z$/);
      expect(nums(d)).toHaveLength(14);
    }
  });

  it('aberto: 6,4 de largura e 12 de altura, centrado como o olho de hoje (42,5 a 54,5)', () => {
    const s = shape(eyePath(EXPRESSIONS.open, EYE_X.l));
    expect(s.width).toBeCloseTo(6.4, 2);
    expect(s.top).toBeCloseTo(EYE_Y - 6, 2);
    expect(s.bottom).toBeCloseTo(EYE_Y + 6, 2);
    expect(s.left).toBeCloseTo(EYE_X.l - 3.2, 2);
  });

  it('foco: um traço de 9,4 por 2,6, como a linha de hoje com as pontas redondas', () => {
    const s = shape(eyePath(EXPRESSIONS.focus, EYE_X.r));
    expect(s.width).toBeCloseTo(9.4, 2);
    expect(s.bottom - s.top).toBeCloseTo(2.6, 1); // o caminho sai com 2 casas: a espessura fica a ±0,01
  });

  it('semicerrado mantém a largura do aberto e fica com pouco mais da metade da altura', () => {
    const s = shape(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(s.width).toBeCloseTo(6.4, 2);
    expect(s.bottom - s.top).toBeCloseTo(12 * 0.55, 2);
  });

  it('feliz arqueia para cima; dormindo, para baixo; a espessura do traço fica', () => {
    const happy = shape(eyePath(EXPRESSIONS.happy, EYE_X.l));
    const sleep = shape(eyePath(EXPRESSIONS.sleep, EYE_X.l));
    expect((happy.top + happy.bottom) / 2).toBeLessThan(happy.ends);
    expect((sleep.top + sleep.bottom) / 2).toBeGreaterThan(sleep.ends);
    expect(happy.bottom - happy.top).toBeCloseTo(OPEN_MIN * 12, 1);
  });

  it('o olhar desloca o olho inteiro', () => {
    const base = nums(eyePath(EXPRESSIONS.open, EYE_X.l));
    const moved = nums(eyePath({ ...EXPRESSIONS.open, lookX: 1.6, lookY: -1 }, EYE_X.l));
    expect(moved[0] - base[0]).toBeCloseTo(1.6, 2);
    expect(moved[1] - base[1]).toBeCloseTo(-1, 2);
  });

  it('a aproximação chega a 95% em 200 ms, igual em qualquer taxa de quadros', () => {
    const from = EXPRESSIONS.open;
    const to = EXPRESSIONS.focus;
    const once = approach(from, to, 200);
    expect((from.open - once.open) / (from.open - to.open)).toBeCloseTo(0.95, 2);
    let stepped = from;
    for (let i = 0; i < 12; i++) stepped = approach(stepped, to, 200 / 12);
    expect(stepped.open).toBeCloseTo(once.open, 10);
    expect(settled(approach(from, to, 2000), to)).toBe(true);
    expect(settled(once, to)).toBe(false);
    expect(approach(from, to, -5)).toEqual(from);
  });
});
