import { describe, expect, it } from 'vitest';
import { AUF as AUF_APP, invertAlg, maskObject, maskOrbits, REF_CENTERS, REF_CORNERS, REF_EDGES, tidyAlg } from '../../src/core/trail/frame';
import type { MaskKind } from '../../src/core/trail/types';
import { allF2lClasses, at, AUF, f2lClass, inv, kp, REF, stage } from './trail-cube';

// O desenho que a máscara dá à peça que mora na posição `pos` do nosso quadro resolvido.
function lookAt(kind: MaskKind, orbit: 'EDGES' | 'CORNERS', pos: number): string {
  const part = maskOrbits(kind).split(',').find((p) => p.startsWith(`${orbit}:`)) ?? '';
  const ref = orbit === 'EDGES' ? REF_EDGES : REF_CORNERS;
  return part.slice(orbit.length + 1)[ref[pos]];
}
const looks = (kind: MaskKind, orbit: 'EDGES' | 'CORNERS', positions: number[]): string => positions.map((p) => lookAt(kind, orbit, p)).join('');

describe('quadro da trilha (amarelo em cima, branco embaixo, verde na frente)', () => {
  it('as tabelas são o padrão do cubing.js depois de z2, sem nenhuma peça girada', () => {
    const z2 = kp.defaultPattern().applyAlg('z2').patternData;
    expect([...REF_EDGES]).toEqual(z2.EDGES.pieces);
    expect([...REF_CORNERS]).toEqual(z2.CORNERS.pieces);
    expect([...REF_CENTERS]).toEqual(z2.CENTERS.pieces);
    for (const orbit of ['EDGES', 'CORNERS', 'CENTERS'] as const) expect(z2[orbit].orientation.every((o) => o === 0)).toBe(true);
    expect(REF.isIdentical(kp.defaultPattern().applyAlg('z2'))).toBe(true);
  });

  it('o AUF do app são os quatro giros de cima, na ordem dos testes', () => {
    expect([...AUF_APP]).toEqual([...AUF]);
  });
});

describe('invertAlg escreve o inverso como o cubing.js', () => {
  const tricky = ["R U R' U'", 'U2', "U2'", "F R U R' U' F' f R U R' U' f'", "r U R' U' r' F R F'", "M' U M2 U M2 U M' U2 M2", 'x y2 z\'', "R2 D R' U2 R D' R' U2 R'", "E S' Rw", ''];
  it.each(tricky)('%s', (alg) => {
    expect(invertAlg(alg)).toBe(inv(alg));
  });

  it('espaços sobrando não mudam nada', () => {
    expect(invertAlg("  R   U ")).toBe("U' R'");
  });
});

describe('tidyAlg junta giros seguidos da mesma camada', () => {
  it.each([
    ["U R U' U", 'U R'],
    ["U2 R U R' U'", "U2 R U R' U'"],
    ["U U' R", 'R'],
    ["R U U' R", 'R2'],
    ["U2' F", 'U2 F'],
    ["U' U'", 'U2'],
    ["U2 U", "U'"],
    ['', ''],
  ])('%s → %s', (alg, tidy) => {
    expect(tidyAlg(alg)).toBe(tidy);
  });

  it('o estado do cubo não muda', () => {
    const alg = "U' R U R' U2 R U' R' U2 U";
    expect(at(tidyAlg(alg)).isIdentical(at(alg))).toBe(true);
  });
});

describe('máscaras: o destaque segue a peça (identidade do cubing), pela posição no nosso quadro', () => {
  it('cruz: as arestas brancas (embaixo) e os centros em destaque; o resto cinza', () => {
    expect(maskOrbits('cross')).toBe('EDGES:----IIIIIIII,CORNERS:IIIIIIII,CENTERS:------');
    expect(looks('cross', 'EDGES', [4, 5, 6, 7])).toBe('----');
    expect(looks('cross', 'EDGES', [0, 1, 2, 3, 8, 9, 10, 11])).toBe('IIIIIIII');
    expect(maskOrbits('daisy')).toBe(maskOrbits('cross'));
  });

  it('primeira camada: soma os cantos brancos', () => {
    expect(looks('firstLayer', 'CORNERS', [4, 5, 6, 7])).toBe('----');
    expect(looks('firstLayer', 'CORNERS', [0, 1, 2, 3])).toBe('IIII');
    expect(looks('firstLayer', 'EDGES', [8, 9, 10, 11])).toBe('IIII');
  });

  it('F2L: as duas primeiras camadas em destaque; a de cima cinza', () => {
    expect(looks('f2l', 'EDGES', [4, 5, 6, 7, 8, 9, 10, 11])).toBe('--------');
    expect(looks('f2l', 'EDGES', [0, 1, 2, 3])).toBe('IIII');
    expect(looks('f2l', 'CORNERS', [0, 1, 2, 3, 4, 5, 6, 7])).toBe('IIII----');
  });

  it('cruz amarela: F2L apagado, só o amarelo das arestas de cima, cantos de cima cinza', () => {
    expect(looks('eoll', 'EDGES', [0, 1, 2, 3, 4, 8])).toBe('OOOODD');
    expect(looks('eoll', 'CORNERS', [0, 1, 2, 3, 4])).toBe('IIIID');
  });

  it('OLL: só o amarelo de todas as peças de cima; PLL e última camada: as peças de cima inteiras', () => {
    expect(looks('oll', 'CORNERS', [0, 1, 2, 3, 7])).toBe('OOOOD');
    expect(looks('oll', 'EDGES', [0, 3, 11])).toBe('OOD');
    expect(looks('pll', 'EDGES', [0, 1, 2, 3, 5])).toBe('----D');
    expect(maskOrbits('ll')).toBe(maskOrbits('pll'));
  });

  it('par do treino de F2L: a cruz e o par da frente-direita em destaque, os outros pares apagados', () => {
    expect(lookAt('pair', 'CORNERS', 4)).toBe('-');
    expect(lookAt('pair', 'EDGES', 8)).toBe('-');
    expect(looks('pair', 'CORNERS', [5, 6, 7])).toBe('DDD');
    expect(looks('pair', 'EDGES', [4, 5, 6, 7, 9, 10, 11])).toBe('----DDD');
    expect(looks('pair', 'EDGES', [0, 1, 2, 3])).toBe('IIII');
  });

  it('o objeto da figura 2D tem o mesmo desenho, adesivo por adesivo', () => {
    const oll = maskObject('oll');
    expect(oll.orbits.EDGES.pieces[REF_EDGES[0]].facelets).toEqual(['regular', 'ignored', 'ignored', 'ignored', 'ignored']);
    expect(oll.orbits.CORNERS.pieces[REF_CORNERS[4]].facelets).toEqual(['dim', 'dim', 'dim', 'dim', 'dim']);
    expect(oll.orbits.CENTERS.pieces).toHaveLength(6);
    expect(maskObject('cross').orbits.EDGES.pieces[REF_EDGES[8]].facelets[0]).toBe('ignored');
  });
});

describe('verificadores de etapa (apoio dos testes)', () => {
  it('o resolvido cumpre todas as etapas, menos a margarida', () => {
    for (const s of ['cross', 'firstLayer', 'f2l', 'yellowCross', 'llEdges', 'llCorners', 'oll', 'solved'] as const) expect(stage[s](REF)).toBe(true);
    expect(stage.daisy(REF)).toBe(false);
  });

  it('a margarida: as quatro arestas brancas em cima, com o branco para cima', () => {
    expect(stage.daisy(at('F2 R2 B2 L2'))).toBe(true);
    expect(stage.cross(at('F2 R2 B2 L2'))).toBe(false);
    expect(stage.daisy(at('F2 R2 B2 L2 F'))).toBe(false);
  });

  it('cada etapa cai sozinha quando a peça dela sai do lugar', () => {
    expect(stage.cross(at('F'))).toBe(false);
    const corner = at("R U R'");
    expect(stage.cross(corner)).toBe(true);
    expect(stage.firstLayer(corner)).toBe(false);
    const sune = at("R U R' U R U2 R'");
    expect(stage.yellowCross(sune)).toBe(true);
    expect(stage.oll(sune)).toBe(false);
  });

  it('a última camada aceita um giro de cima no fim', () => {
    expect(stage.solved(at('U'))).toBe(true);
    expect(stage.solved(at("R U R' U'"))).toBe(false);
    const cornersOnly = at(inv("U R U' L' U R' U' L"));
    expect(stage.llEdges(cornersOnly)).toBe(true);
    expect(stage.llCorners(cornersOnly)).toBe(false);
    const twisted = at("R' D' R D R' D' R D U R' D' R D R' D' R D R' D' R D R' D' R D U'");
    expect(stage.llCorners(twisted)).toBe(true);
    expect(stage.solved(twisted)).toBe(false);
  });

  it('F2L: são 41 classes, e o giro de cima não muda a classe', () => {
    expect(allF2lClasses().size).toBe(41);
    const pairUp = at("R U' R'");
    expect(f2lClass(pairUp.applyAlg('U'))).toBe(f2lClass(pairUp));
    expect(allF2lClasses().has(f2lClass(pairUp))).toBe(true);
  });
});
