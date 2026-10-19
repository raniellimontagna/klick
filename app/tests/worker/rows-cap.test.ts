// O teto de linhas gravadas por dia do ambiente (ROWS_WRITTEN_DAY_CAP; decisão 6 e o portão 11 do README): as 100 mil linhas gravadas por
// dia do grátis são da conta da Cloudflare inteira, e o teto soma as de todas as contas do Klick num dia UTC, no D1 (rows_day). Cada objeto
// reserva em blocos de ROWS_CHUNK e guarda a sobra na memória. O teto é trocado só no objeto de cada conta (o env que ele lê; o
// vitest.worker.config.ts põe um que nunca enche), e o dia do D1 é semeado direto. Cada teste usa dias próprios, longe de T0 e de hoje,
// onde nenhum outro reserva; a compactação, que segue a hora de verdade, semeia o dia de hoje cheio para o teto pequeno do objeto dela.
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { TOMBSTONE_KEEP_MS, type ActiveCounts } from '../../src/core/sync/limits';
import { exportFromRecords } from '../../src/core/sync/snapshot';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, type Change, type SyncResponse } from '../../src/core/sync/types';
import type { Env } from '../../worker/env';
import { MAX_WRITES_PER_REQUEST, nextUtcDay, REQUEST_ROWS, ROWS_CHUNK, rowsOf, utcDay, utcMonth } from '../../worker/limits';
import { dayOf, gzipJson, snapshotKey } from '../../worker/snapshots';
import { call, postJson, stateOf, stubOf, T0, testDeps } from './helpers';

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
const gone = (t: number) => ({ updatedAt: t, deletedAt: t, deletionStamp: t });
const many = (prefix: string, n: number): Change[] => Array.from({ length: n }, (_, i) => solve(`${prefix}${String(i).padStart(4, '0')}`));

async function sync(user: string, changes: Change[], o: { now: number; device?: string; cursor?: number }): Promise<SyncResponse> {
  const body = { v: SYNC_PROTOCOL, account: user, deviceId: o.device ?? 'd1', cursor: o.cursor ?? 0, clock: o.now, changes };
  const res = await call('/api/sync', postJson(body), { deps: testDeps({ user, now: () => o.now }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}
const restore = async (user: string, name: string, now: number): Promise<{ status: number; body: unknown }> => {
  const res = await call(`/api/snapshots/${name}/restore`, postJson({}, { [ACCOUNT_HEADER]: user }), { deps: testDeps({ user, now: () => now }) });
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
  it('a constante do bloco', () => {
    expect(ROWS_CHUNK).toBe(2_000);
  });

  it('soma as contas: a primeira grava, a segunda fica para amanhã (retryAt à meia-noite UTC), a página dela volta, e nada se perde', async () => {
    const now = at(1);
    const [first, second] = ['teto-soma-a', 'teto-soma-b'];
    await sync(second, [session(), solve('b1')], { now: now - DAY }); // a conta que fica sem linhas já tem o que receber
    for (const user of [first, second]) await setCap(user, String(ROWS_CHUNK));
    const a = await sync(first, many('a', MAX_WRITES_PER_REQUEST), { now });
    expect([a.accepted, a.rejected, a.deferred, a.retryAt]).toEqual([MAX_WRITES_PER_REQUEST, [], undefined, undefined]);
    expect(await dayRow(now)).toBe(ROWS_CHUNK); // um bloco, que cobre o pedido inteiro
    const before = await json(second, 'writes');
    const { result: b, logged } = await logsOf(() => sync(second, [solve('b2')], { now, device: 'd2' }));
    expect([b.accepted, b.rejected, b.deferred, b.retryAt]).toEqual([0, [], 1, nextUtcDay(now)]);
    expect(b.changes.map((c) => c.id)).toEqual(['s1', 'b1']); // o recebimento segue
    expect(logged).toContainEqual({ evt: 'rows-cap', user: second, op: 'sync', rows: rowsOf(1) });
    expect(logged).toContainEqual(expect.objectContaining({ evt: 'sync', user: second, pushed: 1, deferred: 1 }));
    expect(await dayRow(now)).toBe(ROWS_CHUNK); // recusado, nada somado
    expect(await json(second, 'writes')).toEqual(before); // nem no orçamento da conta
    // No dia seguinte (UTC), o aparelho manda o que esperou, e passa.
    const next = await sync(second, [solve('b2')], { now: nextUtcDay(now), device: 'd2', cursor: b.cursor });
    expect([next.accepted, next.rejected, next.deferred]).toEqual([1, [], undefined]);
    expect(next.changes.map((c) => c.id)).toEqual(['b2']);
    expect(await dayRow(nextUtcDay(now))).toBe(ROWS_CHUNK);
  });

  it('em blocos: muitos syncs pequenos reservam no D1 uma vez a cada ROWS_CHUNK linhas, e a conta grava o mesmo número que o teto conta', async () => {
    const now = at(4);
    const user = 'teto-blocos';
    const statements = await countDay(user);
    const [requests, per] = [50, 20];
    for (let i = 0; i < requests; i++) await sync(user, many(`p${i}-`, per), { now });
    const rows = requests * rowsOf(per);
    expect(rows).toBeGreaterThan(2 * ROWS_CHUNK);
    expect(statements.n).toBe(Math.ceil(rows / ROWS_CHUNK)); // 3, não 50
    expect(await dayRow(now)).toBe(Math.ceil(rows / ROWS_CHUNK) * ROWS_CHUNK);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(now), n: rows }); // rowsOf, o mesmo número nos dois
  });

  it('um pedido maior que um bloco reserva, de uma vez, os blocos que o cobrem; a sobra serve os pedidos seguintes', async () => {
    const now = at(6);
    const user = 'teto-blocos-grandes';
    await sync(user, [session()], { now: now - DAY });
    await seedSolves(user, 's1', 600);
    const statements = await countDay(user);
    const res = await sync(user, [session('s1', gone(T0 + 10))], { now }); // a cascata grava a sessão e os 600 solves
    expect([res.accepted, res.rejected, res.deferred]).toEqual([1, [], undefined]);
    expect(rowsOf(601)).toBeGreaterThan(ROWS_CHUNK);
    expect([statements.n, await dayRow(now)]).toEqual([1, 2 * ROWS_CHUNK]);
    await sync(user, many('n', MAX_WRITES_PER_REQUEST), { now }); // cabe na sobra (4.000 - 2.409)
    expect([statements.n, await dayRow(now)]).toEqual([1, 2 * ROWS_CHUNK]);
  });

  it('com pouco espaço no dia, o pedido menor que um bloco passa com a reserva do que ele precisa; o que não cabe fica para amanhã', async () => {
    const now = at(8);
    const user = 'teto-sobra';
    const cap = 10_000;
    await setCap(user, String(cap));
    await seedDay(now, cap - rowsOf(10) - 1); // cabem as linhas de 10 solves, não um bloco
    const fits = await sync(user, many('s', 10), { now });
    expect([fits.accepted, fits.deferred]).toEqual([10, undefined]);
    expect(await dayRow(now)).toBe(cap - 1); // só o que o pedido precisava
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
    expect(statements.n).toBe(2); // o bloco e o que faltava, só no primeiro
    expect(logged.filter((l) => (l as { evt?: string }).evt === 'rows-cap')).toEqual([{ evt: 'rows-cap', user, op: 'sync', rows: rowsOf(1) }]);
    await sync(user, [], { now, device: 'd2' }); // o aparelho novo pede menos que o recusado: pergunta, e cabe
    expect([statements.n, await dayRow(now)]).toEqual([4, cap]);
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
    // Antes de hoje: o dia do teto, como o do orçamento da conta, nunca volta atrás, e um sync num dia à frente seguraria a sobra dele.
    await sync(user, [session(), solve('velho', gone(old)), solve('vivo')], { now: Date.now() - 2 * DAY });
    await setCap(user, '1000');
    await seedDay(Date.now(), 1000); // o alarme segue a hora de verdade
    const writes = await stateOf(user, 'writes');
    const { result, logged } = await logsOf(() => runDurableObjectAlarm(stubOf(user)));
    expect(result).toBe(true);
    const velho = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ data: string }>("SELECT data FROM records WHERE id = 'velho'").one().data);
    expect(velho).not.toBe('{}');
    expect(await stateOf(user, 'writes')).toBe(writes);
    expect(logged).toContainEqual({ evt: 'rows-cap', user, op: 'compact', rows: rowsOf(0, 1) });
    expect(await env.SNAPSHOTS.head(snapshotKey(user, dayOf(Date.now())))).not.toBeNull();
  });

  it('a restauração sem linhas no teto para o mínimo dela volta write-budget antes de qualquer operação do R2', async () => {
    const now = at(18);
    const user = 'teto-restaura';
    await sync(user, [session(), solve('a'), solve('b')], { now: now - DAY });
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(now - DAY)), await gzipJson(exportFromRecords([session()], now - DAY)));
    await setCap(user, '1000');
    await seedDay(now, 1000);
    const before = await recordsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(now - DAY), now)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(r2).toEqual({});
    const opsB = await env.DB.prepare("SELECT count FROM r2_ops WHERE month = ? AND class = 'B'").bind(utcMonth(now)).first<{ count: number }>();
    expect(opsB?.count ?? 0).toBe(0);
    expect(await stateOf(user, 'attempts')).toBeNull(); // nem chegou ao R2
    expect(await recordsOf(user)).toEqual(before);
    expect(await dayRow(now)).toBe(1000);
  });

  it('a restauração que só sabe o tamanho depois de ler a cópia: sem linhas para ela, write-budget antes de gravar qualquer coisa', async () => {
    const now = at(20);
    const user = 'teto-restaura-depois';
    await sync(user, [session(), solve('a')], { now: now - DAY });
    const name = dayOf(now - DAY);
    await env.SNAPSHOTS.put(snapshotKey(user, name), await gzipJson(exportFromRecords([session(), ...many('c', 40)], now - DAY)));
    await setCap(user, '1000');
    await seedDay(now, 1000 - rowsOf(2) - 10); // o mínimo (a sessão e o solve de agora) cabe; as 40 da cópia, não
    const before = await recordsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, name, now)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(r2).toEqual({ get: 1 }); // leu a cópia; nem a cópia de antes, nem nada gravado
    expect(await recordsOf(user)).toEqual(before);
    expect(await dayRow(now)).toBe(1000 - 10); // o mínimo ficou reservado, na sobra do objeto
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
