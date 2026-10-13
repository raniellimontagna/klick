// O rosto do Centro como parâmetros contínuos (spec do sub-projeto 3, seção 6.2). Puro: nada aqui conhece o DOM.
// Cada olho é o contorno de um "miolo" (um segmento ou uma faixa curva) engordado por um raio: é o contorno de um traço de pontas
// redondas. Assim as expressões repetem os desenhos de hoje: o aberto é a pílula 6,4 × 12, o foco é o traço de 6,8 com pontas de 2,6
// e o feliz e o dormindo são o mesmo traço curvado. O caminho é uma polilinha com número fixo de pontos, gerada dos parâmetros a cada
// quadro. A geometria é a da frente do cubo (dentro do translate(0 30) do SVG).

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
// O traço curvado de hoje: no feliz as pontas ficam 1,5 abaixo da linha e o meio 1,3 acima (a curva sobe 2,8); no dormindo as pontas
// ficam 0,5 acima e o meio 1,2 abaixo (a curva desce 1,7).
const BEND_UP = 2.8;
const ENDS_UP = 1.5;
const BEND_DOWN = 1.7;
const ENDS_DOWN = 0.5;
const DROP = 1; // fechar desce o olho do centro (48,5) até a linha do foco de hoje (49,5)
const SEG = 12; // trechos de cada borda
const ARC = 6; // trechos de cada quarto de ponta
export const OPEN_MIN = 2.6 / EYE_H; // a espessura do traço de hoje: foco, feliz e dormindo
export const EYE_Y = 48.5; // o centro do olho aberto na frente
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

// O caminho de um olho centrado em cx: o contorno dos pontos a até r do miolo. O miolo tem largura cw e altura ch; a linha do meio dele
// é uma parábola (a mesma curva `q` do traço de hoje) que passa pelas pontas e tem o ápice no meio. Abaixo da metade da abertura o olho
// alarga até a largura do traço. 54 pontos por olho, sempre na mesma ordem: borda de cima, ponta direita, borda de baixo, ponta esquerda.
export function eyePath(face: Face, cx: number): string {
  const o = clamp(face.open, OPEN_MIN, 1);
  const h = EYE_H * o;
  const w = o >= 0.5 ? W_OPEN : W_OPEN + (W_LINE - W_OPEN) * ((0.5 - o) / (0.5 - OPEN_MIN));
  const r = Math.min(w, h) / 2;
  const cw = w - 2 * r;
  const ch = h - 2 * r;
  const c = clamp(face.curve, -1, 1);
  const bend = c * (c > 0 ? BEND_UP : BEND_DOWN);
  const ends = c * (c > 0 ? ENDS_UP : ENDS_DOWN);
  const base = EYE_Y + (DROP * (1 - o)) / (1 - OPEN_MIN) + face.lookY;
  const x0 = cx + face.lookX;
  const left = x0 - cw / 2;
  const right = x0 + cw / 2;
  const u = (x: number): number => (cw > 0 ? (2 * (x - x0)) / cw : 0);
  const mid = (x: number): number => base + ends - bend * (1 - u(x) ** 2);
  // A normal de cima da linha do meio (aponta para fora, para cima); a de baixo é a oposta.
  const up = (x: number): [number, number] => {
    const slope = cw > 0 ? (8 * bend * (x - x0)) / (cw * cw) : 0;
    const len = Math.hypot(1, slope);
    return [slope / len, -1 / len];
  };
  const pts: [number, number][] = [];
  const quarter = (cx0: number, cy0: number, from: number): void => {
    for (let j = 0; j <= ARC; j++) {
      const a = from + (Math.PI / 2) * (j / ARC);
      pts.push([cx0 + r * Math.cos(a), cy0 + r * Math.sin(a)]);
    }
  };
  for (let i = 0; i <= SEG; i++) {
    const x = left + (cw * i) / SEG;
    const [nx, ny] = up(x);
    pts.push([x + r * nx, mid(x) - ch / 2 + r * ny]);
  }
  const [rx, ry] = up(right);
  const turnRight = Math.atan2(ry, rx);
  quarter(right, mid(right) - ch / 2, turnRight);
  quarter(right, mid(right) + ch / 2, turnRight + Math.PI / 2);
  for (let i = SEG; i >= 0; i--) {
    const x = left + (cw * i) / SEG;
    const [nx, ny] = up(x);
    pts.push([x - r * nx, mid(x) + ch / 2 - r * ny]);
  }
  const [lx, ly] = up(left);
  const turnLeft = Math.atan2(-ly, -lx);
  quarter(left, mid(left) + ch / 2, turnLeft);
  quarter(left, mid(left) - ch / 2, turnLeft + Math.PI / 2);
  return `M${pts.map(([x, y]) => `${f2(x)} ${f2(y)}`).join('L')}Z`;
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
