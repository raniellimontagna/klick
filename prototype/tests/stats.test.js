import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  effectiveMs, formatMs, formatSolve, trimCount, averageOf, rollingAverages, bestSingle, bestAverage,
  stdDevMs, dayKey, currentStreak, solveDeltas, resultKind, monthHeat, milestoneProgress, achievedIds, pbFlags,
} from '../scripts/stats.js';
import { T } from '../scripts/strings.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
let id = 0;
const sv = (ms, penalty = null, at = NOW) => ({ id: ++id, ms, penalty, at, scramble: '', note: '', session: 's1' });

test('effectiveMs aplica +2 e DNF', () => {
  assert.equal(effectiveMs(sv(58420)), 58420);
  assert.equal(effectiveMs(sv(58420, '+2')), 60420);
  assert.equal(effectiveMs(sv(58420, 'DNF')), Infinity);
});

test('formatMs trunca no centésimo e trata vazio e DNF', () => {
  assert.equal(formatMs(58429), '0:58.42');
  assert.equal(formatMs(61005), '1:01.00');
  assert.equal(formatMs(Infinity), 'DNF');
  assert.equal(formatMs(null), '—');
  assert.equal(formatSolve(sv(58420, '+2')), '1:00.42+');
  assert.equal(formatSolve(sv(58420, 'DNF')), 'DNF');
});

test('trimCount segue a convenção de 5% arredondado para cima', () => {
  assert.deepEqual([5, 12, 50, 100].map(trimCount), [1, 1, 3, 5]);
});

test('averageOf descarta melhor e pior e arredonda para 10 ms', () => {
  const xs = [60000, 70000, 50000, 65000, 80000].map((ms) => sv(ms));
  assert.equal(averageOf(xs, 5), 65000);
  assert.equal(averageOf(xs.slice(0, 4), 5), null);
});

test('um DNF é descartado; dois DNFs tornam a média de 5 DNF', () => {
  const one = [sv(60000), sv(61000, 'DNF'), sv(62000), sv(63000), sv(64000)];
  assert.equal(averageOf(one, 5), 63000);
  const two = [sv(60000), sv(61000, 'DNF'), sv(62000, 'DNF'), sv(63000), sv(64000)];
  assert.equal(averageOf(two, 5), Infinity);
});

test('rollingAverages e bestAverage', () => {
  const xs = [70000, 60000, 65000, 62000, 61000, 90000].map((ms) => sv(ms));
  const r = rollingAverages(xs, 5);
  assert.deepEqual(r.slice(0, 4), [null, null, null, null]);
  assert.equal(r[4], 62670);
  assert.equal(r[5], 62670);
  assert.equal(bestAverage(xs, 5), 62670);
});

test('bestSingle ignora DNF e soma +2', () => {
  assert.equal(bestSingle([sv(50000, 'DNF'), sv(59000, '+2'), sv(60500)]), 60500);
  assert.equal(bestSingle([]), null);
});

test('stdDevMs ignora DNF e precisa de 2 valores', () => {
  assert.equal(stdDevMs([sv(60000)]), null);
  assert.equal(Math.round(stdDevMs([sv(60000), sv(62000), sv(64000), sv(1, 'DNF')])), 2000);
});

test('currentStreak conta dias seguidos até hoje ou ontem', () => {
  const xs = [sv(60000, null, NOW - 3 * DAY), sv(60000, null, NOW - 2 * DAY), sv(60000, null, NOW - DAY), sv(60000, null, NOW)];
  assert.equal(currentStreak(xs, NOW), 4);
  assert.equal(currentStreak(xs.slice(0, 3), NOW), 3);
  assert.equal(currentStreak([sv(60000, null, NOW - 5 * DAY)], NOW), 0);
  assert.equal(dayKey(NOW), '2026-10-08');
});

test('solveDeltas e resultKind: média pela sessão, recorde por todos os solves', () => {
  const all = [60000, 61000, 62000, 63000, 64000, 50000].map((ms) => sv(ms));
  const session = [70000, 71000, 72000, 73000, 74000].map((ms) => sv(ms));
  const d = solveDeltas(all, sv(71500), session);
  assert.equal(d.vsAo5, 71500 - 72000);
  assert.equal(d.vsPb, 71500 - 50000);
  assert.equal(d.isPb, false);
  assert.equal(resultKind(all, sv(71500), session), 'good');
  assert.equal(resultKind(all, sv(73000), session), 'slow');
});

test('solveDeltas e resultKind', () => {
  const hist = [62000, 63000, 61000, 64000, 60000].map((ms) => sv(ms));
  assert.deepEqual(solveDeltas(hist, sv(59000)), { vsAo5: 59000 - 62000, vsPb: -1000, isPb: true });
  assert.equal(resultKind(hist, sv(59000)), 'pb');
  assert.equal(resultKind(hist, sv(61500)), 'good');
  assert.equal(resultKind(hist, sv(70000)), 'slow');
  assert.equal(resultKind(hist, sv(50000, 'DNF')), 'dnf');
  assert.equal(resultKind(hist, sv(50000, '+2')), 'plus2');
  assert.equal(resultKind([], sv(80000)), 'good');
});

test('monthHeat marca níveis, hoje e o dia do recorde', () => {
  const xs = [
    ...Array.from({ length: 6 }, () => sv(70000, null, NOW - 2 * DAY)),
    sv(55000, null, NOW - DAY),
    ...Array.from({ length: 15 }, () => sv(68000, null, NOW)),
  ];
  const heat = monthHeat(xs, NOW);
  assert.equal(heat.length, 31);
  assert.equal(heat[5].level, 2);
  assert.equal(heat[6].level, 1);
  assert.equal(heat[6].pb, true);
  assert.equal(heat[7].level, 3);
  assert.equal(heat[7].today, true);
  assert.equal(heat[8].level, 0);
});

test('milestoneProgress reconhece os marcos e mostra o progresso', () => {
  const xs = [sv(130000, null, NOW - DAY), sv(119000, null, NOW - DAY), sv(89000, null, NOW)];
  const m = Object.fromEntries(milestoneProgress(xs, NOW).map((x) => [x.id, x]));
  assert.equal(m.first.achieved, true);
  assert.equal(m.sub2.achieved, true);
  assert.equal(m.sub130.achieved, true);
  assert.equal(m.sub1.achieved, false);
  assert.equal(m.sub1.progress, 'melhor 1:29.00');
  assert.equal(m.n100.progress, '3/100');
  assert.equal(m.streak7.progress, '2/7');
  assert.deepEqual(achievedIds(xs, NOW), ['first', 'sub2', 'sub130']);
});

test('streak7 exige sete dias seguidos', () => {
  const xs = Array.from({ length: 7 }, (_, i) => sv(70000, null, NOW - (6 - i) * DAY));
  assert.ok(achievedIds(xs, NOW).includes('streak7'));
  assert.ok(!achievedIds(xs.slice(1), NOW).includes('streak7'));
});

test('pbFlags marca só quem bateu o recorde da época', () => {
  const xs = [70000, 72000, 65000, 66000, 64000].map((ms) => sv(ms));
  assert.deepEqual(pbFlags(xs), [false, false, true, false, true]);
  assert.deepEqual(pbFlags([sv(60000), sv(50000, 'DNF'), sv(59000)]), [false, false, true]);
});

test('deltas e progressos vêm de strings.js e truncam no centésimo', () => {
  assert.equal(T.chips.vsAo5(-429), '▼ 0.42 s vs média de 5');
  assert.equal(T.coach.pbSingle(1999), 'Novo recorde — 1.99 s mais rápido. Vale lembrar o que funcionou.');
  assert.equal(T.progress.best('1:29.00'), 'melhor 1:29.00');
  assert.equal(T.progress.count(3, 100), '3/100');
});
