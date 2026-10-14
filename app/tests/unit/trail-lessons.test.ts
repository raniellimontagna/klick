import { Alg } from 'cubing/alg';
import { describe, expect, it } from 'vitest';
import { invertAlg } from '../../src/core/trail/frame';
import { LESSONS } from '../../src/core/trail/lessons';
import { at, inv, stage } from './trail-cube';

const cubes = LESSONS.flatMap((l) => l.parts.map((part, i) => ({ step: l.step, i, title: part.title, cube: part.cube })));

describe('aulas: integridade (spec 5.6)', () => {
  it('9 aulas, uma por etapa, na ordem', () => {
    expect(LESSONS.map((l) => l.step)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('cada aula tem de 4 a 8 passos, com título único, texto e cubo', () => {
    for (const l of LESSONS) {
      expect(l.parts.length).toBeGreaterThanOrEqual(4);
      expect(l.parts.length).toBeLessThanOrEqual(8);
      expect(new Set(l.parts.map((p) => p.title)).size).toBe(l.parts.length);
      for (const p of l.parts) {
        expect(p.text.trim()).not.toBe('');
        expect(p.cube).toBeDefined();
      }
    }
  });

  it('as etapas 7, 8 e 9 levam ao treino dos seus casos; as outras não', () => {
    expect(LESSONS.map((l) => l.cases ?? null)).toEqual([null, null, null, null, null, null, 'oll2', 'pll2', 'f2l']);
  });

  it('todo setup e todo algoritmo estão em notação que o cubing.js entende, e o inverso do app bate com o dele', () => {
    for (const { cube } of cubes) {
      if (!cube) continue;
      for (const a of [cube.setup, cube.alg ?? '']) {
        expect(() => new Alg(a)).not.toThrow();
        expect(invertAlg(a)).toBe(inv(a));
      }
    }
  });

  it('todo passo com `ends` tem algoritmo', () => {
    for (const { cube, step, i } of cubes) if (cube?.ends) expect(cube.alg, `aula ${step + 1}, passo ${i + 1}`).toBeTruthy();
  });
});

describe('aulas: cada passo cumpre o que promete (cubing.js)', () => {
  it.each(cubes.filter((c) => c.cube?.from || c.cube?.ends).map((c) => [`aula ${c.step + 1}, passo ${c.i + 1}: ${c.title}`, c.cube!] as const))(
    '%s',
    (_name, cube) => {
      const start = at(cube.setup);
      if (cube.from) expect(stage[cube.from](start)).toBe(true);
      if (cube.ends) {
        expect(stage[cube.ends](at(cube.setup, cube.alg))).toBe(true);
        expect(stage[cube.ends](start)).toBe(false); // o passo mostra a mudança: o setup sozinho ainda não chegou lá
      }
    },
  );

  it('a aula 1 leva até a cruz: a margarida e depois as pétalas descendo', () => {
    const [daisy, cross] = ['Pétala por pétala', 'Desça as pétalas'].map((t) => LESSONS[0].parts.find((p) => p.title === t)!.cube!);
    expect(daisy.ends).toBe('daisy');
    expect(cross.ends).toBe('cross');
    expect(cross.mask).toBe('cross');
  });
});
