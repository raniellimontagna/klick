import { describe, expect, it } from 'vitest';
import {
  achievedIds, averageOf, createMilestoneTracker, bestAverage, bestMean, bestSingle, currentStreak, dayKey, effectiveMs, formatMs, formatSolve,
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
    expect(d.vsAvg).toBe(71500 - 72000);
    expect(d.vsPb).toBe(71500 - 50000);
    expect(d.isPb).toBe(false);
    expect(resultKind(all, sv(71500), session)).toBe('good');
    expect(resultKind(all, sv(73000), session)).toBe('slow');
  });

  it('solveDeltas e resultKind', () => {
    const hist = [62000, 63000, 61000, 64000, 60000].map((ms) => sv(ms));
    expect(solveDeltas(hist, sv(59000))).toEqual({ vsAvg: 59000 - 62000, avgN: 5, vsPb: -1000, isPb: true });
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
    expect(T.chips.vsAvg(-429, 5)).toBe('▼ 0.42 s vs média de 5');
    expect(T.coach.pbSingle(1999)).toBe('Novo recorde — 1.99 s mais rápido. Vale lembrar o que funcionou.');
    expect(T.progress.best('1:29.00')).toBe('melhor 1:29.00');
    expect(T.progress.count(3, 100)).toBe('3/100');
  });
});

// O descarte de ceil(5%) de cada lado só se distingue com n maior que 5. Nestes dados, descartar outra quantidade dá
// outro valor, então um descarte errado não passa. Os tempos entram fora de ordem para o teste exigir a ordenação.
const rep = (ms: number, count: number): number[] => Array.from({ length: count }, () => ms);
// Ao12: 10 s, 40 s, nove de 60 s e 200 s. Sem o 10 s e o 200 s: (40 + 9 × 60) / 10 = 58 s. Com 2 de cada lado seriam 60 s; sem descarte, 65,83 s.
const AO12 = [10000, 60000, 200000, 60000, 60000, 40000, 60000, 60000, 60000, 60000, 60000, 60000];
// Ao100: cinco de 10 s, um de 40 s, 88 de 60 s, um de 70 s e cinco de 200 s. Sem 5 de cada lado: (40 + 88 × 60 + 70) / 90 = 59,89 s.
// Com 4 de cada lado seriam 60,87 s; com 6, 60 s.
const ordenados100 = [...rep(10000, 5), 40000, ...rep(60000, 88), 70000, ...rep(200000, 5)];
// 37 é primo com 100: i * 37 % 100 percorre 0..99 sem repetir, e o primeiro continua sendo um tempo de 10 s.
const AO100 = ordenados100.map((_, i) => ordenados100[(i * 37) % 100]);

describe('médias com descarte de 5%', () => {
  it('Ao12 descarta um tempo de cada lado', () => {
    expect(averageOf(AO12.map((ms) => sv(ms)), 12)).toBe(58000);
  });

  it('Ao100 descarta cinco tempos de cada lado', () => {
    expect(averageOf(AO100.map((ms) => sv(ms)), 100)).toBe(59890);
  });

  it('rollingAverages e bestAverage com n = 12: a janela desliza um solve por vez', () => {
    const xs = [...AO12, 90000].map((ms) => sv(ms));
    const r = rollingAverages(xs, 12);
    expect(r).toHaveLength(13);
    expect(r.slice(0, 11).every((v) => v === null)).toBe(true);
    expect(r[11]).toBe(58000);
    expect(r[12]).toBe(63000); // sai o 10 s, entra o 90 s; descartados 40 s e 200 s: (9 × 60 + 90) / 10
    expect(bestAverage(xs, 12)).toBe(58000);
  });

  it('rollingAverages e bestAverage com n = 100: a janela desliza um solve por vez', () => {
    const xs = [...AO100, 60000].map((ms) => sv(ms));
    const r = rollingAverages(xs, 100);
    expect(r).toHaveLength(101);
    expect(r.slice(0, 99).every((v) => v === null)).toBe(true);
    expect(r[99]).toBe(59890);
    expect(r[100]).toBe(60110); // sai um 10 s, entra um 60 s: (89 × 60 + 70) / 90
    expect(bestAverage(xs, 100)).toBe(59890);
  });

  it('um DNF no Ao12 é descartado como o pior; o segundo sobrevive ao descarte e a média vira DNF', () => {
    const one = AO12.map((ms) => sv(ms));
    one[2] = sv(200000, 'DNF'); // o 200 s vira DNF e continua sendo o pior
    expect(averageOf(one, 12)).toBe(58000);
    const two = [...one];
    two[3] = sv(60000, 'DNF');
    expect(averageOf(two, 12)).toBe(Infinity);
    expect(bestAverage(two, 12)).toBeNull(); // média DNF nunca é a melhor
  });

  it('lista só de DNF: a média e o Mo3 são DNF, e não há melhor single nem melhor média', () => {
    const dnfs = Array.from({ length: 5 }, () => sv(1, 'DNF'));
    expect(averageOf(dnfs, 5)).toBe(Infinity);
    expect(meanOf(dnfs, 3)).toBe(Infinity);
    expect(bestSingle(dnfs)).toBeNull();
    expect(bestAverage(dnfs, 5)).toBeNull();
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
    expect(meanOf([mk(90000), mk(98000, '+2'), mk(100000)], 3)).toBe(96670);
  });
  it('officialAverage usa Mo3 no 6×6 e Ao5 no 3×3', () => {
    const six = [mk(90000), mk(100000), mk(110000)];
    expect(officialAverage(six, '666')).toBe(100000);
    const three = [10, 20, 30, 40, 50].map((s) => mk(s * 1000, null, '333'));
    expect(officialAverage(three, '333')).toBe(30000);
  });
  it('rótulo da média oficial', () => {
    expect(officialAverageLabel('777')).toEqual({ n: 3, kind: 'mo' });
    expect(officialAverageLabel('333bf')).toEqual({ n: 3, kind: 'mo' });
    expect(officialAverageLabel('sq1')).toEqual({ n: 5, kind: 'ao' });
  });
  it('Mo3 arredonda ao centésimo, como a média de 5', () => {
    expect(meanOf([mk(60001), mk(60002), mk(60004)], 3)).toBe(60000); // 60002,33 vai para baixo
    expect(meanOf([mk(60007), mk(60008), mk(60009)], 3)).toBe(60010); // 60008 vai para cima
  });
  it('officialAverage no 6×6 é a média dos três últimos, não a mediana', () => {
    expect(officialAverage([mk(90000), mk(100000), mk(140000)], '666')).toBe(110000);
  });
  it('officialAverage é null sem solves suficientes para a média do evento', () => {
    expect(officialAverage([mk(90000), mk(100000)], '666')).toBeNull(); // o Mo3 pede 3
    expect(officialAverage([], '777')).toBeNull();
    const four = [10, 20, 30, 40].map((s) => mk(s * 1000, null, '333'));
    expect(officialAverage(four, '333')).toBeNull(); // o Ao5 pede 5
  });
});

describe('chip e anel pela média oficial do evento', () => {
  it('no 6×6 compara com o Mo3 da sessão, mesmo quando o Ao5 diria o contrário', () => {
    const session = [100000, 105000, 500000, 200000, 200000].map((ms) => mk(ms));
    const solve = mk(250000);
    expect(averageOf(session, 5)).toBe(168330); // pelo Ao5 o solve ficaria 81,67 s acima da média
    expect(solveDeltas(session, solve, session)).toEqual({ vsAvg: -50000, avgN: 3, vsPb: 150000, isPb: false }); // o Mo3 é 300 s
    expect(resultKind(session, solve, session)).toBe('good');
  });

  it('no 6×6 o anel já fica lento com três solves na sessão, sem esperar o Ao5', () => {
    const session = [100000, 100000, 100000].map((ms) => mk(ms));
    expect(solveDeltas(session, mk(150000), session)).toMatchObject({ vsAvg: 50000, avgN: 3 });
    expect(resultKind(session, mk(150000), session)).toBe('slow');
  });

  it('no 6×6 sem três solves, ou com DNF entre os três últimos, não há comparação com a média', () => {
    const two = [100000, 100000].map((ms) => mk(ms));
    expect(solveDeltas(two, mk(150000), two)).toMatchObject({ vsAvg: null, avgN: 3 });
    expect(resultKind(two, mk(150000), two)).toBe('good');
    const withDnf = [mk(100000), mk(1, 'DNF'), mk(100000)];
    expect(solveDeltas(withDnf, mk(150000), withDnf)).toMatchObject({ vsAvg: null, avgN: 3 });
  });

  it('igual à média não é lento: o anel fica bom', () => {
    const session = [100000, 100000, 100000].map((ms) => mk(ms));
    expect(solveDeltas(session, mk(100000), session)).toMatchObject({ vsAvg: 0, avgN: 3, isPb: false });
    expect(resultKind(session, mk(100000), session)).toBe('good');
  });

  it('no 3×3 continua pelo Ao5 da sessão', () => {
    const session = [70000, 71000, 72000, 73000, 74000].map((ms) => sv(ms));
    expect(solveDeltas(session, sv(71500), session)).toMatchObject({ vsAvg: 71500 - 72000, avgN: 5 });
    const four = session.slice(0, 4);
    expect(solveDeltas(four, sv(71500), four)).toMatchObject({ vsAvg: null, avgN: 5 });
  });

  it('o texto do chip leva o tamanho da média', () => {
    expect(T.chips.vsAvg(-50000, 3)).toBe('▼ 50.00 s vs média de 3');
    expect(T.chips.vsAvg(81670, 3)).toBe('▲ 81.67 s vs média de 3');
    expect(T.chips.vsAvg(-429, 5)).toBe('▼ 0.42 s vs média de 5');
  });
});

// Ao5 e Ao12 descartam; o Mo3 não. Por isso o melhor Mo3 não sai de bestAverage(s, 3), que daria a mediana de cada janela.
describe('bestMean: melhor média simples entre as janelas de n solves', () => {
  it('é a menor média entre todas as janelas seguidas', () => {
    // Janelas de 3: 100,00 s / 110,00 s / 103,33 s / 95,00 s.
    const xs = [90000, 100000, 110000, 120000, 80000, 85000].map((ms) => mk(ms));
    expect(bestMean(xs, 3)).toBe(95000);
    expect(bestMean(xs.slice(0, 4), 3)).toBe(100000);
  });

  it('com menos de n solves é null', () => {
    expect(bestMean([mk(90000), mk(100000)], 3)).toBeNull();
    expect(bestMean([], 3)).toBeNull();
  });

  it('janela com DNF vale Infinity e nunca é a melhor', () => {
    const dnf = mk(1, 'DNF');
    // Só a última janela é válida: as duas primeiras têm o DNF.
    expect(bestMean([mk(90000), dnf, mk(100000), mk(100000), mk(100000)], 3)).toBe(100000);
  });

  it('sem nenhuma janela válida é null, como bestAverage', () => {
    const dnf = () => mk(1, 'DNF');
    expect(bestMean([mk(90000), dnf(), mk(100000)], 3)).toBeNull();
    expect(bestMean([dnf(), dnf(), dnf(), dnf()], 3)).toBeNull();
    expect(bestAverage([dnf(), dnf(), dnf(), dnf(), dnf()], 5)).toBeNull();
  });

  it('conta o +2 e arredonda ao centésimo como meanOf', () => {
    expect(bestMean([mk(90000), mk(98000, '+2'), mk(100000)], 3)).toBe(96670); // 290000 / 3 = 96666,67
    expect(bestMean([mk(60001), mk(60002), mk(60004)], 3)).toBe(60000); // 60002,33 vai para baixo
    expect(bestMean([mk(60007), mk(60008), mk(60009)], 3)).toBe(60010); // 60008 vai para cima
  });

  it('é média simples: a mediana aparada de bestAverage(s, 3) daria outro valor', () => {
    // Janelas de 3: médias 235,00 s / 268,33 s / 300,00 s; medianas 105,00 s / 200,00 s / 200,00 s.
    const xs = [100000, 105000, 500000, 200000, 200000].map((ms) => mk(ms));
    expect(bestMean(xs, 3)).toBe(235000);
    expect(bestAverage(xs, 3)).toBe(105000);
  });

  it('serve a qualquer n e concorda com meanOf na última janela', () => {
    const xs = [70000, 60000, 65000, 62000, 61000, 90000].map((ms) => mk(ms));
    expect(bestMean(xs, 5)).toBe(Math.min(meanOf(xs.slice(0, 5), 5)!, meanOf(xs, 5)!));
    expect(bestMean(xs, 6)).toBe(meanOf(xs, 6));
    expect(bestMean(xs, 7)).toBeNull();
  });
});

// Os marcos percorrem o histórico inteiro. Um solve novo só acrescenta no fim: o rastreador continua a conta de onde parou, e
// qualquer outra mudança (editar ou excluir no meio) refaz do zero. O resultado tem de ser sempre o mesmo da conta inteira.
describe('marcos: conta que continua de onde parou', () => {
  const DAY_MS = 86_400_000;
  const BASE = new Date(2026, 0, 1, 12).getTime();
  // Um histórico que acende tudo: dias seguidos, tempos caindo de 2:10 até 0:50, alguns DNF e +2.
  const history = (n: number): Solve[] =>
    Array.from({ length: n }, (_, i) => {
      const penalty: Solve['penalty'] = i % 37 === 5 ? 'DNF' : i % 23 === 7 ? '+2' : null;
      return { ...sv(Math.max(50_000, 130_000 - i * 70), penalty, BASE + Math.floor(i / 150) * DAY_MS + i * 1000), id: `s${i}` };
    });

  it('solve a solve, o rastreador dá o mesmo que a conta inteira', () => {
    const all = history(1200);
    const tracker = createMilestoneTracker();
    for (const n of [1, 2, 5, 12, 99, 100, 101, 500, 999, 1000, 1200]) {
      expect(tracker.achieved(all.slice(0, n))).toEqual(achievedIds(all.slice(0, n), NOW));
    }
    expect(tracker.achieved(all)).toContain('n1000');
  });

  it('acrescentar no fim continua a conta; editar no meio refaz do zero', () => {
    const all = history(300);
    const tracker = createMilestoneTracker();
    tracker.achieved(all.slice(0, 200));
    expect(tracker.lastRun()).toBe('full');
    tracker.achieved(all.slice(0, 201));
    expect(tracker.lastRun()).toBe('appended');
    const edited = all.slice(0, 201);
    edited[50] = { ...edited[50], penalty: 'DNF' };
    expect(tracker.achieved(edited)).toEqual(achievedIds(edited, NOW));
    expect(tracker.lastRun()).toBe('full');
    const removed = edited.slice(0, 120);
    expect(tracker.achieved(removed)).toEqual(achievedIds(removed, NOW));
    expect(tracker.lastRun()).toBe('full');
  });

  it('a mesma lista não conta de novo', () => {
    const all = history(100);
    const tracker = createMilestoneTracker();
    tracker.achieved(all);
    tracker.achieved(all);
    expect(tracker.lastRun()).toBe('cached');
  });
});
