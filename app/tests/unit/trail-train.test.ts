import { describe, expect, it } from 'vitest';
import { CASES, casesOf, chosenAlg } from '../../src/core/trail/cases';
import { tidyAlg, invertAlg } from '../../src/core/trail/frame';
import {
  byCase, caseScramble, caseStats, firmCount, levelName, levelOf, nextCase, setAverage, setStats, weakestFirst, weightOf,
} from '../../src/core/trail/train';
import type { Practice } from '../../src/core/types';
import { at, solves, stage } from './trail-cube';

let seq = 0;
let clock = 1_000;
// Uma tentativa; cada uma vem 1 s depois da anterior.
const p = (caseId: string, o: Partial<Practice> = {}): Practice => ({
  id: `p${String(++seq).padStart(4, '0')}`, caseId, ms: 3000, ok: true, helped: false, at: (clock += 1000), ...o,
});
const fixed = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
const OLL = casesOf('oll2').map((c) => c.id);
const allBut = (keep: string[]) => OLL.filter((id) => !keep.includes(id));

describe('nível de um caso pelo histórico (spec 7.3)', () => {
  it('nunca tentado é novo; acertar sem ajuda sobe 1 até 4; errar volta a 0', () => {
    expect(levelOf([])).toBeNull();
    const id = 'oll2-sune';
    expect(levelOf([p(id)])).toBe(1);
    expect(levelOf([p(id), p(id)])).toBe(2);
    expect(levelOf(Array.from({ length: 7 }, () => p(id)))).toBe(4);
    expect(levelOf([p(id), p(id), p(id), p(id, { ok: false })])).toBe(0);
    expect(levelOf([p(id, { ok: false }), p(id)])).toBe(1);
  });

  it('a ajuda não sobe o nível: acertar com ajuda volta a 0', () => {
    const id = 'oll2-sune';
    expect(levelOf([p(id, { helped: true })])).toBe(0);
    expect(levelOf([p(id), p(id), p(id, { helped: true })])).toBe(0);
  });

  it('os nomes: novo, aprendendo (0–1), firme (2–3) e dominado (4)', () => {
    expect([null, 0, 1, 2, 3, 4].map(levelName)).toEqual(['novo', 'aprendendo', 'aprendendo', 'firme', 'firme', 'dominado']);
  });

  it('byCase separa por caso e põe em ordem de tempo, mesmo vindo fora de ordem', () => {
    const a = p('oll2-h', { at: 50 });
    const b = p('oll2-h', { at: 10, ok: false });
    const c = p('oll2-pi');
    const groups = byCase([a, c, b]);
    expect(groups.get('oll2-h')).toEqual([b, a]);
    expect(groups.get('oll2-pi')).toEqual([c]);
    expect(levelOf(groups.get('oll2-h')!)).toBe(1);
  });
});

describe('números por caso (spec 7.4)', () => {
  it('tentativas, % de acerto, média das últimas 5 certas sem ajuda e o melhor tempo', () => {
    const id = 'pll2-t';
    const list = [
      p(id, { ms: 9000 }),
      p(id, { ms: 1000, helped: true }), // com ajuda: fora da média e do melhor
      p(id, { ms: 500, ok: false }), // errada: fora da média e do melhor
      ...[6000, 5000, 4000, 3000, 2000].map((ms) => p(id, { ms })),
    ];
    const s = caseStats(id, list);
    expect(s.attempts).toBe(8);
    expect(s.okRate).toBeCloseTo(7 / 8);
    expect(s.avg5).toBe(4000); // as 5 últimas certas sem ajuda: 6, 5, 4, 3 e 2 s
    expect(s.best).toBe(2000);
    expect(caseStats(id, [])).toEqual({ id, level: null, attempts: 0, okRate: null, avg5: null, best: null });
  });

  it('setStats segue a ordem da aula e firmCount conta os de nível 2 para cima', () => {
    const list = [p('oll2-l'), p('oll2-l'), p('oll2-sune'), p('oll2-h'), p('oll2-h'), p('oll2-h'), p('oll2-h')];
    const stats = setStats('oll2', list);
    expect(stats.map((s) => s.id)).toEqual(OLL);
    expect(firmCount(stats)).toBe(2); // L (2) e H (4); o Sune está em 1
  });

  it('do mais fraco ao mais firme: novos, depois o nível; no empate, o mais lento primeiro', () => {
    const list = [p('oll2-linha', { ms: 2000 }), p('oll2-l', { ms: 5000 }), p('oll2-ponto'), p('oll2-ponto')];
    const order = weakestFirst(setStats('oll2', list)).map((s) => s.id);
    expect(order.slice(0, 7)).toEqual(['oll2-sune', 'oll2-antisune', 'oll2-h', 'oll2-pi', 'oll2-farois', 'oll2-t', 'oll2-gravata']);
    expect(order.slice(7)).toEqual(['oll2-l', 'oll2-linha', 'oll2-ponto']);
  });
});

describe('peso no sorteio (spec 7.3)', () => {
  it('16 ÷ 2^nível; o novo pesa como o nível 0', () => {
    const s = (level: number | null) => ({ id: 'x', level, attempts: 1, okRate: 1, avg5: null, best: null });
    expect([null, 0, 1, 2, 3, 4].map((l) => weightOf(s(l), null))).toEqual([16, 16, 8, 4, 2, 1]);
  });

  it('dobra quando a média de 5 passa de 1,25 vez a média do conjunto (e só aí)', () => {
    const s = (avg5: number) => ({ id: 'x', level: 1, attempts: 5, okRate: 1, avg5, best: avg5 });
    expect(weightOf(s(1250), 1000)).toBe(8); // exatamente 1,25: não dobra
    expect(weightOf(s(1251), 1000)).toBe(16);
    expect(setAverage([s(1000), s(3000), { ...s(0), avg5: null }])).toBe(2000);
    expect(setAverage([])).toBeNull();
  });
});

describe('próximo caso (spec 7.3)', () => {
  it('os nunca tentados vêm primeiro, na ordem da aula', () => {
    expect(nextCase({ set: 'oll2', practice: [], off: [], last: null, rng: fixed(0.99) })?.id).toBe('oll2-linha');
    const tried = [p('oll2-linha'), p('oll2-l')];
    expect(nextCase({ set: 'oll2', practice: tried, off: [], last: 'oll2-l', rng: fixed(0) })?.id).toBe('oll2-ponto');
  });

  it('nunca o mesmo caso duas vezes seguidas, nem quando ele é o próximo novo', () => {
    // A última tentativa do Linha foi apagada: ele voltou a ser novo, mas acabou de sair.
    expect(nextCase({ set: 'oll2', practice: [], off: [], last: 'oll2-linha', rng: fixed(0) })?.id).toBe('oll2-l');
    const two = allBut(['oll2-sune', 'oll2-h']);
    const practice = [p('oll2-sune'), p('oll2-h')];
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(nextCase({ set: 'oll2', practice, off: two, last: 'oll2-sune', rng: fixed(r) })?.id).toBe('oll2-h');
    }
  });

  it('com um caso só no sorteio, ele repete; com todos fora, não há próximo', () => {
    const one = allBut(['oll2-pi']);
    expect(nextCase({ set: 'oll2', practice: [p('oll2-pi')], off: one, last: 'oll2-pi', rng: fixed(0.5) })?.id).toBe('oll2-pi');
    expect(nextCase({ set: 'oll2', practice: [], off: OLL, last: null, rng: fixed(0.5) })).toBeNull();
  });

  it('o sorteio segue os pesos: nível 4 (1) contra nível 0 (16), na ordem da aula (Pi antes de T)', () => {
    const practice = [p('oll2-t', { ok: false }), ...Array.from({ length: 4 }, () => p('oll2-pi'))];
    const off = allBut(['oll2-t', 'oll2-pi']);
    const pick = (r: number) => nextCase({ set: 'oll2', practice, off, last: null, rng: fixed(r) })?.id;
    expect(pick(0.05)).toBe('oll2-pi'); // 0,05 × 17 = 0,85 < 1
    expect(pick(0.06)).toBe('oll2-t'); // 1,02
    expect(pick(0.99)).toBe('oll2-t');
  });

  it('o caso lento pesa o dobro: a mesma sorte que daria o rápido passa a dar o lento', () => {
    const off = allBut(['oll2-t', 'oll2-pi']);
    const pick = (practice: Practice[], r: number) => nextCase({ set: 'oll2', practice, off, last: null, rng: fixed(r) })?.id;
    // Nível 1 nos dois (peso 8). T a 20 s, Pi a 10 s: média do conjunto 15 s, e 20 > 18,75 dobra o T (Pi 8, T 16, de 24).
    const slow = [p('oll2-t', { ms: 20000 }), p('oll2-pi', { ms: 10000 })];
    expect(pick(slow, 0.4)).toBe('oll2-t'); // 0,4 × 24 = 9,6 ≥ 8
    // Os dois iguais: sem dobra (8 e 8, de 16), a mesma sorte cai no Pi.
    const even = [p('oll2-t', { ms: 10000 }), p('oll2-pi', { ms: 10000 })];
    expect(pick(even, 0.4)).toBe('oll2-pi'); // 6,4 < 8
  });
});

describe('embaralhamento do caso (spec 5.5)', () => {
  it('sem giro de cima é o inverso do algoritmo; com giros, eles entram antes e depois', () => {
    const sune = "R U R' U R U2 R'";
    expect(caseScramble(sune, fixed(0, 0))).toBe(tidyAlg(invertAlg(sune)));
    expect(caseScramble(sune, fixed(0.25, 0.5))).toBe("U R U2 R' U' R U' R' U2");
    expect(caseScramble(sune, fixed(0.99, 0.99))).toBe("U' R U2 R' U' R U' R' U'");
  });

  it('para todo caso, todo algoritmo escolhido e todos os 16 giros, o algoritmo resolve o embaralhamento (com o giro de cima)', () => {
    const quarter = [0, 0.25, 0.5, 0.75];
    for (const c of CASES) {
      for (let choice = 0; choice < c.algs.length; choice++) {
        const alg = chosenAlg(c, { [c.id]: choice });
        for (const pre of quarter) {
          for (const post of quarter) {
            const scramble = caseScramble(alg, fixed(pre, post));
            expect(solves(at(scramble), alg, stage.solved), `${c.id} #${choice}: ${scramble}`).toBe(true);
          }
        }
      }
    }
  });
});
