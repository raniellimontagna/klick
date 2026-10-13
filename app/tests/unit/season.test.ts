import { describe, expect, it } from 'vitest';
import {
  T1_MARKS,
  basisOf,
  defaultSeason,
  finishUnlocked,
  marksFor,
  moreAdvanced,
  seasonFinish,
  seasonFrom,
  seasonOne,
  stepBelow,
} from '../../src/core/season';
import type { SeasonProgress, Solve } from '../../src/core/types';

let id = 0;
const sv = (ms: number, at: number, penalty: Solve['penalty'] = null, event: Solve['event'] = '333'): Solve => ({
  id: `s${++id}`, sessionId: 'x', event, ms, penalty, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});

describe('escada de degraus redondos (spec 5.2)', () => {
  it('o próximo degrau é o múltiplo do passo da faixa, estritamente abaixo', () => {
    expect(stepBelow(91000)).toBe(90000);
    expect(stepBelow(90000)).toBe(85000);
    expect(stepBelow(60010)).toBe(60000);
    expect(stepBelow(60000)).toBe(58000);
    expect(stepBelow(30500)).toBe(30000);
    expect(stepBelow(30000)).toBe(29000);
    expect(stepBelow(18770)).toBe(18000);
    expect(stepBelow(10200)).toBe(10000);
    expect(stepBelow(10000)).toBe(9500);
  });

  it('nenhuma meta fica abaixo de 1 s', () => {
    expect(stepBelow(1200)).toBe(1000);
    expect(stepBelow(800)).toBe(1000);
  });
});

describe('marcos da temporada (spec 5.3)', () => {
  it('a T1 é a de hoje, na ordem de MILESTONES', () => {
    expect(T1_MARKS.map((m) => `${m.kind}:${m.target}`)).toEqual([
      'count:1', 'single:120000', 'count:100', 'single:90000', 'ao5:90000', 'single:60000', 'streak:7', 'ao12:60000', 'count:1000',
    ]);
    expect(seasonOne()).toEqual({ n: 1, startedAt: 0, marks: T1_MARKS.map((m) => ({ ...m })), basis: { single: null, ao5: null, ao12: null } });
    expect(defaultSeason()).toEqual({ current: seasonOne(), past: [] });
  });

  it('da T2 em diante, as metas saem das marcas de quando a temporada começa', () => {
    expect(marksFor({ single: 15210, ao5: 18770, ao12: 19340 })).toEqual([
      { kind: 'count', target: 50 },
      { kind: 'single', target: 15000 },
      { kind: 'ao5', target: 18000 },
      { kind: 'streak', target: 7 },
      { kind: 'ao12', target: 19000 },
      { kind: 'count', target: 300 },
      { kind: 'ao5', target: 17000 },
      { kind: 'steady', target: 1900 },
      { kind: 'ao12', target: 18000 },
    ]);
  });

  it('sem média de 12 cai para a de 5; sem a de 5, para o single; a folga nunca fica abaixo de 1 s', () => {
    const marks = marksFor({ single: 15210, ao5: null, ao12: null });
    expect(marks[2]).toEqual({ kind: 'ao5', target: 15000 });
    expect(marks[4]).toEqual({ kind: 'ao12', target: 15000 });
    expect(marks[7]).toEqual({ kind: 'steady', target: 1500 });
    expect(marksFor({ single: 7000, ao5: 8000, ao12: 8500 })[7]).toEqual({ kind: 'steady', target: 1000 });
  });

  it('as marcas de base vêm dos solves dados (o melhor single e as melhores médias)', () => {
    const list = [20000, 21000, 19000, 22000, 18000, 25000].map((ms, i) => sv(ms, i + 1));
    expect(basisOf(list)).toEqual({ single: 18000, ao5: 20000, ao12: null });
  });
});

describe('acabamentos por temporada (spec 5.1)', () => {
  it('Brilho, Gelo e Carbono saem das três primeiras temporadas fechadas', () => {
    expect([1, 2, 3, 4].map(seasonFinish)).toEqual(['brilho', 'gelo', 'carbono', null]);
    expect(finishUnlocked('fosco', 0)).toBe(true);
    expect(finishUnlocked('brilho', 0)).toBe(false);
    expect(finishUnlocked('brilho', 1)).toBe(true);
    expect(finishUnlocked('gelo', 1)).toBe(false);
    expect(finishUnlocked('gelo', 2)).toBe(true);
    expect(finishUnlocked('carbono', 2)).toBe(false);
    expect(finishUnlocked('carbono', 5)).toBe(true);
  });
});

describe('temporada que vem de fora (spec 5.6)', () => {
  const ok: SeasonProgress = {
    current: { n: 2, startedAt: 10, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })), basis: { single: 1, ao5: null, ao12: null } },
    past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 3, startAo12: null, endAo12: null }],
  };

  it('passa inteira quando bem formada', () => {
    expect(seasonFrom(structuredClone(ok))).toEqual(ok);
  });

  it('qualquer pedaço errado recusa a temporada inteira', () => {
    const bad: unknown[] = [
      null,
      { ...ok, past: 'x' },
      { ...ok, current: { ...ok.current, n: 0 } },
      { ...ok, current: { ...ok.current, n: 1.5 } },
      { ...ok, current: { ...ok.current, startedAt: -1 } },
      { ...ok, current: { ...ok.current, marks: ok.current.marks.slice(1) } },
      { ...ok, current: { ...ok.current, marks: [{ kind: 'outro', target: 1 }, ...ok.current.marks.slice(1)] } },
      { ...ok, current: { ...ok.current, marks: [{ kind: 'count', target: 0 }, ...ok.current.marks.slice(1)] } },
      { ...ok, current: { ...ok.current, basis: { single: 'x', ao5: null, ao12: null } } },
      { ...ok, past: [{ ...ok.past[0], solves: -1 }] },
      { ...ok, past: [ok.past[0], ok.past[0]] },
      { ...ok, past: [{ ...ok.past[0], n: 2 }] },
    ];
    for (const v of bad) expect(seasonFrom(v)).toBeNull();
  });

  it('a mais adiantada é a de mais temporadas fechadas; no empate fica a daqui', () => {
    const fresh = defaultSeason();
    expect(moreAdvanced(fresh, ok)).toBe(ok);
    expect(moreAdvanced(ok, fresh)).toBe(ok);
    expect(moreAdvanced(fresh, null)).toBe(fresh);
    const tie = defaultSeason();
    expect(moreAdvanced(fresh, tie)).toBe(fresh);
  });
});
