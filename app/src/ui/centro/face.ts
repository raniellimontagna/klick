// O rosto do Centro como parâmetros contínuos (spec do sub-projeto 3, seção 6.2). Puro: nada aqui conhece o DOM.
// Cada olho é um formato preenchido com a borda de cima e a de baixo em curva. Todas as expressões usam a mesma estrutura de comandos,
// então dá para interpolar entre quaisquer duas. A geometria é a da frente do cubo (dentro do translate(0 30) do SVG).

export type Eyes = 'open' | 'half' | 'focus' | 'happy' | 'sleep';

export interface Face {
  open: number; // OPEN_MIN … 1: distância entre as bordas (1 = os 12 de altura do olho aberto)
  curve: number; // -1 … 1: arco das duas bordas (-1 dormindo, para baixo; +1 feliz, para cima)
  lookX: number; // deslocamento do olhar, em unidades do SVG
  lookY: number;
  squash: number; // escala vertical do corpo, pela base (1 = normal)
}

const EYE_H = 12;
const W_OPEN = 6.4;
const W_LINE = 9.4; // o traço de 6,8 de hoje com as pontas redondas de 2,6
const BEND = 2.8; // quanto o meio do arco sobe (feliz) ou desce (dormindo)
export const OPEN_MIN = 2.6 / EYE_H; // a espessura do traço de hoje: foco, feliz e dormindo
export const EYE_Y = 48.5; // o centro dos olhos na frente
export const EYE_X = Object.freeze({ l: 44.8, r: 55.2 });

const base = { lookX: 0, lookY: 0, squash: 1 };
export const EXPRESSIONS: Readonly<Record<Eyes, Readonly<Face>>> = Object.freeze({
  open: Object.freeze({ ...base, open: 1, curve: 0 }),
  half: Object.freeze({ ...base, open: 0.55, curve: 0 }),
  focus: Object.freeze({ ...base, open: OPEN_MIN, curve: 0 }),
  happy: Object.freeze({ ...base, open: OPEN_MIN, curve: 1 }),
  sleep: Object.freeze({ ...base, open: OPEN_MIN, curve: -1 }),
});

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const f2 = (v: number): string => v.toFixed(2);

// O caminho de um olho centrado em cx. Os controles das curvas ficam a 4/3 da meia altura, então o topo e a base chegam à meia altura
// e as laterais começam na vertical (um olho de pontas redondas). Abaixo da metade da abertura, o olho alarga até a largura do traço.
export function eyePath(face: Face, cx: number): string {
  const o = clamp(face.open, OPEN_MIN, 1);
  const k = (4 / 3) * ((EYE_H * o) / 2);
  const w = o >= 0.5 ? W_OPEN : W_OPEN + (W_LINE - W_OPEN) * ((0.5 - o) / (0.5 - OPEN_MIN));
  const bend = clamp(face.curve, -1, 1) * BEND;
  const lift = (4 / 3) * bend;
  const y = EYE_Y + bend / 2 + face.lookY;
  const x0 = cx - w / 2 + face.lookX;
  const x1 = cx + w / 2 + face.lookX;
  const top = y - k - lift;
  const bottom = y + k - lift;
  return `M${f2(x0)} ${f2(y)}C${f2(x0)} ${f2(top)} ${f2(x1)} ${f2(top)} ${f2(x1)} ${f2(y)}C${f2(x1)} ${f2(bottom)} ${f2(x0)} ${f2(bottom)} ${f2(x0)} ${f2(y)}Z`;
}

// Amortecimento exponencial: chega a 95% do alvo em 200 ms (k = 15 por segundo), igual em qualquer taxa de quadros. dt em ms.
export const APPROACH_K = 15;

export function approach(cur: Face, target: Face, dt: number, k = APPROACH_K): Face {
  const a = 1 - Math.exp((-k * Math.max(0, dt)) / 1000);
  const mix = (x: number, y: number): number => x + (y - x) * a;
  return {
    open: mix(cur.open, target.open),
    curve: mix(cur.curve, target.curve),
    lookX: mix(cur.lookX, target.lookX),
    lookY: mix(cur.lookY, target.lookY),
    squash: mix(cur.squash, target.squash),
  };
}

// Perto o bastante para parar de desenhar.
export function settled(a: Face, b: Face, eps = 0.005): boolean {
  return (
    Math.abs(a.open - b.open) < eps &&
    Math.abs(a.curve - b.curve) < eps &&
    Math.abs(a.lookX - b.lookX) < eps &&
    Math.abs(a.lookY - b.lookY) < eps &&
    Math.abs(a.squash - b.squash) < eps
  );
}
