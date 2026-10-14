import { Alg } from 'cubing/alg';
import { describe, expect, it } from 'vitest';
import { CASE_SETS, CASES, caseById, casesOf, choiceOf, chosenAlg } from '../../src/core/trail/cases';
import { invertAlg } from '../../src/core/trail/frame';
import type { TrainCase } from '../../src/core/trail/types';
import { allF2lClasses, at, f2lClass, inv, otherSlotsSolved, pairPlace, solves, stage, topCornersPlaced, topEdgesOriented, topOrientationKey, topPiecesKey } from './trail-cube';

// O estado que o caso mostra: o inverso do algoritmo padrão, a partir do resolvido.
const setupOf = (c: TrainCase) => at(inv(c.algs[0]));
const EDGE_CASES = ['oll2-linha', 'oll2-l', 'oll2-ponto'];
const oll = casesOf('oll2');
const pll = casesOf('pll2');
const f2l = casesOf('f2l');

describe('conjuntos do treino: integridade (spec 5.6)', () => {
  it('10 casos de OLL, 6 de PLL e 41 de F2L, nessa ordem de conjuntos', () => {
    expect([...CASE_SETS]).toEqual(['oll2', 'pll2', 'f2l']);
    expect([oll.length, pll.length, f2l.length]).toEqual([10, 6, 41]);
    expect(CASES).toHaveLength(57);
  });

  it('ids únicos, com o prefixo do conjunto; nome e dica de reconhecimento preenchidos; de 1 a 3 algoritmos', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    for (const c of CASES) {
      expect(c.id.startsWith(`${c.set}-`)).toBe(true);
      expect(c.name.trim()).not.toBe('');
      expect(c.recog.trim()).not.toBe('');
      expect(c.algs.length).toBeGreaterThanOrEqual(1);
      expect(c.algs.length).toBeLessThanOrEqual(3);
      expect(new Set(c.algs).size).toBe(c.algs.length);
    }
  });

  it('todo algoritmo está em notação que o cubing.js entende, e o invertAlg do app escreve o mesmo inverso', () => {
    for (const c of CASES) {
      for (const a of c.algs) {
        expect(() => new Alg(a)).not.toThrow();
        expect(invertAlg(a)).toBe(inv(a));
      }
    }
  });

  it('caseById acha cada caso; chosenAlg cai no padrão quando a escolha não vale', () => {
    for (const c of CASES) expect(caseById(c.id)).toBe(c);
    expect(caseById('oll2-nada')).toBeUndefined();
    const h = caseById('oll2-h')!;
    expect(chosenAlg(h, {})).toBe(h.algs[0]);
    expect(chosenAlg(h, { 'oll2-h': 1 })).toBe(h.algs[1]);
    expect(choiceOf(h, { 'oll2-h': 2 })).toBe(0);
    expect(choiceOf(h, { 'oll2-h': -1 })).toBe(0);
    expect(choiceOf(h, { 'oll2-h': 0.5 })).toBe(0);
  });
});

describe('OLL em 2 passos', () => {
  it('os 3 casos da cruz: F2L pronto, sem cruz amarela; 0, 2 vizinhas e 2 opostas arestas orientadas', () => {
    const oriented = (id: string) => topEdgesOriented(setupOf(caseById(id)!));
    for (const id of EDGE_CASES) {
      const s = setupOf(caseById(id)!);
      expect(stage.f2l(s)).toBe(true);
      expect(stage.yellowCross(s)).toBe(false);
    }
    expect(oriented('oll2-ponto')).toEqual([]);
    const l = oriented('oll2-l');
    expect(l).toHaveLength(2);
    expect(Math.abs(l[0] - l[1]) % 2).toBe(1); // vizinhas: posições de paridade diferente
    const linha = oriented('oll2-linha');
    expect(linha).toHaveLength(2);
    expect(Math.abs(linha[0] - linha[1])).toBe(2); // opostas
  });

  it('os 7 casos dos cantos: cruz amarela pronta, topo não', () => {
    for (const c of oll.filter((x) => !EDGE_CASES.includes(x.id))) {
      const s = setupOf(c);
      expect(stage.yellowCross(s)).toBe(true);
      expect(stage.oll(s)).toBe(false);
    }
  });

  it('cada algoritmo resolve o próprio caso: a cruz nos 3 primeiros, o topo amarelo nos outros 7', () => {
    for (const c of oll) {
      const done = EDGE_CASES.includes(c.id) ? stage.yellowCross : stage.oll;
      for (const a of c.algs) expect(solves(setupOf(c), a, done), `${c.id}: ${a}`).toBe(true);
    }
  });

  it('nenhum caso repete outro (orientação de cima, com qualquer giro de cima)', () => {
    expect(new Set(oll.map((c) => topOrientationKey(setupOf(c)))).size).toBe(10);
  });
});

describe('PLL em 2 passos', () => {
  it('todo caso parte do topo amarelo e cada algoritmo resolve o cubo (com o giro final)', () => {
    for (const c of pll) {
      const s = setupOf(c);
      expect(stage.oll(s)).toBe(true);
      expect(stage.solved(s)).toBe(false);
      for (const a of c.algs) expect(solves(s, a, stage.solved), `${c.id}: ${a}`).toBe(true);
    }
  });

  it('T e Y trocam cantos; Ua, Ub, H e Z deixam os cantos no lugar', () => {
    const keeps = (id: string) => topCornersPlaced(setupOf(caseById(id)!));
    expect(['pll2-t', 'pll2-y'].map(keeps)).toEqual([false, false]);
    expect(['pll2-ua', 'pll2-ub', 'pll2-h', 'pll2-z'].map(keeps)).toEqual([true, true, true, true]);
  });

  it('nenhum caso repete outro', () => {
    expect(new Set(pll.map((c) => topPiecesKey(setupOf(c)))).size).toBe(6);
  });
});

describe('F2L com algoritmos', () => {
  it('ids f2l-01 a f2l-41 e nomes F2L 1 a F2L 41, em ordem', () => {
    expect(f2l.map((c) => c.id)).toEqual(Array.from({ length: 41 }, (_, i) => `f2l-${String(i + 1).padStart(2, '0')}`));
    expect(f2l.map((c) => c.name)).toEqual(Array.from({ length: 41 }, (_, i) => `F2L ${i + 1}`));
  });

  it('cada caso mexe só no par da frente-direita: a cruz e os outros três pares ficam prontos', () => {
    for (const c of f2l) {
      const s = setupOf(c);
      expect(otherSlotsSolved(s), c.id).toBe(true);
      expect(stage.f2l(s), c.id).toBe(false);
    }
  });

  it('os 41 casos são exatamente as 41 classes (canto e aresta do par, módulo o giro de cima), sem repetir', () => {
    const keys = f2l.map((c) => f2lClass(setupOf(c)));
    expect(new Set(keys).size).toBe(41);
    expect(new Set(keys)).toEqual(allF2lClasses());
  });

  it('os grupos da numeração: 1–24 os dois em cima, 25–30 só o canto em cima, 31–36 só a aresta em cima, 37–41 os dois no lugar', () => {
    const group = (n: number) => (n <= 24 ? [true, true] : n <= 30 ? [true, false] : n <= 36 ? [false, true] : [false, false]);
    f2l.forEach((c, i) => {
      const { cornerTop, edgeTop } = pairPlace(setupOf(c));
      expect([cornerTop, edgeTop], c.id).toEqual(group(i + 1));
    });
  });

  it('cada algoritmo resolve o próprio caso (F2L pronto, com o giro de cima antes)', () => {
    for (const c of f2l) for (const a of c.algs) expect(solves(setupOf(c), a, stage.f2l), `${c.id}: ${a}`).toBe(true);
  });
});
