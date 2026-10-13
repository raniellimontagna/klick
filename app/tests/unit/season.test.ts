import { describe, expect, it } from 'vitest';
import {
  T1_MARKS,
  basisOf,
  closeRecord,
  createSeasonTracker,
  defaultSeason,
  evaluateSeason,
  finishUnlocked,
  firstNearInSession,
  markLabel,
  markMessage,
  marksFor,
  moreAdvanced,
  planAdvance,
  seasonFinish,
  seasonFrom,
  seasonKey,
  seasonOne,
  seasonSolves,
  stepBelow,
  targetText,
} from '../../src/core/season';
import { MILESTONES } from '../../src/core/stats';
import type { SeasonProgress, Solve } from '../../src/core/types';
import { MILESTONE_INFO } from '../../src/strings';

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
      { ...ok, current: { ...ok.current, n: 3 } }, // current.n precisa ser past.length + 1
      { ...ok, past: [{ ...ok.past[0], startedAt: -1 }] },
      { ...ok, past: [{ ...ok.past[0], endedAt: 0 }] }, // fecha antes de começar
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

const DAY = 86400000;
const NOON = new Date(2026, 9, 1, 12).getTime();

// 1.000 solves de 3×3 de 50 s, 100 por dia em 10 dias seguidos a partir de NOON: fecham os 9 marcos da T1.
const t1History = (): Solve[] =>
  Array.from({ length: 1000 }, (_, i) => sv(50000, NOON + Math.floor(i / 100) * DAY + (i % 100) * 60000));

// Os 1.200 solves de 12 dias da equivalência da T1: os tempos oscilam enquanto descem (130 s - 70 ms × i, com até 6 s para cima ou para
// baixo). Os solves 551 a 553 são forçados: com o DNF do 550 e o +2 do 551, a janela que acende o ao5 é a do 553. O DNF do 996 e o +2
// do 995 fazem o mesmo com o ao12, que acende no 1006.
const T1_FORCED = new Map<number, number>([[551, 83390], [552, 61000], [553, 60000]]);
const t1Times = (i: number): number => T1_FORCED.get(i) ?? 130000 - i * 70 + ((i * 7) % 11 - 5) * 1200;
const t1Solves = (penalties: [number, Solve['penalty']][]): Solve[] => {
  const pen = new Map(penalties);
  return Array.from({ length: 1200 }, (_, i) => sv(t1Times(i), NOON + Math.floor(i / 100) * DAY + (i % 100) * 60000, pen.get(i) ?? null));
};

describe('avaliação da temporada (spec 5.4)', () => {
  it('a T1 acende os 9 marcos nos solves certos, com DNF e +2 nas janelas', () => {
    const list = t1Solves([[550, 'DNF'], [551, '+2'], [995, '+2'], [996, 'DNF']]);
    const status = evaluateSeason(seasonOne(), list);
    expect(status.every((m) => m.achieved)).toBe(true);
    // Os índices fixam o solve que acende cada marco, na ordem da T1.
    expect(status.map((m) => list.findIndex((s) => s.at === m.at))).toEqual([0, 66, 99, 495, 553, 924, 600, 1006, 999]);
  });

  it('o DNF e o +2 dentro das janelas mudam quando o ao5 e o ao12 acendem', () => {
    const acendeEm = (penalties: [number, Solve['penalty']][]) => {
      const list = t1Solves(penalties);
      return evaluateSeason(seasonOne(), list).map((m) => list.findIndex((s) => s.at === m.at));
    };
    expect(acendeEm([[551, '+2'], [995, '+2'], [996, 'DNF']])[4]).toBe(550); // sem o DNF do 550, o ao5 acende no 550
    expect(acendeEm([[550, 'DNF'], [995, '+2'], [996, 'DNF']])[4]).toBe(552); // sem o +2 do 551, o ao5 acende no 552
    expect(acendeEm([[550, 'DNF'], [551, '+2'], [995, '+2']])[7]).toBe(1001); // sem o DNF do 996, o ao12 acende no 1001
    expect(acendeEm([[550, 'DNF'], [551, '+2'], [996, 'DNF']])[7]).toBe(1001); // sem o +2 do 995, o ao12 acende no 1001
  });

  it('só contam solves de 3×3, fora de outros eventos e depois do início', () => {
    const state = { ...seasonOne(), n: 2, startedAt: NOON, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 2 })) };
    const list = [sv(20000, NOON - 1), sv(20000, NOON), sv(20000, NOON + 1, null, '222'), sv(20000, NOON + 2)];
    expect(seasonSolves(list, state).map((s) => s.at)).toEqual([NOON + 2]);
    expect(evaluateSeason(state, list)[0]).toEqual({ mark: { kind: 'count', target: 2 }, achieved: false, at: null, current: 1 });
  });

  it('"abaixo" é estrito; a folga conta 5 seguidos sem DNF, com o +2', () => {
    const state = {
      n: 2, startedAt: 0, basis: { single: null, ao5: null, ao12: null },
      marks: [
        { kind: 'single' as const, target: 15000 },
        { kind: 'steady' as const, target: 2000 },
        ...Array.from({ length: 7 }, () => ({ kind: 'count' as const, target: 99 })),
      ],
    };
    const even = [15000, 16000, 17000, 15500, 16500].map((ms, i) => sv(ms, i + 1));
    let s = evaluateSeason(state, even);
    expect(s[0].achieved).toBe(false); // 15.00 não é abaixo de 15 s
    expect(s[1]).toMatchObject({ achieved: true, current: 2000, at: 5 }); // 17.00 - 15.00 = 2.00, dentro da folga
    const withDnf = [sv(15000, 1), sv(15100, 2, 'DNF'), sv(15200, 3), sv(15300, 4), sv(15400, 5)];
    expect(evaluateSeason(state, withDnf)[1].achieved).toBe(false);
    // O +2 conta com os 2 s: 13.30 vira 15.30, e a variação dos 5 fica em 15.30 - 14.99.
    const plus2 = [sv(15000, 1), sv(13300, 2, '+2'), sv(15200, 3), sv(15300, 4), sv(14990, 5)];
    s = evaluateSeason(state, plus2);
    expect(s[0]).toMatchObject({ achieved: true, at: 5 });
    expect(s[1]).toMatchObject({ achieved: true, current: 310 });
  });

  it('o rastreador continua a conta quando a lista só ganhou solves no fim, e bate com a conta completa', () => {
    const all = t1History();
    const tracker = createSeasonTracker();
    const state = seasonOne();
    tracker.evaluate(state, all.slice(0, 500));
    expect(tracker.lastRun()).toBe('full');
    const grown = all.slice(0, 501);
    expect(tracker.evaluate(state, grown)).toEqual(evaluateSeason(state, grown));
    expect(tracker.lastRun()).toBe('appended');
    expect(tracker.evaluate(state, grown)).toEqual(evaluateSeason(state, grown));
    expect(tracker.lastRun()).toBe('cached');
    const edited = [...grown.slice(0, 10), { ...grown[10], penalty: 'DNF' as const }, ...grown.slice(11)];
    expect(tracker.evaluate(state, edited)).toEqual(evaluateSeason(state, edited));
    expect(tracker.lastRun()).toBe('full');
    const other = { ...state, n: 2 };
    tracker.evaluate(other, edited);
    expect(tracker.lastRun()).toBe('full');
    expect(seasonKey(other)).not.toBe(seasonKey(state));
  });
});

describe('marcos da T1 pela temporada', () => {
  const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();

  it('reconhece os marcos e mostra o progresso dos que faltam', () => {
    const xs = [sv(130000, NOW - DAY), sv(119000, NOW - DAY), sv(89000, NOW)];
    const status = evaluateSeason(seasonOne(), xs);
    const byId = Object.fromEntries(MILESTONES.map((id, i) => [id, status[i]] as const));
    expect(byId.first.achieved).toBe(true);
    expect(byId.sub2.achieved).toBe(true);
    expect(byId.sub130.achieved).toBe(true);
    expect(byId.sub1.achieved).toBe(false);
    expect(byId.sub1.current).toBe(89000); // era 'melhor 1:29.00'
    expect(byId.n100.current).toBe(3); // era '3/100'
    expect(byId.streak7.current).toBe(2); // era '2/7'
    expect(MILESTONES.filter((_, i) => status[i].achieved)).toEqual(['first', 'sub2', 'sub130']);
  });

  it('streak7 exige sete dias seguidos', () => {
    const streak7 = MILESTONES.indexOf('streak7');
    const xs = Array.from({ length: 7 }, (_, i) => sv(70000, NOW - (6 - i) * DAY));
    expect(evaluateSeason(seasonOne(), xs)[streak7].achieved).toBe(true);
    expect(evaluateSeason(seasonOne(), xs.slice(1))[streak7].achieved).toBe(false);
  });
});

describe('virada da temporada (spec 5.5)', () => {
  it('sem os 9 marcos, não vira', () => {
    expect(planAdvance(defaultSeason(), t1History().slice(0, 999), NOON + 20 * DAY)).toBeNull();
  });

  it('a T1 fechada no passado vai para o histórico e a T2 começa na conferência, com metas das marcas de agora', () => {
    const list = t1History();
    const now = NOON + 20 * DAY;
    const plan = planAdvance(defaultSeason(), list, now)!;
    expect(plan.fromN).toBe(1);
    expect(plan.record).toEqual({
      n: 1,
      startedAt: NOON,
      endedAt: list[999].at,
      solves: 1000,
      startAo12: null,
      endAo12: 50000,
    });
    expect(plan.next.n).toBe(2);
    expect(plan.next.startedAt).toBe(now);
    expect(plan.next.basis).toEqual({ single: 50000, ao5: 50000, ao12: 50000 });
    expect(plan.next.marks[1]).toEqual({ kind: 'single', target: 48000 });
    // Sem cascata: a T2 não tem solve nenhum ainda.
    expect(planAdvance({ current: plan.next, past: [plan.record] }, list, now)).toBeNull();
  });

  it('um solve de um evento que este app não conhece (de uma versão mais nova) não conta e não derruba a conta', () => {
    const list = t1History();
    const now = NOON + 20 * DAY;
    const alien = sv(1000, list[500].at + 1, null, 'fto' as Solve['event']);
    const withAlien = [...list.slice(0, 501), alien, ...list.slice(501)];
    expect(seasonSolves(withAlien, defaultSeason().current)).toHaveLength(1000);
    const plan = planAdvance(defaultSeason(), withAlien, now)!;
    expect(plan.record.solves).toBe(1000);
    expect(plan.next.basis).toEqual({ single: 50000, ao5: 50000, ao12: 50000 });
  });

  it('o registro conta só os solves até o que fechou, e a melhor média de 12 até ali', () => {
    const state = { n: 2, startedAt: NOON, basis: { single: 20000, ao5: 21000, ao12: 22000 }, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 12 })) };
    const list = Array.from({ length: 15 }, (_, i) => sv(19000 + i * 100, NOON + 1 + i));
    const status = evaluateSeason(state, list);
    expect(closeRecord(state, list, status)).toEqual({ n: 2, startedAt: NOON, endedAt: NOON + 12, solves: 12, startAo12: 22000, endAo12: 19550 });
  });
});

describe('rótulos dos marcos (spec 7.3)', () => {
  it('a T1 usa os de hoje; da T2 em diante saem do tipo e da meta', () => {
    expect(seasonOne().marks.map((m, i) => markLabel(1, i, m))).toEqual(MILESTONES.map((id) => MILESTONE_INFO[id].label));
    const marks = marksFor({ single: 15210, ao5: 18770, ao12: 61000 });
    expect(marks.map((m, i) => markLabel(2, i, m))).toEqual([
      '50 solves na temporada',
      'Single abaixo de 15 s',
      'Média de 5 abaixo de 18 s',
      '7 dias seguidos',
      'Média de 12 abaixo de 1:00',
      '300 solves na temporada',
      'Média de 5 abaixo de 17 s',
      '5 seguidos dentro de 1.9 s',
      'Média de 12 abaixo de 58 s',
    ]);
    expect(targetText(9500)).toBe('9.5 s');
    expect(targetText(90000)).toBe('1:30');
    expect(markMessage(1, 5, seasonOne().marks[5])).toBe(MILESTONE_INFO.sub1.msg);
    expect(markMessage(2, 2, marks[2])).toBe('Média de 5 abaixo de 18 s');
  });
});

describe('quase lá (spec 7.2)', () => {
  const filler = Array.from({ length: 8 }, () => ({ kind: 'count' as const, target: 99999 }));

  it('uma vez por marco por sessão: um solve anterior da sessão que já ficou perto cala o seguinte', () => {
    const marks = [{ kind: 'ao5' as const, target: 18000 }, ...filler];
    const prior = [18300, 18400, 18200, 18500].map((ms, i) => sv(ms, i + 1));
    const first = sv(18350, 5);
    expect(firstNearInSession(marks, Array(9).fill(false), prior, prior, first)).toEqual({ index: 0, mark: marks[0], gap: 350 });
    const all = [...prior, first];
    expect(firstNearInSession(marks, Array(9).fill(false), all, all, sv(18300, 6))).toBeNull();
    expect(firstNearInSession(marks, Array(9).fill(false), all, [], sv(18300, 6))).toEqual({ index: 0, mark: marks[0], gap: 350 });
  });

  it('marco já feito, meta batida ou longe demais não ficam perto', () => {
    const marks = [{ kind: 'single' as const, target: 15000 }, ...filler];
    expect(firstNearInSession(marks, [true, ...Array(8).fill(false)], [], [], sv(15200, 1))).toBeNull();
    expect(firstNearInSession(marks, Array(9).fill(false), [], [], sv(14900, 1))).toBeNull();
    expect(firstNearInSession(marks, Array(9).fill(false), [], [], sv(15500, 1))).toBeNull(); // 3,3% acima
    expect(firstNearInSession(marks, Array(9).fill(false), [], [], sv(15000, 1, 'DNF'))).toBeNull();
  });
});
