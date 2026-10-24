import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { countOps, countRows, reserveMail, reserveRows, reserveStorage, rowsRoom, setStorage, storageUsed, takeOps } from '../../worker/budget';
import type { Env } from '../../worker/env';
import { MAX_DATA_CHARS } from '../../src/core/sync/shape';
import { ACCOUNT_BYTES_CAP, capOf, capsOf, COMPACT_PER_DAY, COPIES_CACHE_MS, DAILY_WRITE_BUDGET, nextUtcDay, RESTORES_PER_DAY, SESSION_PREPAY, STORAGE_HEADROOM, utcDay, utcMonth } from '../../worker/limits';

const at = (iso: string): number => Date.parse(iso);
const opsRow = async (month: string, cls: string) =>
  (await env.DB.prepare('SELECT count FROM r2_ops WHERE month = ? AND class = ?').bind(month, cls).first<{ count: number }>())?.count ?? 0;
const mailRow = async (period: string) => (await env.DB.prepare('SELECT count FROM mail_sent WHERE period = ?').bind(period).first<{ count: number }>())?.count ?? 0;
const rowsRow = async (day: string) => (await env.DB.prepare('SELECT count FROM rows_day WHERE day = ?').bind(day).first<{ count: number }>())?.count ?? 0;
const withLog = async <T>(run: () => Promise<T> | T): Promise<{ result: T; logged: string[] }> => {
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const result = await run();
    return { result, logged: out.mock.calls.flat().map(String) };
  } finally {
    out.mockRestore();
  }
};

describe('os tetos do Worker (spec 4, 7.1, 7.6)', () => {
  it('as constantes do Worker', () => {
    expect(DAILY_WRITE_BUDGET).toBe(20_000);
    expect(RESTORES_PER_DAY).toBe(3);
    expect(COPIES_CACHE_MS).toBe(600_000);
    expect(COMPACT_PER_DAY).toBe(1_000);
    expect(STORAGE_HEADROOM).toBe(0.95);
    expect(ACCOUNT_BYTES_CAP).toBe(50_000_000);
    expect(SESSION_PREPAY).toBe(3 * MAX_DATA_CHARS); // o maior data de uma sessão em UTF-8
  });

  it('o dia e o mês são em UTC, e o dia seguinte começa à meia-noite UTC', () => {
    const t = at('2026-10-31T23:59:59.999Z');
    expect([utcDay(t), utcMonth(t)]).toEqual(['2026-10-31', '2026-10']);
    expect(nextUtcDay(t)).toBe(at('2026-11-01T00:00:00.000Z'));
    expect(nextUtcDay(at('2026-11-01T00:00:00.000Z'))).toBe(at('2026-11-02T00:00:00.000Z'));
    expect([utcDay(at('2026-11-01T00:00:00.000Z')), utcMonth(at('2026-11-01T00:00:00.000Z'))]).toEqual(['2026-11-01', '2026-11']);
  });

  it('capsOf lê as nove vars como inteiros', () => {
    const e = {
      SNAPSHOT_BYTES_CAP: '256000000',
      R2_CLASS_A_MONTH: '50000',
      R2_CLASS_B_MONTH: '500000',
      MAIL_PER_DAY: '10',
      MAIL_PER_MONTH: '250',
      SNAPSHOT_MAX_RECORDS: '4747',
      RESTORE_MAX_RECORDS: '5000',
      ROWS_WRITTEN_DAY_CAP: '10000',
      ROWS_READ_DAY_CAP: '1000000',
    } as unknown as Env;
    expect(capsOf(e)).toEqual({
      snapshotBytes: 256_000_000,
      classAMonth: 50_000,
      classBMonth: 500_000,
      mailDay: 10,
      mailMonth: 250,
      snapshotRecords: 4_747,
      restoreRecords: 5_000,
      rowsDay: 10_000,
      readsDay: 1_000_000,
    });
  });

  it('uma var ausente, vazia ou torta ("1GB", "-5", "1.5") vale 0 e loga cap-missing', async () => {
    for (const bad of [undefined, '', ' ', '1GB', '-5', '1.5', '0', '1e3', '0x10', 'NaN', '10 ', '99999999999999999999']) {
      const e = { MAIL_PER_DAY: bad } as unknown as Env;
      const { result, logged } = await withLog(() => capOf(e, 'MAIL_PER_DAY'));
      expect(result, String(bad)).toBe(0);
      expect(logged, String(bad)).toEqual([JSON.stringify({ evt: 'cap-missing', name: 'MAIL_PER_DAY' })]);
    }
    const { result, logged } = await withLog(() => capsOf({ MAIL_PER_DAY: '10' } as unknown as Env));
    expect(result).toEqual({ snapshotBytes: 0, classAMonth: 0, classBMonth: 0, mailDay: 10, mailMonth: 0, snapshotRecords: 0, restoreRecords: 0, rowsDay: 0, readsDay: 0 });
    expect(logged.map((l) => (JSON.parse(l) as { name: string }).name).sort()).toEqual([
      'MAIL_PER_MONTH',
      'R2_CLASS_A_MONTH',
      'R2_CLASS_B_MONTH',
      'RESTORE_MAX_RECORDS',
      'ROWS_READ_DAY_CAP',
      'ROWS_WRITTEN_DAY_CAP',
      'SNAPSHOT_BYTES_CAP',
      'SNAPSHOT_MAX_RECORDS',
    ]);
    const ok = await withLog(() => capOf({ MAIL_PER_DAY: '10' } as unknown as Env, 'MAIL_PER_DAY'));
    expect(ok.logged).toEqual([]);
  });

  it('takeOps reserva até o teto e recusa sem contar; o mês seguinte (UTC) começa do zero', async () => {
    const oct = at('2026-10-15T12:00:00Z');
    expect(await takeOps(env.DB, 'A', 2, oct, 3)).toBe(true);
    expect(await takeOps(env.DB, 'A', 2, oct, 3)).toBe(false); // 4 > 3: recusa sem contar
    expect(await opsRow('2026-10', 'A')).toBe(2);
    expect(await takeOps(env.DB, 'A', 1, oct, 3)).toBe(true);
    expect(await takeOps(env.DB, 'A', 1, oct, 3)).toBe(false);
    expect(await opsRow('2026-10', 'A')).toBe(3);
    expect(await takeOps(env.DB, 'B', 3, oct, 3)).toBe(true); // a classe B tem a própria conta
    expect(await opsRow('2026-10', 'B')).toBe(3);
    expect(await takeOps(env.DB, 'A', 1, at('2026-10-31T23:59:59.999Z'), 3)).toBe(false); // ainda outubro
    expect(await takeOps(env.DB, 'A', 3, at('2026-11-01T00:00:00.000Z'), 3)).toBe(true); // novembro, do zero
    expect(await opsRow('2026-11', 'A')).toBe(3);
    expect(await opsRow('2026-10', 'A')).toBe(3);
  });

  it('takeOps com o teto 0 (falha fechada) ou um n torto nunca passa', async () => {
    const t = at('2027-01-10T00:00:00Z');
    expect(await takeOps(env.DB, 'A', 1, t, 0)).toBe(false);
    expect(await takeOps(env.DB, 'A', 1.5, t, 10)).toBe(false);
    expect(await takeOps(env.DB, 'A', -1, t, 10)).toBe(false);
    expect(await takeOps(env.DB, 'A', Number.NaN, t, 10)).toBe(false);
    expect(await opsRow('2027-01', 'A')).toBe(0);
  });

  it('takeOps em paralelo não passa do teto: reservar é um lote só', async () => {
    const t = at('2027-02-10T00:00:00Z');
    const results = await Promise.all(Array.from({ length: 25 }, () => takeOps(env.DB, 'B', 1, t, 7)));
    expect(results.filter(Boolean)).toHaveLength(7);
    expect(await opsRow('2027-02', 'B')).toBe(7);
  });

  it('countOps conta sem recusar, também além do teto', async () => {
    const t = at('2027-03-10T00:00:00Z');
    await countOps(env.DB, 'A', 4, t);
    await countOps(env.DB, 'A', 3, t);
    expect(await opsRow('2027-03', 'A')).toBe(7);
    expect(await takeOps(env.DB, 'A', 1, t, 5)).toBe(false); // o que já passou do teto continua valendo
    expect(await opsRow('2027-03', 'A')).toBe(7);
  });

  it('reserveStorage para em 95% do teto', async () => {
    await env.DB.prepare('DELETE FROM r2_storage').run();
    expect(await storageUsed(env.DB)).toBe(0);
    expect(await reserveStorage(env.DB, 900, 1_000, 1_000)).toBe(true);
    expect(await storageUsed(env.DB)).toBe(900);
    expect(await reserveStorage(env.DB, 51, 2_000, 1_000)).toBe(false); // 951 > 950
    expect(await storageUsed(env.DB)).toBe(900);
    expect(await reserveStorage(env.DB, 50, 3_000, 1_000)).toBe(true); // 950 cabe
    expect(await storageUsed(env.DB)).toBe(950);
    expect(await reserveStorage(env.DB, 1, 4_000, 1_000)).toBe(false);
    expect(await reserveStorage(env.DB, 1, 4_000, 0)).toBe(false); // teto 0: nada passa
    expect(await reserveStorage(env.DB, -1, 4_000, 1_000)).toBe(false);
    expect(await reserveStorage(env.DB, 1.5, 4_000, 1_000)).toBe(false);
  });

  it('setStorage troca o uso pelo recontado e guarda quando; a reserva seguinte parte dele', async () => {
    await env.DB.prepare('DELETE FROM r2_storage').run();
    await setStorage(env.DB, 400, 111);
    expect(await storageUsed(env.DB)).toBe(400);
    expect((await env.DB.prepare('SELECT counted_at AS at FROM r2_storage WHERE id = 1').first<{ at: number }>())?.at).toBe(111);
    await setStorage(env.DB, 100, 222);
    expect(await storageUsed(env.DB)).toBe(100);
    expect(await reserveStorage(env.DB, 850, 333, 1_000)).toBe(true);
    expect(await reserveStorage(env.DB, 1, 333, 1_000)).toBe(false);
    expect((await env.DB.prepare('SELECT counted_at AS at FROM r2_storage WHERE id = 1').first<{ at: number }>())?.at).toBe(222); // reservar não é recontar
  });

  it('reserveStorage em paralelo não passa do teto', async () => {
    await env.DB.prepare('DELETE FROM r2_storage').run();
    const results = await Promise.all(Array.from({ length: 20 }, (_, i) => reserveStorage(env.DB, 100, i, 1_000)));
    expect(results.filter(Boolean)).toHaveLength(9); // 9 × 100 = 900; o décimo daria 1000 > 950
    expect(await storageUsed(env.DB)).toBe(900);
  });

  it('reserveMail: o dia e o mês juntos; recusado, nenhum dos dois conta', async () => {
    const caps = { mailDay: 2, mailMonth: 3 };
    const [d1, d2] = [at('2027-04-10T10:00:00Z'), at('2027-04-11T10:00:00Z')];
    expect(await reserveMail(env.DB, d1, caps)).toBe(true);
    expect(await reserveMail(env.DB, d1, caps)).toBe(true);
    expect(await reserveMail(env.DB, d1, caps)).toBe(false); // o dia encheu, com o mês livre
    expect([await mailRow('d:2027-04-10'), await mailRow('m:2027-04')]).toEqual([2, 2]);
    expect(await reserveMail(env.DB, d2, caps)).toBe(true); // o dia seguinte tem vaga, e o mês fecha em 3
    expect(await reserveMail(env.DB, d2, caps)).toBe(false); // o mês encheu, com o dia livre
    expect([await mailRow('d:2027-04-10'), await mailRow('d:2027-04-11'), await mailRow('m:2027-04')]).toEqual([2, 1, 3]);
    expect(await reserveMail(env.DB, at('2027-05-01T00:00:00Z'), caps)).toBe(true); // maio, do zero
    expect([await mailRow('d:2027-05-01'), await mailRow('m:2027-05')]).toEqual([1, 1]);
  });

  it('reserveMail com um teto 0 (falha fechada) nunca passa, e em paralelo não passa do teto do dia nem do mês', async () => {
    const t = at('2027-06-10T10:00:00Z');
    expect(await reserveMail(env.DB, t, { mailDay: 0, mailMonth: 10 })).toBe(false);
    expect(await reserveMail(env.DB, t, { mailDay: 10, mailMonth: 0 })).toBe(false);
    expect([await mailRow('d:2027-06-10'), await mailRow('m:2027-06')]).toEqual([0, 0]);
    const day = await Promise.all(Array.from({ length: 20 }, () => reserveMail(env.DB, t, { mailDay: 6, mailMonth: 100 })));
    expect(day.filter(Boolean)).toHaveLength(6);
    expect([await mailRow('d:2027-06-10'), await mailRow('m:2027-06')]).toEqual([6, 6]);
    const t2 = at('2027-06-11T10:00:00Z');
    const month = await Promise.all(Array.from({ length: 20 }, () => reserveMail(env.DB, t2, { mailDay: 100, mailMonth: 10 })));
    expect(month.filter(Boolean)).toHaveLength(4); // 6 já usados no mês
    expect([await mailRow('d:2027-06-11'), await mailRow('m:2027-06')]).toEqual([4, 10]);
  });

  // O teto de linhas gravadas por dia do ambiente (account-store.ts, reserveDay): uma instrução só, o upsert com a condição dentro dele.
  it('reserveRows reserva até o teto numa instrução só e recusa sem somar; o dia seguinte (UTC) começa do zero', async () => {
    const day = at('2028-01-10T12:00:00Z');
    const seen = { prepare: 0, batch: 0 };
    const db = new Proxy(env.DB, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (typeof value !== 'function') return value;
        if (key === 'prepare' || key === 'batch') {
          return (...args: unknown[]) => {
            seen[key]++;
            return (value as (...a: unknown[]) => unknown).apply(target, args);
          };
        }
        return (value as (...a: unknown[]) => unknown).bind(target);
      },
    });
    expect(await reserveRows(db, 6, day, 10)).toBe(true); // a linha do dia nasce com 6
    expect(seen).toEqual({ prepare: 1, batch: 0 });
    expect(await reserveRows(db, 5, day, 10)).toBe(false); // 11 > 10: recusa sem somar
    expect(await rowsRow('2028-01-10')).toBe(6);
    expect(await reserveRows(db, 4, day, 10)).toBe(true); // 10 cabe
    expect(await reserveRows(db, 1, day, 10)).toBe(false);
    expect(await rowsRow('2028-01-10')).toBe(10);
    expect(seen).toEqual({ prepare: 4, batch: 0 });
    expect(await reserveRows(env.DB, 11, at('2028-01-11T00:00:00.000Z'), 10)).toBe(false); // mais que o teto: nem a linha nasce
    expect(await reserveRows(env.DB, 10, at('2028-01-11T00:00:00.000Z'), 10)).toBe(true); // o dia seguinte, do zero
    expect([await rowsRow('2028-01-10'), await rowsRow('2028-01-11')]).toEqual([10, 10]);
  });

  it('reserveRows com o teto 0 (falha fechada) ou um n torto nunca passa', async () => {
    const day = at('2028-02-10T12:00:00Z');
    expect(await reserveRows(env.DB, 1, day, 0)).toBe(false);
    expect(await reserveRows(env.DB, 1.5, day, 10)).toBe(false);
    expect(await reserveRows(env.DB, -1, day, 10)).toBe(false);
    expect(await reserveRows(env.DB, Number.NaN, day, 10)).toBe(false);
    expect(await reserveRows(env.DB, 1, day, Number.NaN)).toBe(false);
    expect(await rowsRow('2028-02-10')).toBe(0);
  });

  it('reserveRows em paralelo não passa do teto', async () => {
    const day = at('2028-03-10T12:00:00Z');
    const results = await Promise.all(Array.from({ length: 25 }, () => reserveRows(env.DB, 300, day, 2_000)));
    expect(results.filter(Boolean)).toHaveLength(6); // 6 × 300 = 1.800; a sétima daria 2.100
    expect(await rowsRow('2028-03-10')).toBe(1_800);
  });

  it('rowsRoom confere sem reservar: o dia mais `n` cabe no teto?', async () => {
    const day = at('2028-05-10T12:00:00Z');
    expect(await rowsRoom(env.DB, 10, day, 10)).toBe(true); // sem a linha do dia, o dia está vazio
    expect(await rowsRow('2028-05-10')).toBe(0); // e conferir não a cria
    expect(await reserveRows(env.DB, 6, day, 10)).toBe(true);
    expect(await rowsRoom(env.DB, 4, day, 10)).toBe(true);
    expect(await rowsRoom(env.DB, 5, day, 10)).toBe(false);
    expect(await rowsRow('2028-05-10')).toBe(6);
    expect(await rowsRoom(env.DB, 0, day, 0)).toBe(false); // teto 0: nada cabe
    expect(await rowsRoom(env.DB, 1.5, day, 10)).toBe(false);
  });

  it('countRows soma sem recusar, também além do teto: o que já foi gravado', async () => {
    const day = at('2028-04-10T12:00:00Z');
    expect(await reserveRows(env.DB, 8, day, 10)).toBe(true);
    await countRows(env.DB, 4, day);
    await countRows(env.DB, 0, day);
    expect(await rowsRow('2028-04-10')).toBe(12);
    expect(await reserveRows(env.DB, 1, day, 10)).toBe(false); // o que passou do teto continua valendo
    await countRows(env.DB, 3, at('2028-04-11T12:00:00Z')); // a linha do dia nasce aqui
    expect(await rowsRow('2028-04-11')).toBe(3);
  });
});
