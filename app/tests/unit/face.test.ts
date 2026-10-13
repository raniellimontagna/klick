import { describe, expect, it } from 'vitest';
import { approach, EXPRESSIONS, EYE_X, EYE_Y, eyePath, OPEN_MIN, settled } from '../../src/ui/centro/face';

// Os pontos do caminho (pares x y).
const points = (d: string): [number, number][] => {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => [n[2 * i], n[2 * i + 1]]);
};
const box = (d: string) => {
  const p = points(d);
  const xs = p.map(([x]) => x);
  const ys = p.map(([, y]) => y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
};
// A distância de um ponto à curva quadrática p0-p1-p2 (amostrada em 2000 trechos).
const toQuad = ([x, y]: [number, number], p0: [number, number], p1: [number, number], p2: [number, number]): number => {
  let best = Infinity;
  for (let i = 0; i <= 2000; i++) {
    const t = i / 2000;
    const qx = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t ** 2 * p2[0];
    const qy = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t ** 2 * p2[1];
    best = Math.min(best, Math.hypot(x - qx, y - qy));
  }
  return best;
};

describe('rosto do Centro', () => {
  it('todas as expressões têm o mesmo número de pontos, na mesma ordem', () => {
    for (const face of Object.values(EXPRESSIONS)) {
      const d = eyePath(face, EYE_X.l);
      expect(d).toMatch(/^M-?[\d.]+ -?[\d.]+(L-?[\d.]+ -?[\d.]+)+Z$/);
      expect(points(d)).toHaveLength(54);
    }
  });

  it('aberto: a pílula de hoje, 6,4 por 12, de 42,5 a 54,5', () => {
    const b = box(eyePath(EXPRESSIONS.open, EYE_X.l));
    expect(b.minX).toBeCloseTo(EYE_X.l - 3.2, 2);
    expect(b.maxX).toBeCloseTo(EYE_X.l + 3.2, 2);
    expect(b.minY).toBeCloseTo(EYE_Y - 6, 2);
    expect(b.maxY).toBeCloseTo(EYE_Y + 6, 2);
  });

  it('semicerrado: 6,4 de largura e 6,6 de altura', () => {
    const b = box(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(b.maxX - b.minX).toBeCloseTo(6.4, 2);
    expect(b.maxY - b.minY).toBeCloseTo(12 * 0.55, 2);
  });

  it('foco, feliz e dormindo são o traço de hoje: todo ponto do contorno fica a 1,3 da linha do meio de hoje', () => {
    const cases: [keyof typeof EXPRESSIONS, [number, number], [number, number], [number, number]][] = [
      ['focus', [41.4, 49.5], [44.8, 49.5], [48.2, 49.5]], // M41.4 49.5 h6.8
      ['happy', [41.4, 51], [44.8, 45.4], [48.2, 51]], // M41.4 51 q3.4 -5.6 6.8 0
      ['sleep', [41.4, 49], [44.8, 52.4], [48.2, 49]], // M41.4 49 q3.4 3.4 6.8 0
    ];
    for (const [name, p0, p1, p2] of cases) {
      for (const p of points(eyePath(EXPRESSIONS[name], EYE_X.l))) expect(Math.abs(toQuad(p, p0, p1, p2) - 1.3)).toBeLessThan(0.02);
    }
  });

  it('o olhar desloca o olho inteiro', () => {
    const base = points(eyePath(EXPRESSIONS.open, EYE_X.l));
    const moved = points(eyePath({ ...EXPRESSIONS.open, lookX: 1.6, lookY: -1 }, EYE_X.l));
    moved.forEach(([x, y], i) => {
      expect(x - base[i][0]).toBeCloseTo(1.6, 1);
      expect(y - base[i][1]).toBeCloseTo(-1, 1);
    });
  });

  it('fechando abaixo da metade, o olho alarga até a largura do traço', () => {
    const w = (open: number) => {
      const b = box(eyePath({ ...EXPRESSIONS.open, open }, EYE_X.l));
      return b.maxX - b.minX;
    };
    expect(w(0.5)).toBeCloseTo(6.4, 2);
    expect(w(0.4)).toBeGreaterThan(6.4);
    expect(w(0.4)).toBeLessThan(9.4);
    expect(w(OPEN_MIN)).toBeCloseTo(9.4, 2);
  });

  it('abrir e fechar com o olho curvado não dá salto: nenhuma borda anda mais de 0,2 entre dois passos de 0,001', () => {
    const steps = Math.ceil((1 - OPEN_MIN) / 0.001);
    for (const curve of [1, -1, 0.5]) {
      let prev = box(eyePath({ ...EXPRESSIONS.open, curve, open: 1 }, EYE_X.l));
      for (let i = 1; i <= steps; i++) {
        const open = Math.max(OPEN_MIN, 1 - i * 0.001);
        const cur = box(eyePath({ ...EXPRESSIONS.open, curve, open }, EYE_X.l));
        for (const edge of ['minX', 'maxX', 'minY', 'maxY'] as const) {
          expect(Math.abs(cur[edge] - prev[edge]), `curve ${curve}, open ${open.toFixed(4)}, ${edge}`).toBeLessThan(0.2);
        }
        prev = cur;
      }
    }
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
