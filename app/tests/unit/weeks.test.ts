import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bestSingle } from '../../src/core/stats';
import { periodSummary, shiftWeeks, WEEKS, weekMean, weekRows, weekStart, type WeekRow } from '../../src/core/weeks';
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
    const pool = [...five(at(9, 14), 11000), ...five(at(9, 21), 11500)];
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
    const pool = [sv(10000, at(9, 14)), sv(10000, at(9, 14)), ...five(at(9, 21), 11000)]; // anterior com 2 tempos
    const rows = weekRows(pool, NOW);
    expect(rows[0]).toMatchObject({ mean: 11000, change: null });
    expect(rows[1]).toMatchObject({ mean: null, change: null });
    // igual é 0, não null
    expect(weekRows([...five(at(9, 14)), ...five(at(9, 21))], NOW)[0]!.change).toBe(0);
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

  it('weekRows não conta o solve depois de agora (relógio adiantado), como o resumo e o ano', () => {
    const pool = [...five(at(9, 20), 10000), sv(9000, NOW + 3_600_000), sv(9000, at(9, 23))];
    expect(weekRows(pool, NOW)).toEqual([{ start: at(9, 19, 0), current: true, count: 5, dnf: 0, mean: 10000, best: 10000, change: null }]);
    expect(weekRows([sv(9000, NOW + 1)], NOW)).toEqual([]);
  });

  // A lista vem em ordem, e só as últimas 13 semanas contam (a 13ª, para a comparação): weekRows corta o começo por busca binária. O
  // resultado é o da conta ingênua na lista inteira, semana a semana.
  it('weekRows na lista cortada dá o mesmo que a conta na lista inteira', () => {
    const naive = (pool: readonly Solve[], now: number): WeekRow[] => {
      const past = pool.filter((x) => x.at <= now);
      if (past.length === 0) return [];
      const firstWeek = weekStart(past[0]!.at);
      const of = (start: number) => past.filter((x) => x.at >= start && x.at < shiftWeeks(start, 1));
      const rows: WeekRow[] = [];
      for (let i = 0; i < WEEKS; i++) {
        const start = shiftWeeks(weekStart(now), -i);
        if (start < firstWeek) break;
        const solves = of(start);
        const mean = weekMean(solves);
        const prev = shiftWeeks(start, -1) < firstWeek ? null : weekMean(of(shiftWeeks(start, -1)));
        rows.push({ start, current: i === 0, count: solves.length, dnf: solves.filter((x) => x.penalty === 'DNF').length, mean, best: bestSingle(solves), change: mean !== null && prev !== null ? mean - prev : null });
      }
      return rows.some((r) => r.count > 0) ? rows : [];
    };
    // Dois anos de treino, com dias sem solve, DNF e +2, em ordem.
    let seed = 7;
    const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    const pool: Solve[] = [];
    for (let day = 0; day < 730; day++) {
      if (rand() < 0.35) continue;
      for (let k = 0, n = 1 + Math.floor(rand() * 8); k < n; k++) {
        const penalty = rand() < 0.05 ? 'DNF' : rand() < 0.05 ? '+2' : null;
        pool.push(sv(9000 + Math.floor(rand() * 6000), new Date(2025, 0, 1 + day, 8 + k).getTime(), penalty));
      }
    }
    for (const now of [NOW, at(5, 3, 7), at(0, 15), new Date(2025, 2, 10, 12).getTime(), new Date(2024, 11, 31).getTime(), new Date(2027, 6, 1).getTime()]) {
      expect(weekRows(pool, now), new Date(now).toISOString()).toEqual(naive(pool, now));
    }
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

// O horário de verão de Santiago começa no domingo 06/09/2026: a meia-noite não existe, e o relógio pula para 01:00. O domingo da virada é da
// semana de 31/08, e os cortes de dia ficam no começo do dia. O fuso troca só neste bloco (o Node relê process.env.TZ na hora).
describe('semanas no fuso de Santiago (o domingo 06/09/2026 começa à 01:00)', () => {
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Santiago';
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });
  const local = (m: number, d: number, h = 12, min = 0) => new Date(2026, m, d, h, min).getTime();

  it('os solves da segunda 31/08 e do domingo 06/09 contam 4 na mesma semana', () => {
    expect(new Date(local(8, 6, 0, 0)).getHours()).toBe(1); // a meia-noite da virada não existe
    const monday = local(7, 31, 0);
    expect(weekStart(local(8, 6, 10))).toBe(monday);
    expect(weekStart(local(8, 6, 23, 59))).toBe(monday);
    expect(weekStart(local(8, 7, 0))).toBe(local(8, 7, 0));
    const pool = [sv(10000, local(7, 31, 9)), sv(10000, local(7, 31, 20)), sv(10000, local(8, 6, 1, 30)), sv(10000, local(8, 6, 22))];
    // No próprio domingo e na semana seguinte.
    for (const now of [local(8, 6, 23), local(8, 9)]) {
      expect(weekRows(pool, now).find((r) => r.start === monday)?.count).toBe(4);
    }
  });

  it('periodSummary corta no começo do dia de 28 dias antes, mesmo no dia da virada', () => {
    const now = local(8, 6, 12);
    const recent = five(local(7, 10, 0, 30), 10000); // 10/08 00:30: o primeiro dos 28 dias
    const before = five(local(6, 13, 0, 30), 11000); // 13/07 00:30: o primeiro dos 28 anteriores
    expect(periodSummary([...before, ...recent], now)).toBe(-1000);
  });
});
