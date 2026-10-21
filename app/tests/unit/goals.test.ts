import { describe, expect, it } from 'vitest';
import {
  type Goal,
  GOAL_ID,
  GOAL_MAX,
  GOAL_TARGET_MAX,
  firstReach,
  formatTarget,
  freeGoalId,
  goalName,
  goalPhrase,
  goalsReachedBy,
  goalStatus,
  isGoal,
  makeGoal,
  parseGoalTarget,
  remakeGoal,
} from '../../src/core/goals';
import type { EventId, Solve } from '../../src/core/types';

let id = 0;
let clock = 1_000_000;
// Cada solve cai um minuto depois do anterior; `at` explícito vale quando o teste precisa de uma data certa.
const sv = (ms: number, penalty: Solve['penalty'] = null, event: EventId = '333', at = (clock += 60000)): Solve => ({
  id: String(++id), sessionId: 's1', event, ms, penalty, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});
const run = (list: number[]): Solve[] => list.map((ms) => sv(ms));
const goal = (over: Partial<Goal> = {}): Goal => ({ kind: 'single', event: '333', targetMs: 13000, startMs: 14000, createdAt: 5, reachedAt: null, ...over });

describe('metas: validação', () => {
  it('constantes', () => {
    expect(GOAL_MAX).toBe(6);
    expect(GOAL_TARGET_MAX).toBe(3_599_999);
    expect(GOAL_ID.test('a9z')).toBe(true);
    expect(GOAL_ID.test('A9z')).toBe(false);
    expect(GOAL_ID.test('a9')).toBe(false);
    expect(GOAL_ID.test('abcd')).toBe(false);
  });

  it('isGoal aceita a meta e recusa chave a mais, alvo 0 e 3600000, evento desconhecido e NaN', () => {
    expect(isGoal(goal())).toBe(true);
    expect(isGoal(goal({ startMs: null, reachedAt: 0 }))).toBe(true);
    expect(isGoal(goal({ kind: 'ao12', targetMs: GOAL_TARGET_MAX }))).toBe(true);
    expect(isGoal({ ...goal(), extra: 1 })).toBe(false);
    const { createdAt: _c, ...semChave } = goal();
    expect(isGoal(semChave)).toBe(false);
    expect(isGoal(goal({ targetMs: 0 }))).toBe(false);
    expect(isGoal(goal({ targetMs: 3_600_000 }))).toBe(false);
    expect(isGoal(goal({ targetMs: 12.5 }))).toBe(false);
    expect(isGoal(goal({ targetMs: Number.NaN }))).toBe(false);
    expect(isGoal(goal({ event: 'xyz' as EventId }))).toBe(false);
    expect(isGoal(goal({ kind: 'ao50' as Goal['kind'] }))).toBe(false);
    expect(isGoal(goal({ startMs: 0 }))).toBe(false);
    expect(isGoal(goal({ startMs: Number.NaN }))).toBe(false);
    expect(isGoal(goal({ createdAt: -1 }))).toBe(false);
    expect(isGoal(goal({ reachedAt: -1 }))).toBe(false);
    expect(isGoal(goal({ reachedAt: Number.NaN }))).toBe(false);
    for (const v of [null, undefined, 5, 'x', [], [goal()]]) expect(isGoal(v)).toBe(false);
  });

  it('freeGoalId sorteia uma vaga de 3 caracteres que ninguém tomou', () => {
    const got = freeGoalId(new Set());
    expect(GOAL_ID.test(got)).toBe(true);
    // O sorteio vai de '000' a 'zzz' (46.656 vagas): 0,5 cai em 23.328, 'i00'.
    expect(freeGoalId(new Set(), () => 0)).toBe('000');
    expect(freeGoalId(new Set(), () => 0.5)).toBe('i00');
    expect(freeGoalId(new Set(), () => 0.999999)).toBe('zzz');
    // Uma vaga tomada sorteia de novo.
    const draws = [0, 0.5];
    expect(freeGoalId(new Set(['000']), () => draws.shift() ?? 0)).toBe('i00');
    // Um sorteio que só cai em vaga tomada não prende: depois de alguns azares, a primeira livre na ordem.
    expect(freeGoalId(new Set(['000']), () => 0)).toBe('001');
    // Com só uma vaga livre, é essa, qualquer que seja o sorteio.
    const taken = new Set<string>();
    for (let n = 0; n < 36 ** 3; n++) taken.add(n.toString(36).padStart(3, '0'));
    expect(taken.size).toBe(46_656);
    taken.delete('k7q');
    expect(freeGoalId(taken, () => 0)).toBe('k7q');
    expect(freeGoalId(taken, () => 0.999999)).toBe('k7q');
    // Cheio: não há o que devolver.
    taken.add('k7q');
    expect(() => freeGoalId(taken)).toThrow();
  });
});

describe('metas: texto do alvo', () => {
  it('parseGoalTarget lê segundos como se fala', () => {
    const ms = (t: string) => parseGoalTarget(t);
    expect(ms('15')).toEqual({ ok: true, ms: 15000 });
    expect(ms('14.5')).toEqual({ ok: true, ms: 14500 });
    expect(ms('14,5')).toEqual({ ok: true, ms: 14500 });
    expect(ms('14.55')).toEqual({ ok: true, ms: 14550 });
    expect(ms('14.05')).toEqual({ ok: true, ms: 14050 });
    expect(ms('90')).toEqual({ ok: true, ms: 90000 });
    expect(ms('1:30')).toEqual({ ok: true, ms: 90000 });
    expect(ms('1:02.5')).toEqual({ ok: true, ms: 62500 });
    expect(ms('  12  ')).toEqual({ ok: true, ms: 12000 });
    expect(ms('59:59.99')).toEqual({ ok: true, ms: 3_599_990 });
    expect(ms('')).toEqual({ ok: false, reason: 'empty' });
    expect(ms('   ')).toEqual({ ok: false, reason: 'empty' });
    for (const t of ['12..5', 'abc', '0', '0.00', '0:00', '1:5', '1:60', '1.234', '1:02.345', '-5', '12 s', '.5', '15.', '1:2:3', '1e3']) {
      expect(ms(t), t).toEqual({ ok: false, reason: 'bad' });
    }
    expect(ms('3600')).toEqual({ ok: false, reason: 'range' });
    expect(ms('60:00')).toEqual({ ok: false, reason: 'range' });
    expect(ms('99999999999999999999')).toEqual({ ok: false, reason: 'range' });
  });

  it('formatTarget e goalName', () => {
    expect(formatTarget(13000)).toBe('13 s');
    expect(formatTarget(12500)).toBe('12.5 s');
    expect(formatTarget(14550)).toBe('14.55 s');
    expect(formatTarget(14050)).toBe('14.05 s');
    expect(formatTarget(59990)).toBe('59.99 s');
    expect(formatTarget(60000)).toBe('1:00');
    expect(formatTarget(90000)).toBe('1:30');
    expect(formatTarget(62500)).toBe('1:02.5');
    expect(formatTarget(3_599_990)).toBe('59:59.99');
    expect(goalName({ kind: 'ao12', targetMs: 13000 })).toBe('Média de 12 abaixo de 13 s');
    expect(goalName({ kind: 'ao5', targetMs: 60000 })).toBe('Média de 5 abaixo de 1:00');
    expect(goalName({ kind: 'single', targetMs: 12500 })).toBe('Single abaixo de 12.5 s');
    expect(goalPhrase({ kind: 'ao12', targetMs: 13000 })).toBe('média de 12 abaixo de 13 s');
    expect(goalPhrase({ kind: 'single', targetMs: 11000 })).toBe('single abaixo de 11 s');
  });
});

describe('metas: alcance', () => {
  it('firstReach do single é o at do primeiro solve abaixo do alvo (igual não vale)', () => {
    const list = run([14000, 13000, 12999, 12000]);
    expect(firstReach(list, 'single', 13000)).toBe(list[2]!.at);
    expect(firstReach(list, 'single', 11000)).toBeNull();
    expect(firstReach([], 'single', 13000)).toBeNull();
  });

  it('firstReach da ao5 é o at do solve que fecha a primeira janela abaixo', () => {
    // Janelas: [15,15,15,15,15]=15; depois entram 9s e a janela passa a descartar o melhor e o pior.
    const list = run([15000, 15000, 15000, 15000, 15000, 9000, 9000, 9000, 9000]);
    // A janela que termina no 7º solve: 15,15,15,9,9 -> corta 9 e 15 -> (15+15+9)/3 = 13 (não é abaixo de 13).
    // A que termina no 8º: 15,15,9,9,9 -> (15+9+9)/3 = 11.
    expect(firstReach(list, 'ao5', 13000)).toBe(list[7]!.at);
    expect(firstReach(list.slice(0, 4), 'ao5', 99999)).toBeNull(); // sem 5 solves não há média
    expect(firstReach(list, 'ao12', 99999)).toBeNull();
  });

  it('DNF nunca alcança e +2 conta', () => {
    expect(firstReach([sv(9000, 'DNF')], 'single', 13000)).toBeNull();
    // 12,0 s +2 = 14,0 s: não chega abaixo de 13.
    expect(firstReach([sv(12000, '+2')], 'single', 13000)).toBeNull();
    // 10,5 s +2 = 12,5 s: chega.
    const plus = [sv(10500, '+2')];
    expect(firstReach(plus, 'single', 13000)).toBe(plus[0]!.at);
    // Um DNF dentro da média que sobrevive ao corte (dois DNF) dá DNF: não alcança.
    const dnfs = [sv(9000), sv(9000), sv(9000, 'DNF'), sv(9000, 'DNF'), sv(9000)];
    expect(firstReach(dnfs, 'ao5', 99999)).toBeNull();
    // Um DNF só é cortado: a média vale.
    const one = [sv(9000), sv(9000), sv(9000, 'DNF'), sv(9000), sv(9000)];
    expect(firstReach(one, 'ao5', 13000)).toBe(one[4]!.at);
  });
});

describe('metas: criar e refazer', () => {
  it('makeGoal nasce alcançada com a data do primeiro solve que chegou', () => {
    const list = run([14000, 12000, 15000]);
    const g = makeGoal({ kind: 'single', event: '333', targetMs: 13000 }, list, 777);
    expect(g).toEqual({ kind: 'single', event: '333', targetMs: 13000, startMs: 12000, createdAt: 777, reachedAt: list[1]!.at });
    expect(isGoal(g)).toBe(true);
  });

  it('makeGoal sem histórico: startMs null, reachedAt null', () => {
    expect(makeGoal({ kind: 'ao5', event: '222', targetMs: 5000 }, [], 9)).toEqual({
      kind: 'ao5', event: '222', targetMs: 5000, startMs: null, createdAt: 9, reachedAt: null,
    });
  });

  it('remakeGoal igual devolve a mesma; mudar o alvo refaz pelo histórico e guarda createdAt', () => {
    const list = run([14000, 12000, 15000]);
    const old = makeGoal({ kind: 'single', event: '333', targetMs: 11000 }, list, 100);
    expect(old.reachedAt).toBeNull();
    expect(remakeGoal(old, { kind: 'single', event: '333', targetMs: 11000 }, list, 999)).toBe(old);
    const novo = remakeGoal(old, { kind: 'single', event: '333', targetMs: 13000 }, list, 999);
    expect(novo).toEqual({ kind: 'single', event: '333', targetMs: 13000, startMs: 12000, createdAt: 100, reachedAt: list[1]!.at });
    const outroTipo = remakeGoal(old, { kind: 'ao5', event: '333', targetMs: 11000 }, list, 999);
    expect(outroTipo.kind).toBe('ao5');
    expect(outroTipo.createdAt).toBe(100);
    expect(outroTipo.startMs).toBeNull(); // 3 solves: sem média de 5
    const outroEvento = remakeGoal(old, { kind: 'single', event: '222', targetMs: 11000 }, [], 999);
    expect(outroEvento.event).toBe('222');
    expect(outroEvento.createdAt).toBe(100);
  });
});

describe('metas: estado', () => {
  it('goalStatus: progress 0.59 de 14.41 a 13.58 com alvo 13, left 580', () => {
    const list = run([14410, 13900, 13580, 13700]);
    const s = goalStatus(goal({ targetMs: 13000, startMs: 14410 }), list);
    expect(s.best).toBe(13580);
    expect(s.start).toBe(14410);
    expect(s.reachedAt).toBeNull();
    expect(s.left).toBe(580);
    expect(s.progress).toBeCloseTo(0.59, 2);
  });

  it('goalStatus sem tempo: best, start e left null, progress 0', () => {
    expect(goalStatus(goal({ startMs: null }), [])).toEqual({ best: null, reachedAt: null, start: null, progress: 0, left: null });
    expect(goalStatus(goal({ kind: 'ao5', startMs: null }), run([10000, 10000]))).toEqual({ best: null, reachedAt: null, start: null, progress: 0, left: null });
  });

  it('goalStatus alcançada: progress 1, left null, reachedAt da meta', () => {
    const list = run([14000, 12000]);
    const s = goalStatus(goal({ reachedAt: 42 }), list);
    expect(s).toMatchObject({ reachedAt: 42, progress: 1, left: null, best: 12000 });
  });

  it('goalStatus alcançada fora deste aparelho: a data do primeiro solve que chegou', () => {
    const list = run([14000, 12000, 15000]);
    const s = goalStatus(goal({ reachedAt: null }), list);
    expect(s.reachedAt).toBe(list[1]!.at);
    expect(s.progress).toBe(1);
    expect(s.left).toBeNull();
  });

  it('goalStatus usa o primeiro valor finito da série quando falta startMs', () => {
    const list = [sv(9000, 'DNF'), sv(14000), sv(13500)];
    const s = goalStatus(goal({ startMs: null, targetMs: 13000 }), list);
    expect(s.start).toBe(14000);
    expect(s.progress).toBeCloseTo(0.5, 5);
    // Média: o primeiro valor finito da série rolante.
    const five = run([20000, 20000, 20000, 20000, 20000, 10000, 10000]);
    const a = goalStatus(goal({ kind: 'ao5', startMs: null, targetMs: 12000 }), five);
    expect(a.start).toBe(20000);
    expect(a.best).toBe(16670); // 20, 20, 20, 10, 10 corta o melhor e o pior: (20 + 20 + 10) / 3
    expect(a.progress).toBeCloseTo((20000 - 16670) / (20000 - 12000), 5);
  });

  it('goalStatus: start ≤ alvo não deixa progresso (e não divide por zero)', () => {
    const s = goalStatus(goal({ startMs: 13000, targetMs: 13000 }), run([13500]));
    expect(s.progress).toBe(0);
    expect(goalStatus(goal({ startMs: 12000, targetMs: 13000 }), run([13500])).progress).toBe(0);
  });

  it('goalStatus: o melhor pior que o início fica em 0, não negativo', () => {
    expect(goalStatus(goal({ startMs: 14000, targetMs: 13000 }), run([15000])).progress).toBe(0);
  });
});

describe('metas: o solve novo', () => {
  const id1 = 'a1';
  it('goalsReachedBy comemora o solve que chega primeiro', () => {
    const history = run([14000, 13500]);
    const solve = sv(12900);
    const got = goalsReachedBy({ [id1]: goal() }, history, solve);
    expect(got).toEqual([{ id: id1, at: solve.at, celebrate: true }]);
  });

  it('solve que não passa do alvo não devolve nada', () => {
    expect(goalsReachedBy({ [id1]: goal() }, run([14000]), sv(13000))).toEqual([]);
  });

  it('alcance que veio de fora (sem reachedAt): o solve novo não comemora e grava a data antiga', () => {
    const history = run([14000, 12000, 15000]); // já tinha chegado antes (sync, importação)
    const solve = sv(12500);
    const got = goalsReachedBy({ [id1]: goal({ reachedAt: null }) }, history, solve);
    expect(got).toEqual([{ id: id1, at: history[1]!.at, celebrate: false }]);
  });

  it('meta já alcançada ou de outro evento fica de fora', () => {
    const solve = sv(10000);
    const goals = {
      a1: goal({ reachedAt: 3 }),
      b2: goal({ event: '222' }),
      c3: goal(),
    };
    expect(goalsReachedBy(goals, run([14000]), solve).map((r) => r.id)).toEqual(['c3']);
  });

  it('a média: o solve que fecha a janela abaixo comemora; fora da janela não', () => {
    const history = run([15000, 15000, 15000, 15000, 15000, 9000, 9000]);
    const g = goal({ kind: 'ao5', targetMs: 12000 });
    // 15,15,9,9 + 9 = (15+9+9)/3 = 11 < 12
    const solve = sv(9000);
    expect(goalsReachedBy({ x1: g }, history, solve)).toEqual([{ id: 'x1', at: solve.at, celebrate: true }]);
    // Com só 4 anteriores, não há média de 5 com o solve.
    expect(goalsReachedBy({ x1: g }, run([9000, 9000, 9000]), sv(9000))).toEqual([]);
  });

  it('devolve na ordem de createdAt', () => {
    const solve = sv(10000);
    const goals = {
      zz: goal({ createdAt: 30, targetMs: 12000 }),
      aa: goal({ createdAt: 10, targetMs: 13000 }),
      mm: goal({ createdAt: 20, targetMs: 11000 }),
    };
    expect(goalsReachedBy(goals, [], solve).map((r) => r.id)).toEqual(['aa', 'mm', 'zz']);
  });

  it('um DNF novo não alcança nada', () => {
    expect(goalsReachedBy({ a1: goal() }, run([14000]), sv(9000, 'DNF'))).toEqual([]);
  });
});
