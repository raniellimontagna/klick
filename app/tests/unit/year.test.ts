import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentStreak, dayKey } from '../../src/core/stats';
import type { Solve } from '../../src/core/types';
import { YEAR_WEEKS, yearCalendar } from '../../src/core/year';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const NOW = at(2026, 9, 21); // quarta, 21/10/2026
let id = 0;
const sv = (when: number, penalty: Solve['penalty'] = null): Solve => ({
  id: String(++id), sessionId: 's1', event: '333', ms: 10000, penalty, at: when, scramble: '', note: '', createdAt: when, updatedAt: when, deletedAt: null,
});
const many = (n: number, when: number) => Array.from({ length: n }, () => sv(when));
const cell = (cal: ReturnType<typeof yearCalendar>, key: string) => cal.weeks.flat().find((d) => dayKey(d.ts) === key)!;

describe('calendário do ano', () => {
  it('53 colunas de 7, a última é a semana de hoje, os dias depois de hoje são future', () => {
    const cal = yearCalendar([], NOW);
    expect(YEAR_WEEKS).toBe(53);
    expect(cal.weeks).toHaveLength(53);
    expect(cal.weeks.every((w) => w.length === 7)).toBe(true);
    const last = cal.weeks[52]!;
    expect(last.map((d) => dayKey(d.ts))).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(last.map((d) => d.future)).toEqual([false, false, false, true, true, true, true]);
    expect(last.map((d) => d.today)).toEqual([false, false, true, false, false, false, false]);
    expect(new Date(last[0]!.ts).getHours()).toBe(12);
  });

  it('periodDays é 367 em 21/10/2026 e start é a segunda 20/10/2025', () => {
    const cal = yearCalendar([], NOW);
    expect(cal.periodDays).toBe(367);
    expect(cal.start).toBe(at(2025, 9, 20, 0));
    expect(dayKey(cal.weeks[0]![0]!.ts)).toBe('2025-10-20');
    expect(cal.daysTrained).toBe(0);
    expect(cal.solves).toBe(0);
    expect(cal.current).toEqual({ days: 0, from: null, to: null });
    expect(cal.best).toEqual({ days: 0, from: null, to: null });
  });

  it('níveis 1–4, 5–14, 15+ e o anel de hoje', () => {
    const cal = yearCalendar([...many(1, at(2026, 9, 1)), ...many(4, at(2026, 9, 2)), ...many(5, at(2026, 9, 3)), ...many(14, at(2026, 9, 4)), ...many(15, at(2026, 9, 5))], NOW);
    expect(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map((k) => cell(cal, k).level)).toEqual([1, 1, 2, 2, 3, 0]);
    expect(cell(cal, '2026-10-05').count).toBe(15);
    expect(cal.weeks.flat().filter((d) => d.today)).toHaveLength(1);
    expect(cell(cal, '2026-10-21').today).toBe(true);
    expect(cal.daysTrained).toBe(5);
    expect(cal.solves).toBe(39);
  });

  it('current termina ontem quando hoje não tem solve, com from e to', () => {
    const cal = yearCalendar([sv(at(2026, 9, 17)), sv(at(2026, 9, 19)), sv(at(2026, 9, 20)), sv(at(2026, 9, 20, 8))], NOW);
    expect(cal.current).toEqual({ days: 2, from: at(2026, 9, 19), to: at(2026, 9, 20) });
    // com solve hoje, termina hoje
    const withToday = yearCalendar([sv(at(2026, 9, 20)), sv(NOW)], NOW);
    expect(withToday.current).toEqual({ days: 2, from: at(2026, 9, 20), to: at(2026, 9, 21) });
    // anteontem não basta
    expect(yearCalendar([sv(at(2026, 9, 19))], NOW).current).toEqual({ days: 0, from: null, to: null });
  });

  // A sequência atual do ano é a mesma do mapa do mês e do coach (currentStreak): as duas contas não podem divergir.
  it('current.days bate com currentStreak', () => {
    const days = (list: [number, number][]) => list.map(([m, d]) => sv(at(2026, m, d)));
    const cases = [
      [],
      days([[9, 21]]),
      days([[9, 20]]),
      days([[9, 19]]),
      days([[9, 17], [9, 19], [9, 20], [9, 21]]),
      days([[8, 28], [8, 29], [8, 30], [9, 1], [9, 2]]),
      Array.from({ length: 40 }, (_, i) => sv(at(2026, 8, 12 + i, 8))), // 12/09 a 21/10 seguidos
      [...days([[9, 20]]), sv(at(2026, 9, 22))], // um solve amanhã (relógio errado) não conta
    ];
    for (const solves of cases) {
      for (const now of [NOW, at(2026, 9, 21, 0), at(2026, 9, 21, 23)]) {
        expect(yearCalendar(solves, now).current.days, JSON.stringify(solves.map((x) => dayKey(x.at)))).toBe(currentStreak(solves, now));
      }
    }
  });

  it('best é a maior do histórico inteiro, a mais recente no empate', () => {
    const run = (y: number, m: number, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => sv(at(y, m, from + i)));
    // 5 dias em 2024 (fora da janela de 53 semanas), 3 e 5 em 2026: empate em 5, vale a de 2026
    const cal = yearCalendar([...run(2024, 2, 10, 14), ...run(2026, 2, 1, 3), ...run(2026, 5, 10, 14), sv(NOW)], NOW);
    expect(cal.best).toEqual({ days: 5, from: at(2026, 5, 10), to: at(2026, 5, 14) });
    expect(cal.current.days).toBe(1);
    const only = yearCalendar([...run(2024, 2, 10, 16), ...run(2026, 5, 10, 11)], NOW);
    expect(only.best).toEqual({ days: 7, from: at(2024, 2, 10), to: at(2024, 2, 16) });
    // a sequência passa pela virada de mês
    expect(yearCalendar(run(2026, 0, 30, 31).concat(run(2026, 1, 1, 2)), NOW).best.days).toBe(4);
  });

  it('months: um por mês tocado, com dias e solves', () => {
    const cal = yearCalendar([...many(2, at(2025, 9, 20)), sv(at(2025, 9, 30)), ...many(3, at(2026, 0, 5)), sv(at(2026, 9, 21)), sv(at(2025, 9, 10))], NOW);
    expect(cal.months).toHaveLength(13); // out/2025 a out/2026
    const labels = cal.months.map((m) => `${new Date(m.ts).getFullYear()}-${new Date(m.ts).getMonth() + 1}`);
    expect(labels[0]).toBe('2025-10');
    expect(labels[12]).toBe('2026-10');
    expect(cal.months[0]).toMatchObject({ days: 2, solves: 3 }); // o de 10/10/2025 é anterior ao start
    expect(cal.months[3]).toMatchObject({ days: 1, solves: 3 }); // jan/2026
    expect(cal.months[12]).toMatchObject({ days: 1, solves: 1 });
    expect(cal.months[5]).toMatchObject({ days: 0, solves: 0 });
    expect(cal.daysTrained).toBe(4);
    expect(cal.solves).toBe(7);
  });

  it('a mesma lista no mesmo dia devolve o mesmo objeto', () => {
    const list = [sv(NOW)];
    const a = yearCalendar(list, NOW);
    expect(yearCalendar(list, NOW + 3600_000)).toBe(a);
    expect(yearCalendar(list, at(2026, 9, 22))).not.toBe(a);
    expect(yearCalendar([...list], NOW)).not.toBe(a);
  });
});

// O horário de verão de Santiago começa no domingo 06/09/2026 (a meia-noite pula para 01:00): o domingo da virada fica no lugar dele, na
// coluna de 31/08. O fuso troca só neste bloco (o Node relê process.env.TZ na hora).
describe('o ano no fuso de Santiago (o domingo 06/09/2026 começa à 01:00)', () => {
  const tz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'America/Santiago';
  });
  afterAll(() => {
    if (tz === undefined) delete process.env.TZ;
    else process.env.TZ = tz;
  });

  it('a semana de 31/08 a 06/09 conta os 4 solves da segunda e do domingo', () => {
    const solves = [sv(at(2026, 7, 31, 9)), sv(at(2026, 7, 31, 20)), sv(new Date(2026, 8, 6, 1, 30).getTime()), sv(at(2026, 8, 6, 22))];
    for (const now of [at(2026, 8, 6, 23), at(2026, 8, 9)]) {
      const cal = yearCalendar(solves, now);
      const week = cal.weeks.find((w) => dayKey(w[0]!.ts) === '2026-08-31')!;
      expect(week.map((d) => dayKey(d.ts))).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']);
      expect(week.map((d) => d.count)).toEqual([2, 0, 0, 0, 0, 0, 2]);
      expect(cal.solves).toBe(4);
      expect(new Date(cal.start).getDay()).toBe(1);
      expect(new Date(cal.start).getHours()).toBe(0);
    }
  });
});
