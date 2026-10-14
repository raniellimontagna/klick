// Apoio dos testes da trilha (spec 5.6): o cubo de verdade, pelo cubing.js do node_modules, no quadro das aulas (amarelo em cima,
// branco embaixo, verde na frente), e os verificadores de etapa. Não é um arquivo de teste: os trail-*.test.ts importam daqui.
import { Alg } from 'cubing/alg';
import { KPattern } from 'cubing/kpuzzle';
import { cube3x3x3 } from 'cubing/puzzles';
import type { Stage } from '../../src/core/trail/types';

export const kp = await cube3x3x3.kpuzzle();
export const REF = kp.defaultPattern().applyAlg('z2');
export const AUF = ['', 'U', 'U2', "U'"] as const;

type Orbit = 'EDGES' | 'CORNERS' | 'CENTERS';
const pieceAt = (p: KPattern, o: Orbit, i: number): number => p.patternData[o].pieces[i];
const oriAt = (p: KPattern, o: Orbit, i: number): number => p.patternData[o].orientation[i];
// Nas posições dadas, a mesma peça com a mesma orientação do resolvido.
const sameAt = (p: KPattern, o: Orbit, positions: readonly number[]): boolean =>
  positions.every((i) => pieceAt(p, o, i) === pieceAt(REF, o, i) && oriAt(p, o, i) === oriAt(REF, o, i));
const orientedAt = (p: KPattern, o: Orbit, positions: readonly number[]): boolean => positions.every((i) => oriAt(p, o, i) === 0);
const placedAt = (p: KPattern, o: Orbit, positions: readonly number[]): boolean => positions.every((i) => pieceAt(p, o, i) === pieceAt(REF, o, i));
const withAuf = (p: KPattern, test: (q: KPattern) => boolean): boolean => AUF.some((u) => test(p.applyAlg(u)));

const TOP = [0, 1, 2, 3];
const BOTTOM = [4, 5, 6, 7];
const MIDDLE = [8, 9, 10, 11];
const CENTERS = [0, 1, 2, 3, 4, 5];
const WHITE_EDGES = BOTTOM.map((i) => pieceAt(REF, 'EDGES', i));

// Os verificadores de etapa, como no spike de conferência (cube.mjs e emit.mjs). 'solved', 'llEdges' e 'llCorners' aceitam um giro de cima.
export const stage: Record<Stage, (p: KPattern) => boolean> = {
  daisy: (p) => TOP.every((i) => WHITE_EDGES.includes(pieceAt(p, 'EDGES', i)) && oriAt(p, 'EDGES', i) === 0),
  cross: (p) => sameAt(p, 'CENTERS', CENTERS) && sameAt(p, 'EDGES', BOTTOM),
  firstLayer: (p) => stage.cross(p) && sameAt(p, 'CORNERS', BOTTOM),
  f2l: (p) => stage.firstLayer(p) && sameAt(p, 'EDGES', MIDDLE),
  yellowCross: (p) => stage.f2l(p) && orientedAt(p, 'EDGES', TOP),
  llEdges: (p) => stage.yellowCross(p) && withAuf(p, (q) => placedAt(q, 'EDGES', TOP)),
  llCorners: (p) => stage.yellowCross(p) && withAuf(p, (q) => placedAt(q, 'EDGES', TOP) && placedAt(q, 'CORNERS', TOP)),
  oll: (p) => stage.yellowCross(p) && orientedAt(p, 'CORNERS', TOP),
  solved: (p) => withAuf(p, (q) => q.isIdentical(REF)),
};

// O estado depois de `setup` e `alg`, a partir do resolvido no quadro das aulas.
export const at = (setup: string, alg = ''): KPattern => REF.applyAlg(setup).applyAlg(alg);
// O inverso pelo próprio cubing.js: é contra ele que o invertAlg do app é conferido.
export const inv = (alg: string): string => new Alg(alg).invert().toString();
// `alg` resolve `p` até `done`, com um giro de cima antes (o AUF de quem olha o caso).
export const solves = (p: KPattern, alg: string, done: (q: KPattern) => boolean): boolean => AUF.some((u) => done(p.applyAlg(u).applyAlg(alg)));

// As arestas de cima já orientadas (amarelo para cima), por posição: UF 0, UR 1, UB 2, UL 3.
export const topEdgesOriented = (p: KPattern): number[] => TOP.filter((i) => oriAt(p, 'EDGES', i) === 0);
// Os cantos de cima no lugar com algum giro de cima (orientação à parte).
export const topCornersPlaced = (p: KPattern): boolean => withAuf(p, (q) => placedAt(q, 'CORNERS', TOP));
// A cruz e os três outros pares (frente-esquerda, trás-esquerda e trás-direita) intactos.
export const otherSlotsSolved = (p: KPattern): boolean => stage.cross(p) && sameAt(p, 'CORNERS', [5, 6, 7]) && sameAt(p, 'EDGES', [9, 10, 11]);

// --- As 41 classes de F2L (como o spike f2l.mjs): onde estão o canto e a aresta do par da frente-direita, módulo o giro de cima ---

const PAIR_CORNER = pieceAt(REF, 'CORNERS', 4); // a peça do canto DRF
const PAIR_EDGE = pieceAt(REF, 'EDGES', 8); // a peça da aresta FR

export function f2lClass(p: KPattern): string {
  const one = (q: KPattern): string => {
    const c = q.patternData.CORNERS;
    const e = q.patternData.EDGES;
    const ci = c.pieces.indexOf(PAIR_CORNER);
    const ei = e.pieces.indexOf(PAIR_EDGE);
    return `c${ci}:${c.orientation[ci]} e${ei}:${e.orientation[ei]}`;
  };
  return AUF.map((u) => one(p.applyAlg(u))).sort()[0];
}

// O resolvido com o canto do par na posição cPos (0 a 3 em cima, 4 no lugar) e orientação cOri, e a aresta em ePos (0 a 3 em cima,
// 8 no lugar) e orientação eOri. Só serve para a chave da classe (a troca de peças pode não ser um estado alcançável).
function placed(cPos: number, cOri: number, ePos: number, eOri: number): KPattern {
  const data = structuredClone(REF.patternData);
  const put = (orbit: 'CORNERS' | 'EDGES', piece: number, pos: number, ori: number): void => {
    const o = data[orbit];
    const from = o.pieces.indexOf(piece);
    const other = o.pieces[pos];
    o.pieces[pos] = piece;
    o.orientation[pos] = ori;
    if (from !== pos) {
      o.pieces[from] = other;
      o.orientation[from] = 0;
    }
  };
  put('CORNERS', PAIR_CORNER, cPos, cOri);
  put('EDGES', PAIR_EDGE, ePos, eOri);
  return new KPattern(kp, data);
}

export function allF2lClasses(): Set<string> {
  const out = new Set<string>();
  for (const cPos of [0, 1, 2, 3, 4])
    for (const cOri of [0, 1, 2])
      for (const ePos of [0, 1, 2, 3, 8])
        for (const eOri of [0, 1]) {
          if (cPos === 4 && cOri === 0 && ePos === 8 && eOri === 0) continue; // o par resolvido
          out.add(f2lClass(placed(cPos, cOri, ePos, eOri)));
        }
  return out;
}

// Onde está o par da frente-direita: em cima (posições 0 a 3) ou não.
export function pairPlace(p: KPattern): { cornerTop: boolean; edgeTop: boolean } {
  return { cornerTop: p.patternData.CORNERS.pieces.indexOf(PAIR_CORNER) < 4, edgeTop: p.patternData.EDGES.pieces.indexOf(PAIR_EDGE) < 4 };
}

// A orientação das peças de cima, módulo o giro de cima: dois casos de OLL com a mesma chave seriam o mesmo caso.
export function topOrientationKey(p: KPattern): string {
  const key = (q: KPattern): string => TOP.map((i) => oriAt(q, 'EDGES', i)).join('') + '|' + TOP.map((i) => oriAt(q, 'CORNERS', i)).join('');
  return AUF.map((u) => key(p.applyAlg(u))).sort()[0];
}

// As peças de cima (lugar e orientação), módulo o giro de cima: dois casos de PLL com a mesma chave seriam o mesmo estado.
export function topPiecesKey(p: KPattern): string {
  const key = (q: KPattern): string => TOP.map((i) => `${pieceAt(q, 'EDGES', i)}:${oriAt(q, 'EDGES', i)}`).join(',') + '|' + TOP.map((i) => `${pieceAt(q, 'CORNERS', i)}:${oriAt(q, 'CORNERS', i)}`).join(',');
  return AUF.map((u) => key(p.applyAlg(u))).sort()[0];
}
