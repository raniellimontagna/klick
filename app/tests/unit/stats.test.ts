import { describe, expect, it } from 'vitest';
import {
  achievedIds, averageOf, bestAverage, bestSingle, currentStreak, dayKey, effectiveMs, formatMs, formatSolve,
  meanOf, milestoneProgress, monthHeat, officialAverage, officialAverageLabel, pbFlags, resultKind,
  rollingAverages, solveDeltas, stdDevMs, trimCount,
} from '../../src/core/stats';
import type { Solve } from '../../src/core/types';
import { T } from '../../src/strings';

const DAY = 86400000;
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
let id = 0;
const sv = (ms: number, penalty: Solve['penalty'] = null, at = NOW): Solve => ({
  id: String(++id), sessionId: 's1', event: '333', ms, penalty, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});

// Casos portados de prototype/tests/stats.test.js.
describe('estatísticas', () => {
  it('effectiveMs aplica +2 e DNF', () => {
    expect(effectiveMs(sv(58420))).toBe(58420);
    expect(effectiveMs(sv(58420, '+2'))).toBe(60420);
    expect(effectiveMs(sv(58420, 'DNF'))).toBe(Infinity);
  });

  it('formatMs trunca no centésimo e trata vazio e DNF', () => {
    expect(formatMs(58429)).toBe('0:58.42');
    expect(formatMs(61005)).toBe('1:01.00');
    expect(formatMs(Infinity)).toBe('DNF');
    expect(formatMs(null)).toBe('—');
    expect(formatSolve(sv(58420, '+2'))).toBe('1:00.42+');
    expect(formatSolve(sv(58420, 'DNF'))).toBe('DNF');
  });

  it('trimCount segue a convenção de 5% arredondado para cima', () => {
    expect([5, 12, 50, 100].map(trimCount)).toEqual([1, 1, 3, 5]);
  });

  it('averageOf descarta melhor e pior e arredonda para 10 ms', () => {
    const xs = [60000, 70000, 50000, 65000, 80000].map((ms) => sv(ms));
    expect(averageOf(xs, 5)).toBe(65000);
    expect(averageOf(xs.slice(0, 4), 5)).toBeNull();
  });

  it('um DNF é descartado; dois DNFs tornam a média de 5 DNF', () => {
    const one = [sv(60000), sv(61000, 'DNF'), sv(62000), sv(63000), sv(64000)];
    expect(averageOf(one, 5)).toBe(63000);
    const two = [sv(60000), sv(61000, 'DNF'), sv(62000, 'DNF'), sv(63000), sv(64000)];
    expect(averageOf(two, 5)).toBe(Infinity);
  });

  it('rollingAverages e bestAverage', () => {
    const xs = [70000, 60000, 65000, 62000, 61000, 90000].map((ms) => sv(ms));
    const r = rollingAverages(xs, 5);
    expect(r.slice(0, 4)).toEqual([null, null, null, null]);
    expect(r[4]).toBe(62670);
    expect(r[5]).toBe(62670);
    expect(bestAverage(xs, 5)).toBe(62670);
  });

  it('bestSingle ignora DNF e soma +2', () => {
    expect(bestSingle([sv(50000, 'DNF'), sv(59000, '+2'), sv(60500)])).toBe(60500);
    expect(bestSingle([])).toBeNull();
  });

  it('stdDevMs ignora DNF e precisa de 2 valores', () => {
    expect(stdDevMs([sv(60000)])).toBeNull();
    expect(Math.round(stdDevMs([sv(60000), sv(62000), sv(64000), sv(1, 'DNF')])!)).toBe(2000);
  });

  it('currentStreak conta dias seguidos até hoje ou ontem', () => {
    const xs = [sv(60000, null, NOW - 3 * DAY), sv(60000, null, NOW - 2 * DAY), sv(60000, null, NOW - DAY), sv(60000, null, NOW)];
    expect(currentStreak(xs, NOW)).toBe(4);
    expect(currentStreak(xs.slice(0, 3), NOW)).toBe(3);
    expect(currentStreak([sv(60000, null, NOW - 5 * DAY)], NOW)).toBe(0);
    expect(dayKey(NOW)).toBe('2026-10-08');
  });

  it('solveDeltas e resultKind: média pela sessão, recorde por todos os solves', () => {
    const all = [60000, 61000, 62000, 63000, 64000, 50000].map((ms) => sv(ms));
    const session = [70000, 71000, 72000, 73000, 74000].map((ms) => sv(ms));
    const d = solveDeltas(all, sv(71500), session);
    expect(d.vsAo5).toBe(71500 - 72000);
    expect(d.vsPb).toBe(71500 - 50000);
    expect(d.isPb).toBe(false);
    expect(resultKind(all, sv(71500), session)).toBe('good');
    expect(resultKind(all, sv(73000), session)).toBe('slow');
  });

  it('solveDeltas e resultKind', () => {
    const hist = [62000, 63000, 61000, 64000, 60000].map((ms) => sv(ms));
    expect(solveDeltas(hist, sv(59000))).toEqual({ vsAo5: 59000 - 62000, vsPb: -1000, isPb: true });
    expect(resultKind(hist, sv(59000))).toBe('pb');
    expect(resultKind(hist, sv(61500))).toBe('good');
    expect(resultKind(hist, sv(70000))).toBe('slow');
    expect(resultKind(hist, sv(50000, 'DNF'))).toBe('dnf');
    expect(resultKind(hist, sv(50000, '+2'))).toBe('plus2');
    expect(resultKind([], sv(80000))).toBe('good');
  });

  it('monthHeat marca níveis, hoje e o dia do recorde', () => {
    const xs = [
      ...Array.from({ length: 6 }, () => sv(70000, null, NOW - 2 * DAY)),
      sv(55000, null, NOW - DAY),
      ...Array.from({ length: 15 }, () => sv(68000, null, NOW)),
    ];
    const heat = monthHeat(xs, NOW);
    expect(heat).toHaveLength(31);
    expect(heat[5].level).toBe(2);
    expect(heat[6].level).toBe(1);
    expect(heat[6].pb).toBe(true);
    expect(heat[7].level).toBe(3);
    expect(heat[7].today).toBe(true);
    expect(heat[8].level).toBe(0);
  });

  it('milestoneProgress reconhece os marcos e mostra o progresso', () => {
    const xs = [sv(130000, null, NOW - DAY), sv(119000, null, NOW - DAY), sv(89000, null, NOW)];
    const m = Object.fromEntries(milestoneProgress(xs, NOW).map((x) => [x.id, x] as const));
    expect(m.first.achieved).toBe(true);
    expect(m.sub2.achieved).toBe(true);
    expect(m.sub130.achieved).toBe(true);
    expect(m.sub1.achieved).toBe(false);
    expect(m.sub1.progress).toBe('melhor 1:29.00');
    expect(m.n100.progress).toBe('3/100');
    expect(m.streak7.progress).toBe('2/7');
    expect(achievedIds(xs, NOW)).toEqual(['first', 'sub2', 'sub130']);
  });

  it('streak7 exige sete dias seguidos', () => {
    const xs = Array.from({ length: 7 }, (_, i) => sv(70000, null, NOW - (6 - i) * DAY));
    expect(achievedIds(xs, NOW)).toContain('streak7');
    expect(achievedIds(xs.slice(1), NOW)).not.toContain('streak7');
  });

  it('pbFlags marca só quem bateu o recorde da época', () => {
    const xs = [70000, 72000, 65000, 66000, 64000].map((ms) => sv(ms));
    expect(pbFlags(xs)).toEqual([false, false, true, false, true]);
    expect(pbFlags([sv(60000), sv(50000, 'DNF'), sv(59000)])).toEqual([false, false, true]);
  });

  it('deltas e progressos vêm de strings.ts e truncam no centésimo', () => {
    expect(T.chips.vsAo5(-429)).toBe('▼ 0.42 s vs média de 5');
    expect(T.coach.pbSingle(1999)).toBe('Novo recorde — 1.99 s mais rápido. Vale lembrar o que funcionou.');
    expect(T.progress.best('1:29.00')).toBe('melhor 1:29.00');
    expect(T.progress.count(3, 100)).toBe('3/100');
  });
});

let n = 0;
const mk = (ms: number, penalty: Solve['penalty'] = null, event: Solve['event'] = '666'): Solve => ({
  id: String(++n), sessionId: 's', event, ms, penalty, at: n, scramble: '', note: '', createdAt: n, updatedAt: n, deletedAt: null,
});

describe('média oficial por evento', () => {
  it('Mo3 é a média simples dos três últimos', () => {
    expect(meanOf([mk(90000), mk(100000), mk(110000), mk(120000)], 3)).toBe(110000);
  });
  it('Mo3 com DNF vira DNF; com menos de 3 solves é null', () => {
    expect(meanOf([mk(90000), mk(1, 'DNF'), mk(100000)], 3)).toBe(Infinity);
    expect(meanOf([mk(90000), mk(100000)], 3)).toBeNull();
  });
  it('Mo3 conta o +2', () => {
    expect(meanOf([mk(90000), mk(98000, '+2'), mk(100000)], 3)).toBe(96666.66666666667);
  });
  it('officialAverage usa Mo3 no 6×6 e Ao5 no 3×3', () => {
    const six = [mk(90000), mk(100000), mk(110000)];
    expect(officialAverage(six, '666')).toBe(100000);
    const three = [10, 20, 30, 40, 50].map((s) => mk(s * 1000, null, '333'));
    expect(officialAverage(three, '333')).toBe(30000);
  });
  it('rótulo da média oficial', () => {
    expect(officialAverageLabel('777')).toEqual({ n: 3, kind: 'mo' });
    expect(officialAverageLabel('sq1')).toEqual({ n: 5, kind: 'ao' });
  });
});
