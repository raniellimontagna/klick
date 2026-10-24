// O teto de linhas gravadas por dia do ambiente (ROWS_WRITTEN_DAY_CAP; decisão 6 e o portão 11 do README): as 100 mil linhas gravadas por
// dia do grátis são da conta da Cloudflare inteira, e o teto soma as de todas as contas do Klick num dia UTC, no D1 (rows_day). Cada pedido
// que grava reserva antes exatamente as linhas dele, numa instrução do D1; nada fica guardado na memória do objeto. O teto é trocado só no
// objeto de cada conta (o env que ele lê; o vitest.worker.config.ts põe um que nunca enche), e o dia do D1 é semeado direto. Cada teste usa
// dias próprios, longe de T0 e de hoje, onde nenhum outro reserva; a compactação, que segue a hora de verdade, semeia o dia de hoje cheio
// para o teto pequeno do objeto dela.
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { TOMBSTONE_KEEP_MS, type ActiveCounts } from '../../src/core/sync/limits';
import { exportFromRecords } from '../../src/core/sync/snapshot';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, type Change, type SyncResponse } from '../../src/core/sync/types';
import type { Env } from '../../worker/env';
import { QUOTA_REASON } from '../../src/core/sync/limits';
import {
  BIG_COPY_EVERY_DAYS,
  COMPACT_PER_DAY,
  COMPACT_ROWS_SHARE,
  DAILY_WRITE_BUDGET,
  MAX_WRITES_PER_REQUEST,
  nextUtcDay,
  RECORDS_PER_DAY,
  recordsPerDay,
  REQUEST_ROWS,
  rowsOf,
  ROWS_PER_WRITE,
  ROWS_RETRY_MS,
  utcDay,
  utcMonth,
} from '../../worker/limits';
import { dayOf, gzipJson, snapshotKey } from '../../worker/snapshots';
import { call, postJson, setState, stateOf, stubOf, T0, testDeps } from './helpers';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const at = (k: number): number => Date.parse('2027-08-01T12:00:00Z') + k * DAY; // o meio de um dia UTC só deste arquivo

const solve = (id: string, o: Partial<Change> & { sessionId?: string } = {}): Change => ({
  store: 'solves',
  id,
  data: { sessionId: o.sessionId ?? 's1', event: '333', ms: 9000, penalty: null, at: T0, scramble: "R U R'", note: '', createdAt: T0 },
  updatedAt: o.updatedAt ?? T0,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? T0,
});
const session = (id = 's1', o: Partial<Change> = {}): Change => ({
  store: 'sessions', id, data: { name: 'Sessão', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0, ...o,
});
const practice = (id: string): Change => ({
  store: 'practice', id, data: { caseId: 'T', ms: 1000, ok: true, helped: false, at: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0,
});
const gone = (t: number) => ({ updatedAt: t, deletedAt: t, deletionStamp: t });
const many = (prefix: string, n: number): Change[] => Array.from({ length: n }, (_, i) => solve(`${prefix}${String(i).padStart(4, '0')}`));

async function sync(user: string, changes: Change[], o: { now: number; device?: string; cursor?: number }): Promise<SyncResponse> {
  const body = { v: SYNC_PROTOCOL, account: user, deviceId: o.device ?? 'd1', cursor: o.cursor ?? 0, clock: o.now, changes };
  const res = await call('/api/sync', postJson(body), { deps: testDeps({ user, now: () => o.now }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}
// O app de antes manda {}; o novo, { device: true }.
const restore = async (user: string, name: string, now: number, body: unknown = {}): Promise<{ status: number; body: unknown }> => {
  const res = await call(`/api/snapshots/${name}/restore`, postJson(body, { [ACCOUNT_HEADER]: user }), { deps: testDeps({ user, now: () => now }) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

// As linhas do teto no D1, no dia UTC de `t`: lidas e semeadas.
const dayRow = async (t: number): Promise<number> =>
  (await env.DB.prepare('SELECT count FROM rows_day WHERE day = ?').bind(utcDay(t)).first<{ count: number }>())?.count ?? 0;
const seedDay = (t: number, count: number) =>
  env.DB.prepare('INSERT INTO rows_day (day, count) VALUES (?1, ?2) ON CONFLICT (day) DO UPDATE SET count = excluded.count').bind(utcDay(t), count).run();

// O teto trocado só no objeto da conta de `user` (o env que ele lê): undefined tira a var.
async function setCap(user: string, cap: string | undefined): Promise<void> {
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { env: Env };
    o.env = { ...o.env, ROWS_WRITTEN_DAY_CAP: cap } as Env;
  });
}

// As instruções do objeto de `user` ao D1 que tocam o dia do teto (rows_day), contadas: ele passa a usar um D1 que conta e segue para o de
// verdade.
async function countDay(user: string): Promise<{ n: number }> {
  const seen = { n: 0 };
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { env: Env };
    const counted = new Proxy(o.env.DB, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key !== 'prepare') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        return (query: string) => {
          if (query.includes('rows_day')) seen.n++;
          return target.prepare(query);
        };
      },
    });
    o.env = { ...o.env, DB: counted };
  });
  return seen;
}

// O D1 do objeto de `user` passa a falhar nas instruções do dia do teto (rows_day), como um D1 fora do ar; as outras seguem. Cada tentativa
// é contada.
async function failDay(user: string, fails: (query: string) => boolean = (q) => q.includes('rows_day')): Promise<{ n: number }> {
  const tried = { n: 0 };
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { env: Env };
    const failing = new Proxy(o.env.DB, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key !== 'prepare') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        return (query: string) => {
          if (!fails(query)) return target.prepare(query);
          tried.n++;
          throw new Error('D1_ERROR: Network connection lost.');
        };
      },
    });
    o.env = { ...o.env, DB: failing };
  });
  return tried;
}

// O conteúdo gravado de um registro do objeto de `user`.
const dataOf = (user: string, id: string): Promise<string> =>
  runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ data: string }>('SELECT data FROM records WHERE id = ?', id).one().data);

// As chamadas ao R2 do objeto da conta, contadas por método (list, get, head, put).
async function countR2(user: string): Promise<Record<string, number>> {
  const calls: Record<string, number> = {};
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { env: Env };
    const counted = new Proxy(o.env.SNAPSHOTS, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          calls[String(key)] = (calls[String(key)] ?? 0) + 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    o.env = { ...o.env, SNAPSHOTS: counted };
  });
  return calls;
}

// Os logs de uma chamada, os que são JSON, lidos.
async function logsOf<T>(run: () => Promise<T>): Promise<{ result: T; logged: unknown[] }> {
  const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  try {
    const result = await run();
    return { result, logged: out.mock.calls.flat().flatMap((l) => (String(l).startsWith('{') ? [JSON.parse(String(l)) as unknown] : [])) };
  } finally {
    out.mockRestore();
  }
}

const json = async <T>(user: string, key: string): Promise<T> => JSON.parse((await stateOf(user, key)) ?? 'null') as T;
const recordsOf = (user: string) =>
  runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec('SELECT store, id, data, deleted_at, rev FROM records ORDER BY store, id').toArray());

// N solves ativos na sessão `sid`, direto no SQLite do objeto (uma sessão grande sem pedidos, e sem reservar nada), com as revisões e os
// contadores.
async function seedSolves(user: string, sid: string, n: number): Promise<void> {
  const data = JSON.stringify(solve('x', { sessionId: sid }).data);
  await runInDurableObject(stubOf(user), (_o, state) => {
    const sql = state.storage.sql;
    const read = (key: string) => sql.exec<{ value: string }>('SELECT value FROM state WHERE key = ?', key).toArray()[0]?.value ?? null;
    const set = (key: string, value: string) => sql.exec('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
    const rev = Number(read('rev') ?? '0');
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) SELECT 'solves', 'x' || i, ?, ?, NULL, ?, ? + i, ? FROM n`,
      n, data, T0, T0, rev, sid,
    );
    set('rev', String(rev + n));
    const active = JSON.parse(read('active') ?? '{"solves":0,"sessions":0,"practice":0}') as ActiveCounts;
    set('active', JSON.stringify({ ...active, solves: active.solves + n }));
    set('bytes', String(Number(read('bytes') ?? '0') + n * new TextEncoder().encode(data).byteLength));
  });
}

describe('o teto de linhas gravadas por dia do ambiente', () => {
  it('soma as contas: a primeira grava, a segunda fica para amanhã (retryAt à meia-noite UTC), a página dela volta, e nada se perde', async () => {
    const now = at(1);
    const [first, second] = ['teto-soma-a', 'teto-soma-b'];
    await sync(second, [session(), solve('b1')], { now: now - DAY }); // a conta que fica sem linhas já tem o que receber
    const cap = rowsOf(MAX_WRITES_PER_REQUEST); // o dia inteiro cabe no pedido da primeira
    for (const user of [first, second]) await setCap(user, String(cap));
    const a = await sync(first, many('a', MAX_WRITES_PER_REQUEST), { now });
    expect([a.accepted, a.rejected, a.deferred, a.retryAt]).toEqual([MAX_WRITES_PER_REQUEST, [], undefined, undefined]);
    expect(await dayRow(now)).toBe(cap); // exatamente as linhas do pedido
    const before = await json(second, 'writes');
    const { result: b, logged } = await logsOf(() => sync(second, [solve('b2')], { now, device: 'd2' }));
    expect([b.accepted, b.rejected, b.deferred, b.retryAt]).toEqual([0, [], 1, nextUtcDay(now)]);
    expect(b.changes.map((c) => c.id)).toEqual(['s1', 'b1']); // o recebimento segue
    expect(logged).toContainEqual({ evt: 'rows-cap', user: second, op: 'sync', rows: rowsOf(1) });
    expect(logged).toContainEqual(expect.objectContaining({ evt: 'sync', user: second, pushed: 1, deferred: 1 }));
    expect(await dayRow(now)).toBe(cap); // recusado, nada somado
    expect(await json(second, 'writes')).toEqual(before); // nem no orçamento da conta
    // No dia seguinte (UTC), o aparelho manda o que esperou, e passa.
    const next = await sync(second, [solve('b2')], { now: nextUtcDay(now), device: 'd2', cursor: b.cursor });
    expect([next.accepted, next.rejected, next.deferred]).toEqual([1, [], undefined]);
    expect(next.changes.map((c) => c.id)).toEqual(['b2']);
    expect(await dayRow(nextUtcDay(now))).toBe(rowsOf(1));
  });

  it('uma reserva por pedido que grava, com exatamente as linhas dele; nenhuma para o que só recebe', async () => {
    const now = at(4);
    const user = 'teto-exato';
    const statements = await countDay(user);
    const sizes = [1, 7, 20, 3, MAX_WRITES_PER_REQUEST, 2];
    for (const [i, n] of sizes.entries()) await sync(user, many(`p${i}-`, n), { now });
    const rows = sizes.reduce((sum, n) => sum + rowsOf(n), 0);
    expect(statements.n).toBe(sizes.length);
    expect(await dayRow(now)).toBe(rows);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(now), n: rows }); // rowsOf, o mesmo número nos dois
    for (let i = 0; i < 3; i++) await sync(user, [], { now, cursor: i }); // só recebe, com a linha do aparelho fresca
    expect([statements.n, await dayRow(now)]).toEqual([sizes.length, rows]);
  });

  it('a exclusão de uma sessão reserva de uma vez as linhas da cascata inteira', async () => {
    const now = at(6);
    const user = 'teto-cascata';
    await sync(user, [session()], { now: now - DAY });
    await seedSolves(user, 's1', 600);
    const statements = await countDay(user);
    const res = await sync(user, [session('s1', gone(T0 + 10))], { now }); // a cascata grava a sessão e os 600 solves
    expect([res.accepted, res.rejected, res.deferred]).toEqual([1, [], undefined]);
    expect([statements.n, await dayRow(now)]).toEqual([1, rowsOf(601)]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(now), n: rowsOf(601) });
  });

  it('com pouco espaço no dia, o pedido que cabe passa e o seguinte, que não cabe, fica para amanhã', async () => {
    const now = at(8);
    const user = 'teto-sobra';
    const cap = 10_000;
    await setCap(user, String(cap));
    await seedDay(now, cap - rowsOf(10) - 1); // cabem as linhas de 10 solves, e sobra 1
    const fits = await sync(user, many('s', 10), { now });
    expect([fits.accepted, fits.deferred]).toEqual([10, undefined]);
    expect(await dayRow(now)).toBe(cap - 1);
    const over = await sync(user, many('t', 1), { now });
    expect([over.accepted, over.deferred, over.retryAt]).toEqual([0, 1, nextUtcDay(now)]);
    expect(await dayRow(now)).toBe(cap - 1);
  });

  // No mesmo dia, o D1 só sobe: o que ele recusou ele recusa de novo. Sem voltar a ele, uma conta que insiste não martela o D1 nem enche o
  // log; um pedido menor ainda pergunta.
  it('recusado no dia, o mesmo pedido (ou maior) não volta ao D1 nem ao log; um menor ainda pergunta', async () => {
    const now = at(9);
    const user = 'teto-recusa-lembrada';
    const cap = 10_000;
    await setCap(user, String(cap));
    await seedDay(now, cap - REQUEST_ROWS); // cabem as linhas do estado de um aparelho, não as de um solve
    await runInDurableObject(stubOf(user), (_o, state) => {
      state.storage.sql.exec('INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?)', 'd1', now); // o d1, com a linha fresca
    });
    const statements = await countDay(user);
    const { result: first, logged } = await logsOf(async () => [await sync(user, many('a', 1), { now }), await sync(user, many('b', 2), { now })]);
    expect(first.map((r) => [r.accepted, r.deferred])).toEqual([[0, 1], [0, 2]]);
    expect(statements.n).toBe(1); // só o primeiro pergunta
    expect(logged.filter((l) => (l as { evt?: string }).evt === 'rows-cap')).toEqual([{ evt: 'rows-cap', user, op: 'sync', rows: rowsOf(1) }]);
    await sync(user, [], { now, device: 'd2' }); // o aparelho novo pede menos que o recusado: pergunta, e cabe
    expect([statements.n, await dayRow(now)]).toEqual([2, cap]);
    const devices = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ id: string }>('SELECT device_id AS id FROM devices ORDER BY id').toArray());
    expect(devices.map((d) => d.id)).toEqual(['d1', 'd2']);
  });

  // O que o corte não prevê (account-store.ts, cut): a sessão apagada que a cascata devolve grava uma linha a mais que o reservado. Ela já
  // está gravada: o teto a conta depois, sem recusar, e fica com o mesmo número que o orçamento da conta.
  it('o que a cascata grava além do reservado conta no teto depois, o mesmo número do orçamento da conta', async () => {
    const now = at(10);
    const user = 'teto-devolve';
    const cap = 10_000;
    await sync(user, [session()], { now: now - DAY });
    await sync(user, [session('s1', gone(T0 + 10))], { now: now - DAY });
    await setCap(user, String(cap));
    await seedDay(now, cap - rowsOf(1)); // só a reserva do que o corte prevê: um solve
    const res = await sync(user, [solve('n', { updatedAt: T0 + 20, deletionStamp: T0 + 20 })], { now }); // devolve a sessão
    expect([res.accepted, res.rejected, res.deferred]).toEqual([1, [], undefined]);
    expect(res.changes.find((c) => c.id === 's1')?.deletedAt).toBeNull();
    expect(await json(user, 'writes')).toEqual({ day: utcDay(now), n: rowsOf(2) });
    expect(await dayRow(now)).toBe(cap - rowsOf(1) + rowsOf(2));
  });

  it('a var ausente, vazia ou torta vale 0 (falha fechada): nada é gravado, e o lote fica para amanhã', async () => {
    const now = at(12);
    for (const [i, bad] of [undefined, '', '0', '1e5', '-5', 'muitas'].entries()) {
      const user = `teto-torto-${i}`;
      await setCap(user, bad);
      const { result: res, logged } = await logsOf(() => sync(user, [session()], { now }));
      expect([res.accepted, res.deferred, res.retryAt], String(bad)).toEqual([0, 1, nextUtcDay(now)]);
      expect(logged, String(bad)).toContainEqual({ evt: 'cap-missing', name: 'ROWS_WRITTEN_DAY_CAP' });
      expect(await recordsOf(user)).toEqual([]);
    }
    expect(await dayRow(now)).toBe(0);
  });

  it('um sync que só recebe, sem linhas no teto, devolve a página sem perguntar ao D1; o aparelho novo fica para depois', async () => {
    const midnight = Date.parse(utcDay(at(14)));
    const user = 'teto-so-recebe';
    await sync(user, [session(), solve('a')], { now: midnight - 10 * 60_000 }); // no dia de antes, com o aparelho d1
    await setCap(user, '1000');
    await seedDay(midnight, 1000);
    const statements = await countDay(user);
    const fresh = await sync(user, [], { now: midnight + 10 * 60_000 }); // a linha do d1 tem 20 minutos: nada a gravar
    expect(fresh.changes.map((c) => c.id)).toEqual(['s1', 'a']);
    expect(statements.n).toBe(0);
    const writes = await json(user, 'writes');
    const newcomer = await sync(user, [], { now: midnight + 11 * 60_000, device: 'd9' }); // o aparelho novo pediria as linhas do estado
    expect(newcomer.changes.map((c) => c.id)).toEqual(['s1', 'a']);
    const devices = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ id: string }>('SELECT device_id AS id FROM devices').toArray());
    expect(devices.map((d) => d.id)).toEqual(['d1']);
    expect(await json(user, 'writes')).toEqual(writes);
    expect(await dayRow(midnight)).toBe(1000);
  });

  it('a compactação do alarme fica para outro dia sem linhas no teto; a cópia do dia sai do mesmo jeito', async () => {
    const user = 'teto-compacta';
    const old = Date.now() - TOMBSTONE_KEEP_MS - HOUR;
    // Antes de hoje: o dia do teto é o do orçamento da conta, que nunca volta atrás, e um sync num dia à frente levaria a compactação para ele.
    await sync(user, [session(), solve('velho', gone(old)), solve('vivo')], { now: Date.now() - 2 * DAY });
    await setCap(user, '1000');
    await seedDay(Date.now(), 1000); // o alarme segue a hora de verdade
    // Com o teto de 1.000 linhas, o dia útil é 0 e toda conta é grande: a última cópia foi há muito tempo, e a de hoje é a vez dela (I5 c).
    await setState(user, 'lastSnapshotDay', dayOf(Date.now() - 2 * BIG_COPY_EVERY_DAYS * DAY));
    const writes = await stateOf(user, 'writes');
    const { result, logged } = await logsOf(() => runDurableObjectAlarm(stubOf(user)));
    expect(result).toBe(true);
    const velho = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ data: string }>("SELECT data FROM records WHERE id = 'velho'").one().data);
    expect(velho).not.toBe('{}');
    expect(await stateOf(user, 'writes')).toBe(writes);
    expect(logged).toContainEqual({ evt: 'rows-cap', user, op: 'compact', rows: rowsOf(0, 1) });
    expect(await env.SNAPSHOTS.head(snapshotKey(user, dayOf(Date.now())))).not.toBeNull();
  });

  // A restauração grava só o que muda (spec das cópias grandes, seção 3), e as mudanças só se sabem depois de ler a cópia: a conferência das
  // linhas do teto vem depois do get, só lendo o D1, e a recusa não guarda a cópia de antes, não grava e não reserva nada.
  it('a restauração sem linhas no teto para as mudanças dela volta write-budget depois de ler a cópia, sem gravar nem reservar nada', async () => {
    const now = at(18);
    const user = 'teto-restaura';
    await sync(user, [session(), solve('a'), solve('b')], { now: now - DAY });
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(now - DAY)), await gzipJson(exportFromRecords([session()], now - DAY)));
    await setCap(user, '10000'); // o do beta, e o dia está cheio
    await seedDay(now, 10_000);
    const before = await recordsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(now - DAY), now)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(r2).toEqual({ get: 1 }); // a cópia (a e b vão para a lixeira); nem a cópia de antes
    const opsB = await env.DB.prepare("SELECT count FROM r2_ops WHERE month = ? AND class = 'B'").bind(utcMonth(now)).first<{ count: number }>();
    expect(opsB?.count ?? 0).toBe(2);
    expect(await json(user, 'attempts')).toEqual({ day: utcDay(now), n: 1 });
    expect(await recordsOf(user)).toEqual(before);
    expect(await dayRow(now)).toBe(10_000);
  });

  it('a restauração que só sabe o tamanho depois de ler a cópia: sem linhas para ela, write-budget antes de gravar qualquer coisa', async () => {
    const now = at(20);
    const user = 'teto-restaura-depois';
    await sync(user, [session(), solve('a')], { now: now - DAY });
    const name = dayOf(now - DAY);
    await env.SNAPSHOTS.put(snapshotKey(user, name), await gzipJson(exportFromRecords([session(), ...many('c', 40)], now - DAY)));
    await setCap(user, '10000');
    await seedDay(now, 10_000 - rowsOf(2) - 10); // cabe uma restauração pequena; as 41 mudanças (os 40 da cópia e o a), não
    const before = await recordsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, name, now)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(r2).toEqual({ get: 1 }); // leu a cópia; nem a cópia de antes, nem nada gravado
    expect(await recordsOf(user)).toEqual(before);
    expect(await dayRow(now)).toBe(10_000 - rowsOf(2) - 10); // a conferência de antes do R2 só lê: nada ficou reservado
  });

  it('apagar a conta não passa pelo teto: com ele em 0, apaga', async () => {
    const user = 'teto-apaga';
    await sync(user, [session(), solve('a')], { now: at(22) });
    await setCap(user, '0');
    const res = await call(
      '/api/account',
      { method: 'DELETE', headers: { 'Content-Type': 'application/json', [ACCOUNT_HEADER]: user }, body: JSON.stringify({ email: `${user}@exemplo.com` }) },
      { deps: testDeps({ user, now: () => at(22) }) },
    );
    expect(res.status).toBe(204);
    expect(await stateOf(user, 'deleted')).toBe('1');
    expect(await recordsOf(user)).toEqual([]);
  });
});

// O dia útil de um pedido (rodada 1 do teto): a exclusão de uma sessão cuja cascata não caberia num dia inteiro volta com "cota" (o aparelho
// a guarda, e Enviar de novo a manda) em vez de esperar um dia que nunca chega. O dia é o menor entre o orçamento da conta e o teto do
// ambiente, menos a folga da compactação do alarme: no beta, 2.247 registros; na raiz, os 4.747 do orçamento da conta.
describe('o dia útil: o menor dos dois tetos', () => {
  const BETA = 10_000; // o teto do beta (wrangler.jsonc; tests/unit/wrangler-config.test.ts)

  it('recordsPerDay: o orçamento da conta ou o teto do ambiente, o menor, menos a folga do alarme', () => {
    expect(recordsPerDay(BETA)).toBe(2_247);
    expect(recordsPerDay(60_000)).toBe(RECORDS_PER_DAY);
    expect(RECORDS_PER_DAY).toBe(recordsPerDay(DAILY_WRITE_BUDGET));
    expect(rowsOf(recordsPerDay(BETA)) + rowsOf(0, COMPACT_PER_DAY)).toBeLessThanOrEqual(BETA);
    expect(rowsOf(recordsPerDay(BETA) + 1) + rowsOf(0, COMPACT_PER_DAY)).toBeGreaterThan(BETA);
    expect(ROWS_PER_WRITE * recordsPerDay(BETA)).toBeLessThan(BETA);
    // A var torta (o teto 0): nada cabe de qualquer jeito, e tudo fica para depois; a regra fica a da conta, e não devolve "cota".
    expect(recordsPerDay(0)).toBe(RECORDS_PER_DAY);
  });

  it('no teto do beta, a exclusão acima do dia útil volta com "cota" e não fica para amanhã; uma no limite passa num dia novo', async () => {
    const most = recordsPerDay(BETA);
    const now = at(30);
    const big = 'teto-dia-util-grande';
    await sync(big, [session()], { now: now - DAY });
    await seedSolves(big, 's1', most); // a sessão e os solves: most + 1 registros na cascata
    await setCap(big, String(BETA));
    const before = await recordsOf(big);
    const res = await sync(big, [session('s1', gone(T0 + 10)), practice('depois')], { now });
    expect([res.accepted, res.rejected, res.deferred, res.retryAt]).toEqual([1, [{ store: 'sessions', id: 's1', reason: QUOTA_REASON }], undefined, undefined]);
    expect((await recordsOf(big)).filter((r) => r.store !== 'practice')).toEqual(before); // nem a sessão nem os solves dela
    expect(await dayRow(now)).toBe(rowsOf(1)); // só a tentativa

    const edge = 'teto-dia-util-limite';
    const fresh = at(32);
    await sync(edge, [session()], { now: fresh - DAY });
    await seedSolves(edge, 's1', most - 1); // most registros na cascata
    await setCap(edge, String(BETA));
    const day = await sync(edge, [session('s1', gone(T0 + 10))], { now: fresh });
    expect([day.accepted, day.rejected, day.deferred]).toEqual([1, [], undefined]);
    expect(await dayRow(fresh)).toBe(rowsOf(most));
    expect((await json<ActiveCounts>(edge, 'active')).solves).toBe(0);
  });

  it('no teto do beta, a restauração com mais mudanças que o dia útil é too-big, sem gravar nada; com o dia útil, passa', async () => {
    const most = recordsPerDay(BETA);
    const now = at(34);
    const user = 'teto-dia-util-restaura';
    await sync(user, [session()], { now: now - DAY });
    await seedSolves(user, 's1', most + 1); // a cópia só tem a sessão: most + 1 solves vão para a lixeira
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(now - DAY)), await gzipJson(exportFromRecords([session()], now - DAY)));
    await setCap(user, String(BETA));
    const before = await recordsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(now - DAY), now)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2).toEqual({ get: 1 }); // a cópia foi lida: decidiram as mudanças, não o tamanho da conta
    expect(await recordsOf(user)).toEqual(before);
    expect(await dayRow(now)).toBe(0);
    // Um solve a menos: most mudanças, que cabem no dia do beta.
    await runInDurableObject(stubOf(user), (_o, state) => {
      state.storage.sql.exec("DELETE FROM records WHERE store = 'solves' AND id = 'x1'");
    });
    expect((await restore(user, dayOf(now - DAY), now + 1000)).status).toBe(204);
    expect(await dayRow(now)).toBe(rowsOf(most));
  });
});

// A revisão do teto: o que não pode gastar o dia à toa, e o que não pode parar por ele.
describe('o teto do ambiente: a revisão', () => {
  it('as constantes', () => {
    expect([ROWS_RETRY_MS, COMPACT_ROWS_SHARE]).toEqual([300_000, 0.5]);
  });

  // A restauração só reserva as linhas dela logo antes de gravar, depois da cópia "antes de restaurar": a cópia recusada (ou um R2 que
  // falha nela) não gasta o dia do ambiente, que no beta caberia quase inteiro numa restauração grande.
  it('a cópia de antes recusada (no-room) ou um put que falha não gastam linhas do teto', async () => {
    const now = at(36);
    const user = 'teto-restaura-no-fim';
    await sync(user, [session(), solve('a'), solve('b')], { now: now - DAY });
    const name = dayOf(now - DAY);
    await env.SNAPSHOTS.put(snapshotKey(user, name), await gzipJson(exportFromRecords([session(), ...many('c', 5)], now - DAY)));
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { env: Env };
      o.env = { ...o.env, SNAPSHOT_BYTES_CAP: '1' } as Env; // o espaço das cópias acabou: a cópia de antes é recusada
    });
    const before = await recordsOf(user);
    expect(await restore(user, name, now)).toEqual({ status: 409, body: { error: 'no-room' } });
    expect(await dayRow(now)).toBe(0);
    expect(await recordsOf(user)).toEqual(before);

    const other = 'teto-restaura-put-falha';
    await sync(other, [session(), solve('a')], { now: now - DAY });
    await env.SNAPSHOTS.put(snapshotKey(other, name), await gzipJson(exportFromRecords([session()], now - DAY)));
    await runInDurableObject(stubOf(other), (instance) => {
      const o = instance as unknown as { env: Env };
      const bucket = o.env.SNAPSHOTS;
      const broken = new Proxy(bucket, {
        get(target, key) {
          if (key === 'put') return async () => Promise.reject(new Error('R2: falha de rede'));
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      o.env = { ...o.env, SNAPSHOTS: broken };
    });
    await expect(restore(other, name, now)).rejects.toThrow();
    expect(await dayRow(now)).toBe(0);
  });

  it('o D1 que falha na reserva não para o sync: a página volta, as gravações esperam minutos, e nada é gravado sem pagar', async () => {
    const now = at(38);
    const user = 'teto-d1-sync';
    await sync(user, [session(), solve('a')], { now: now - DAY });
    const before = await recordsOf(user);
    const writes = await stateOf(user, 'writes');
    const tried = await failDay(user);
    const { result: res, logged } = await logsOf(() => sync(user, [solve('b')], { now }));
    expect([res.accepted, res.rejected, res.deferred, res.retryAt]).toEqual([0, [], 1, now + ROWS_RETRY_MS]);
    expect(res.changes.map((c) => c.id)).toEqual(['s1', 'a']);
    expect(tried.n).toBeGreaterThan(0);
    expect(logged).toContainEqual({ evt: 'rows-cap-error', user, op: 'sync' });
    expect(await recordsOf(user)).toEqual(before);
    expect(await stateOf(user, 'writes')).toBe(writes);
  });

  it('o D1 que falha na reserva: a compactação fica para outro dia, e a cópia do dia sai', async () => {
    const user = 'teto-d1-compacta';
    const old = Date.now() - TOMBSTONE_KEEP_MS - HOUR;
    await sync(user, [session(), solve('velho', gone(old))], { now: Date.now() - 2 * DAY });
    await failDay(user);
    const { result, logged } = await logsOf(() => runDurableObjectAlarm(stubOf(user)));
    expect(result).toBe(true);
    expect(await dataOf(user, 'velho')).not.toBe('{}');
    expect(logged).toContainEqual({ evt: 'rows-cap-error', user, op: 'compact' });
    expect(await env.SNAPSHOTS.head(snapshotKey(user, dayOf(Date.now())))).not.toBeNull();
  });

  it('o D1 que falha na reserva: a restauração volta write-budget depois de ler a cópia, sem a cópia de antes e sem gravar nada', async () => {
    const now = at(42);
    const user = 'teto-d1-restaura';
    await sync(user, [session(), solve('a')], { now: now - DAY });
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(now - DAY)), await gzipJson(exportFromRecords([session()], now - DAY)));
    await failDay(user);
    const before = await recordsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(now - DAY), now)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(r2).toEqual({ get: 1 });
    expect(await recordsOf(user)).toEqual(before);
    // A revisão final (M2): um D1 que falha não é "não cabe hoje", e o app novo também ouve write-budget, nunca a resposta do aparelho
    // (que o faria regravar a conta inteira daqui por causa de uma falha de rede do servidor).
    expect(await restore(user, dayOf(now - DAY), now + 1000, { device: true })).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await recordsOf(user)).toEqual(before);
  });

  it('o D1 que falha só na reserva, com a cópia de antes já guardada: write-budget nos dois apps', async () => {
    const now = at(43);
    const user = 'teto-d1-reserva';
    await sync(user, [session(), solve('a')], { now: now - DAY });
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(now - DAY)), await gzipJson(exportFromRecords([session()], now - DAY)));
    await failDay(user, (q) => q.startsWith('INSERT INTO rows_day')); // a conferência (só lê) passa; a reserva falha
    const before = await recordsOf(user);
    expect(await restore(user, dayOf(now - DAY), now)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await restore(user, dayOf(now - DAY), now + 1000, { device: true })).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await recordsOf(user)).toEqual(before);
  });

  // As compactações das 03:05 (uma por conta) não podem comer o dia de todos: a compactação só reserva enquanto a reserva dela cabe na
  // metade de baixo do teto do ambiente, e a metade de cima fica para os syncs.
  it('a compactação só reserva na metade de baixo do dia do ambiente; o sync do mesmo dia passa', async () => {
    const cap = 10_000;
    const half = cap * COMPACT_ROWS_SHARE;
    const old = Date.now() - TOMBSTONE_KEEP_MS - HOUR;
    const [early, late] = ['teto-metade-a', 'teto-metade-b'];
    for (const user of [early, late]) {
      await sync(user, [session(), solve('velho', gone(old))], { now: Date.now() - 2 * DAY });
      await setCap(user, String(cap));
    }
    const today = Date.now(); // o alarme segue a hora de verdade
    await seedDay(today, half - rowsOf(0, 1) + 1); // a compactação de um solve passaria da metade
    expect(await runDurableObjectAlarm(stubOf(early))).toBe(true);
    expect(await dataOf(early, 'velho')).not.toBe('{}');
    const res = await sync(early, [solve('novo')], { now: today }); // o sync tem a metade de cima
    expect([res.accepted, res.deferred]).toEqual([1, undefined]);
    expect(await dayRow(today)).toBe(half - rowsOf(0, 1) + 1 + rowsOf(1));
    await seedDay(today, half - rowsOf(0, 1)); // cabe até a metade
    expect(await runDurableObjectAlarm(stubOf(late))).toBe(true);
    expect(await dataOf(late, 'velho')).toBe('{}');
    expect(await dayRow(today)).toBe(half);
  });
});

describe('o teto do ambiente: a auditoria de segurança (NV-3)', () => {
  it('as linhas reservadas para mudanças tortas ou repetidas voltam ao dia: uma conta não enche o teto de todas sem gravar', async () => {
    const now = at(60);
    const [bad, other] = ['teto-torto-a', 'teto-torto-b'];
    const cap = 2 * rowsOf(MAX_WRITES_PER_REQUEST);
    for (const user of [bad, other]) await setCap(user, String(cap));
    const junk = Array.from({ length: MAX_WRITES_PER_REQUEST }, () => ({}) as Change);
    for (const user of [bad, other]) await sync(user, [], { now }); // o aparelho novo grava a linha dele antes
    const base = await dayRow(now);
    for (let i = 0; i < 3; i++) {
      const res = await sync(bad, junk, { now });
      expect([res.accepted, res.rejected.length, res.deferred]).toEqual([0, MAX_WRITES_PER_REQUEST, undefined]);
    }
    expect(await dayRow(now)).toBe(base); // reservou e devolveu tudo
    // O mesmo com a mudança repetida: gravada uma vez, as outras não mudam nada e voltam.
    const once = await sync(bad, [session()], { now });
    expect(once.accepted).toBe(1);
    expect(await dayRow(now)).toBe(base + rowsOf(1));
    await sync(bad, [session()], { now });
    expect(await dayRow(now)).toBe(base + rowsOf(1));
    // A outra conta ainda grava no mesmo dia.
    const ok = await sync(other, [session(), solve('o1')], { now });
    expect([ok.accepted, ok.deferred]).toEqual([2, undefined]);
    expect(await dayRow(now)).toBe(base + rowsOf(1) + rowsOf(2));
  });
});
