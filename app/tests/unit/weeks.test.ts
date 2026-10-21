import { describe, expect, it } from 'vitest';
import { periodSummary, WEEKS, weekMean, weekRows, weekStart } from '../../src/core/weeks';
import type { Solve } from '../../src/core/types';

// Datas locais (new Date(ano, mês, dia, hora)): o fuso é o do aparelho, como no código.
const at = (m: number, d: number, h = 12, min = 0) => new Date(2026, m, d, h, min).getTime();
const NOW = at(9, 21); // quarta, 21/10/2026
let id = 0;
const sv = (ms: number, when = NOW, penalty: Solve['penalty'] = null): Solve => ({
  id: String(++id), sessionId: 's1', event: '333', ms, penalty, at: when, scramble: '', note: '', createdAt: when, updatedAt: when, deletedAt: null,
});
// cinco tempos de 10 s (média 10000) em um dia
const five = (when: number, base = 10000) => [0, 1, 2, 3, 4].map(() => sv(base, when));

describe('semanas', () => {
  it('weekStart leva domingo 23:59 para a segunda anterior e segunda 00:00 para ela mesma', () => {
    expect(weekStart(at(9, 18, 23, 59))).toBe(at(9, 12, 0));
    expect(weekStart(at(9, 19, 0, 0))).toBe(at(9, 19, 0));
    expect(weekStart(at(9, 21))).toBe(at(9, 19, 0));
    expect(WEEKS).toBe(12);
  });

  it('weekMean tira os DNF antes do corte e pede 5', () => {
    const four = [10000, 11000, 12000, 13000].map((ms) => sv(ms));
    expect(weekMean([...four, sv(1, NOW, 'DNF'), sv(2, NOW, 'DNF')])).toBeNull();
    expect(weekMean([10000, 11000, 12000, 13000, 50000].map((ms) => sv(ms)))).toBe(12000);
    expect(weekMean([...[10000, 11000, 12000, 13000, 50000].map((ms) => sv(ms)), sv(1, NOW, 'DNF')])).toBe(12000);
  });

  it('weekRows: a semana atual primeiro, current, DNF à parte e melhor sem DNF', () => {
    const pool = [
      ...[10000, 11000, 12000, 13000, 50000].map((ms) => sv(ms, at(9, 13))), // semana de 12/10
      sv(9000, at(9, 20)), sv(8000, at(9, 20), 'DNF'), sv(7000, at(9, 21), '+2'),
    ];
    const rows = weekRows(pool, NOW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ start: at(9, 19, 0), current: true, count: 3, dnf: 1, mean: null, best: 9000 });
    expect(rows[1]).toMatchObject({ start: at(9, 12, 0), current: false, count: 5, dnf: 0, mean: 12000, best: 10000 });
  });

  it('semana só de DNF: count 3, dnf 3, mean e best null', () => {
    const rows = weekRows([sv(1, NOW, 'DNF'), sv(1, NOW, 'DNF'), sv(1, NOW, 'DNF')], NOW);
    expect(rows).toEqual([{ start: at(9, 19, 0), current: true, count: 3, dnf: 3, mean: null, best: null, change: null }]);
  });

  it('semana vazia no meio aparece com count 0; as de antes do primeiro solve não', () => {
    const rows = weekRows([sv(10000, at(9, 6)), sv(10000, at(9, 21))], NOW); // semanas de 05/10 e 19/10; a de 12/10 vazia
    expect(rows.map((r) => [r.start, r.count])).toEqual([[at(9, 19, 0), 1], [at(9, 12, 0), 0], [at(9, 5, 0), 1]]);
  });

  it('change compara com a semana anterior, inclusive a mais antiga com a 13ª', () => {
    const pool = [...five(at(9, 21), 11500), ...five(at(9, 14), 11000)];
    const rows = weekRows(pool, NOW);
    expect(rows[0]).toMatchObject({ mean: 11500, change: 500 }); // a atual contra a de 12/10
    expect(rows[1]).toMatchObject({ mean: 11000, change: null }); // a anterior a ela (05/10) está vazia
    // a mais antiga das 12 é a de 03/08; a 13ª (27/07) só entra na comparação
    const old = [...five(at(6, 28), 12000), ...five(at(7, 4), 11000)];
    const all = weekRows(old, NOW);
    expect(all).toHaveLength(12);
    expect(all.at(-1)).toMatchObject({ start: at(7, 3, 0), mean: 11000, change: -1000 });
    expect(all.some((r) => r.start === at(6, 27, 0))).toBe(false);
  });

  it('change null quando a anterior não tem média', () => {
    const pool = [...five(at(9, 21), 11000), ...[sv(10000, at(9, 14)), sv(10000, at(9, 14))]]; // anterior com 2 tempos
    const rows = weekRows(pool, NOW);
    expect(rows[0]).toMatchObject({ mean: 11000, change: null });
    expect(rows[1]).toMatchObject({ mean: null, change: null });
    // igual é 0, não null
    expect(weekRows([...five(at(9, 21)), ...five(at(9, 14))], NOW)[0]!.change).toBe(0);
  });

  it('a mais antiga não compara com a 13ª quando o primeiro solve é dela', () => {
    const rows = weekRows(five(at(7, 4), 11000), NOW); // primeira semana com solve: 03/08, a mais antiga das 12
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)).toMatchObject({ mean: 11000, change: null });
  });

  it('nenhum solve nas 12 semanas devolve []', () => {
    expect(weekRows([], NOW)).toEqual([]);
    expect(weekRows([sv(10000, at(0, 5))], NOW)).toEqual([]);
  });

  it('periodSummary: últimos 28 contra os 28 anteriores, null sem média num deles', () => {
    // hoje 21/10: os últimos 28 dias vão de 24/09 00:00 a agora; os 28 antes, de 27/08 00:00 a 23/09
    const recent = [...five(at(8, 24, 0, 0), 10000), ...five(at(9, 21), 10200)];
    const before = [...five(at(7, 27, 0, 0), 11000), ...five(at(8, 23, 23, 59), 11400)];
    const outside = five(at(7, 26, 23, 59), 99000); // um minuto antes do corte: fora
    expect(periodSummary([...outside, ...before, ...recent], NOW)).toBe(-1100); // 10100 contra 11200
    expect(periodSummary(recent, NOW)).toBeNull();
    expect(periodSummary(before, NOW)).toBeNull();
    expect(periodSummary([], NOW)).toBeNull();
  });
});
