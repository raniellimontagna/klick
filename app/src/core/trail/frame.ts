// O quadro das aulas e do treino (spec 5.2): amarelo em cima, branco embaixo, verde na frente. É o padrão do cubing.js depois de um
// z2, por isso o cubo 3D recebe 'z2 ' + setup. Puro: nada aqui importa o cubing em tempo de execução; os testes conferem as tabelas
// contra o kpuzzle de verdade.
//
// Ordem das posições no 3×3 do cubing: EDGES UF UR UB UL DF DR DB DL FR FL BR BL; CORNERS UFR URB UBL ULF DRF DFL DLB DBR;
// CENTERS U L F R B D. As tabelas REF_* dizem que peça (a identidade do cubing) mora em cada posição no nosso quadro resolvido.
import type { MaskKind } from './types';

export const REF_EDGES: readonly number[] = Object.freeze([4, 7, 6, 5, 0, 3, 2, 1, 9, 8, 11, 10]);
export const REF_CORNERS: readonly number[] = Object.freeze([5, 6, 7, 4, 3, 0, 1, 2]);
export const REF_CENTERS: readonly number[] = Object.freeze([5, 3, 2, 1, 4, 0]);

// Como uma peça aparece: '-' normal, 'D' apagada, 'I' cinza (ignorada), 'O' só o adesivo de cima ou de baixo (estilo OLL), 'P' esse
// adesivo apagado e os dos lados normais (estilo PLL). É a notação do experimentalStickeringMaskOrbits do TwistyPlayer.
type Look = '-' | 'D' | 'I' | 'O' | 'P';

const isTop = (pos: number): boolean => pos < 4; // camada de cima: as peças amarelas
const isBottom = (pos: number): boolean => pos >= 4 && pos < 8; // camada de baixo: as peças brancas
const FR_CORNER = 4; // DRF: o canto do par da frente-direita
const FR_EDGE = 8; // FR: a aresta do par da frente-direita

// O desenho de cada máscara pela POSIÇÃO no nosso quadro resolvido.
interface Plan {
  edge: (pos: number) => Look;
  corner: (pos: number) => Look;
}
const PLANS: Readonly<Record<MaskKind, Plan>> = {
  daisy: { edge: (p) => (isBottom(p) ? '-' : 'I'), corner: () => 'I' },
  cross: { edge: (p) => (isBottom(p) ? '-' : 'I'), corner: () => 'I' },
  firstLayer: { edge: (p) => (isBottom(p) ? '-' : 'I'), corner: (p) => (isBottom(p) ? '-' : 'I') },
  f2l: { edge: (p) => (isTop(p) ? 'I' : '-'), corner: (p) => (isTop(p) ? 'I' : '-') },
  eoll: { edge: (p) => (isTop(p) ? 'O' : 'D'), corner: (p) => (isTop(p) ? 'I' : 'D') },
  oll: { edge: (p) => (isTop(p) ? 'O' : 'D'), corner: (p) => (isTop(p) ? 'O' : 'D') },
  pll: { edge: (p) => (isTop(p) ? '-' : 'D'), corner: (p) => (isTop(p) ? '-' : 'D') },
  ll: { edge: (p) => (isTop(p) ? '-' : 'D'), corner: (p) => (isTop(p) ? '-' : 'D') },
  pair: {
    edge: (p) => (isTop(p) ? 'I' : isBottom(p) || p === FR_EDGE ? '-' : 'D'),
    corner: (p) => (isTop(p) ? 'I' : p === FR_CORNER ? '-' : 'D'),
  },
};

// A máscara do cubing vale pela IDENTIDADE da peça (o adesivo acompanha a peça quando ela anda), não pela posição. A peça que mora na
// posição p do nosso quadro é REF[p]: é ela que recebe o desenho de p.
function byPiece(ref: readonly number[], look: (pos: number) => Look): string {
  const out = Array<Look>(ref.length);
  ref.forEach((piece, pos) => {
    out[piece] = look(pos);
  });
  return out.join('');
}

// O texto que o TwistyPlayer recebe em experimentalStickeringMaskOrbits. Os centros ficam sempre normais: eles orientam a pessoa.
export function maskOrbits(kind: MaskKind): string {
  const plan = PLANS[kind];
  return `EDGES:${byPiece(REF_EDGES, plan.edge)},CORNERS:${byPiece(REF_CORNERS, plan.corner)},CENTERS:------`;
}

// A mesma máscara no formato de objeto que o ExperimentalSVGAnimator aceita (a figura 2D não lê o texto).
export interface StickeringMaskLike {
  orbits: Record<string, { pieces: { facelets: string[] }[] }>;
}

const FACELETS: Readonly<Record<Look, readonly string[]>> = Object.freeze({
  '-': ['regular', 'regular', 'regular', 'regular', 'regular'],
  D: ['dim', 'dim', 'dim', 'dim', 'dim'],
  I: ['ignored', 'ignored', 'ignored', 'ignored', 'ignored'],
  O: ['regular', 'ignored', 'ignored', 'ignored', 'ignored'],
  P: ['dim', 'regular', 'regular', 'regular', 'regular'],
});

export function maskObject(kind: MaskKind): StickeringMaskLike {
  const orbits: StickeringMaskLike['orbits'] = {};
  for (const part of maskOrbits(kind).split(',')) {
    const [name, looks] = part.split(':');
    orbits[name] = { pieces: [...looks].map((look) => ({ facelets: [...FACELETS[look as Look]] })) };
  }
  return { orbits };
}

const movesOf = (alg: string): string[] => alg.trim().split(/\s+/).filter((m) => m !== '');

// O inverso de um algoritmo, escrito como o Alg.invert do cubing.js escreve: a ordem ao contrário e o apóstrofo trocado em cada
// movimento (R → R', R' → R, R2 → R2', R2' → R2). Vale para faces, camadas largas (r, f), fatias (M, E, S) e rotações (x, y, z).
export function invertAlg(alg: string): string {
  return movesOf(alg)
    .reverse()
    .map((m) => (m.endsWith("'") ? m.slice(0, -1) : `${m}'`))
    .join(' ');
}

// Os quatro giros da camada de cima (nenhum, U, U2 e U'): o AUF do embaralhamento e da conferência.
export const AUF: readonly string[] = Object.freeze(['', 'U', 'U2', "U'"]);

// Junta movimentos seguidos da mesma camada (U U' some, U U vira U2) e escreve 2 sem apóstrofo. O estado não muda: só o texto fica
// como a pessoa espera ler.
export function tidyAlg(alg: string): string {
  const out: { face: string; turns: number }[] = [];
  for (const m of movesOf(alg)) {
    const face = m.replace(/['2]+$/, '');
    const turns = m.endsWith("2'") || m.endsWith('2') ? 2 : m.endsWith("'") ? 3 : 1;
    const last = out.at(-1);
    if (last && last.face === face) {
      last.turns = (last.turns + turns) % 4;
      if (last.turns === 0) out.pop();
    } else out.push({ face, turns });
  }
  return out.map(({ face, turns }) => face + (turns === 1 ? '' : turns === 2 ? '2' : "'")).join(' ');
}
