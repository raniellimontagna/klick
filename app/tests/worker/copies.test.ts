// As cópias na nuvem dentro do grátis do R2 (endurecimento 4.2, decisões 1 e 3): o teto do espaço das cópias, as operações do R2 por mês
// (A: gravar e listar; B: ler), a lista guardada por alguns minutos e as restaurações por dia. O espaço e as operações são semeados direto
// no D1 (r2_storage e r2_ops); o teto de cada um é o do wrangler.jsonc (o beta), o mesmo que o objeto da conta lê. As cópias saem por
// stub.snapshot(T0), não pelo alarme: o mês das operações é o de T0, qualquer que seja o dia em que os testes rodam.
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { restoreChanges } from '../../src/core/sync/restore';
import { accountPrefsOf } from '../../src/core/sync/snapshot';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, type Change, type CloudCopies, type SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { storageUsed } from '../../worker/budget';
import type { Env } from '../../worker/env';
import { capsOf, COPIES_CACHE_MS, DAILY_WRITE_BUDGET, RESTORES_PER_DAY, STORAGE_HEADROOM, utcDay, utcMonth } from '../../worker/limits';
import { dayOf, gunzipJson, preRestoreName, snapshotKey, snapshotPrefix } from '../../worker/snapshots';
import { call, postJson, setState, stateOf, stubOf, T0, testDeps } from './helpers';

const DAY = 86_400_000;
const MONTH = utcMonth(T0);
const caps = capsOf(env as unknown as Env);
const ROOM = Math.floor(caps.snapshotBytes * STORAGE_HEADROOM); // até onde o espaço das cópias vai

const solve = (id: string, ms = 9000): Change => ({
  store: 'solves', id, updatedAt: T0, deletedAt: null, deletionStamp: T0,
  data: { sessionId: 's1', event: '333', ms, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0 },
});
const session: Change = { store: 'sessions', id: 's1', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0 };

async function sync(user: string, changes: Change[], now = T0): Promise<SyncResponse> {
  const body = { v: SYNC_PROTOCOL, account: user, deviceId: 'd1', cursor: 0, clock: now, changes };
  const res = await call('/api/sync', postJson(body), { deps: testDeps({ user, now: () => now }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}
const list = async (user: string, now = T0): Promise<{ status: number; body: unknown }> => {
  const res = await call('/api/snapshots', { headers: { [ACCOUNT_HEADER]: user } }, { deps: testDeps({ user, now: () => now }) });
  return { status: res.status, body: await res.json() };
};
const restore = async (user: string, name: string, now: number): Promise<{ status: number; body: unknown }> => {
  const res = await call(`/api/snapshots/${name}/restore`, postJson({}, { [ACCOUNT_HEADER]: user }), { deps: testDeps({ user, now: () => now }) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

const seedOps = (cls: 'A' | 'B', count: number) =>
  env.DB.prepare('INSERT INTO r2_ops (month, class, count) VALUES (?1, ?2, ?3) ON CONFLICT (month, class) DO UPDATE SET count = excluded.count')
    .bind(MONTH, cls, count)
    .run();
const opsOf = async (cls: 'A' | 'B'): Promise<number> =>
  (await env.DB.prepare('SELECT count FROM r2_ops WHERE month = ? AND class = ?').bind(MONTH, cls).first<{ count: number }>())?.count ?? 0;
const seedUsed = (bytes: number) =>
  env.DB.prepare('INSERT INTO r2_storage (id, bytes, counted_at) VALUES (1, ?1, 0) ON CONFLICT (id) DO UPDATE SET bytes = excluded.bytes').bind(bytes).run();

// As chamadas ao R2 do objeto da conta, contadas por método (list, get, head, put): o objeto passa a usar um bucket que conta e segue para o
// de verdade. O objeto e o teste dividem só um objeto simples.
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

// O que uma restauração recusada não pode mudar: os registros e os contadores do objeto, e as cópias no R2.
const accountOf = (user: string) =>
  runInDurableObject(stubOf(user), (_o, state) => ({
    records: state.storage.sql.exec('SELECT * FROM records ORDER BY store, id').toArray(),
    state: state.storage.sql.exec("SELECT key, value FROM state WHERE key <> 'copies' ORDER BY key").toArray(),
  }));
// Quantas mudanças restaurar a cópia `name` daria agora (restoreChanges, como o objeto faz).
async function restoreCount(user: string, name: string): Promise<number> {
  const object = await env.SNAPSHOTS.get(snapshotKey(user, name));
  const copy = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
  const current = (await sync(user, [])).changes;
  const practice = Array.isArray(copy.practice) ? copy.practice : null;
  return restoreChanges(current, { sessions: copy.sessions, solves: copy.solves, practice }, accountPrefsOf(copy.profile), T0 + DAY).length;
}
const objectsOf = async (user: string): Promise<string[]> => (await env.SNAPSHOTS.list({ prefix: snapshotPrefix(user) })).objects.map((o) => o.key);

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM r2_ops'), env.DB.prepare('DELETE FROM r2_storage')]);
});

describe('a cópia do dia dentro do teto (endurecimento 4.2)', () => {
  it('perto do teto do espaço a cópia do dia não é gravada, o sync diz paused "space", e com espaço ela volta', async () => {
    const user = 'copia-espaco';
    expect((await sync(user, [session, solve('a')])).copiesPaused).toBeNull(); // todo sync leva a pausa, null quando as cópias seguem
    await seedUsed(ROOM - 10); // 10 bytes de folga: nenhuma cópia cabe
    expect(await stubOf(user).snapshot(T0)).toBe(false);
    expect(await objectsOf(user)).toEqual([]);
    expect(await stateOf(user, 'snapshotRev')).toBeNull(); // não marca: tenta de novo no dia seguinte
    expect([await storageUsed(env.DB), await opsOf('A')]).toEqual([ROOM - 10, 0]); // nada foi reservado
    expect((await sync(user, [])).copiesPaused).toBe('space');
    expect(await list(user)).toEqual({ status: 200, body: { copies: [], paused: 'space' } });

    await seedUsed(0);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const [key] = await objectsOf(user);
    expect(key).toBe(snapshotKey(user, dayOf(T0)));
    const object = await env.SNAPSHOTS.head(key);
    expect([await storageUsed(env.DB), await opsOf('A')]).toEqual([object!.size, 2]); // o tamanho da cópia; a lista e o put
    expect((await sync(user, [])).copiesPaused).toBeNull();
  });

  it('sem operações A no mês, a cópia não sai (paused "ops")', async () => {
    const user = 'copia-ops';
    await sync(user, [session, solve('a')]);
    await seedOps('A', caps.classAMonth);
    expect(await stubOf(user).snapshot(T0)).toBe(false);
    expect(await objectsOf(user)).toEqual([]);
    expect(await storageUsed(env.DB)).toBe(0); // o espaço reservado volta
    expect(await opsOf('A')).toBe(caps.classAMonth);
    expect((await sync(user, [])).copiesPaused).toBe('ops');
    await seedOps('A', caps.classAMonth - 1);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(await opsOf('A')).toBe(caps.classAMonth);
    expect((await sync(user, [])).copiesPaused).toBeNull();
  });
});

describe('a lista das cópias (decisão 1)', () => {
  it('a lista fica guardada por 10 minutos: o segundo pedido não lista o bucket; uma cópia nova a renova', async () => {
    const user = 'lista-guardada';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    const r2 = await countR2(user);
    const first = { name: dayOf(T0), day: dayOf(T0), kind: 'daily', solves: 1 };
    expect(await list(user)).toEqual({ status: 200, body: { copies: [first], paused: null } });
    expect([r2.list, await opsOf('A')]).toEqual([1, 2]); // o put da cópia e uma página da lista
    expect(await list(user, T0 + COPIES_CACHE_MS - 1)).toEqual({ status: 200, body: { copies: [first], paused: null } });
    expect([r2.list, await opsOf('A')]).toEqual([1, 2]); // guardada: nem o bucket nem o D1
    expect((await list(user, T0 + COPIES_CACHE_MS)).status).toBe(200); // 10 minutos depois, lista de novo
    expect([r2.list, await opsOf('A')]).toEqual([2, 3]);
    // Uma cópia nova (o dia seguinte) renova a lista antes dos 10 minutos.
    await sync(user, [solve('b')]);
    expect(await stubOf(user).snapshot(T0 + DAY)).toBe(true);
    const { body } = await list(user, T0 + COPIES_CACHE_MS + 1);
    expect((body as CloudCopies).copies.map((c) => c.name)).toEqual([dayOf(T0 + DAY), dayOf(T0)]);
    expect(r2.list).toBe(3);
  });

  it('sem operações A, devolve a lista guardada; sem lista guardada, 503 r2-budget', async () => {
    const user = 'lista-sem-ops';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    const guarded = await list(user);
    expect(guarded.status).toBe(200);
    await seedOps('A', caps.classAMonth);
    const r2 = await countR2(user);
    // Velha (passou dos 10 minutos), mas é a que existe; a pausa diz por que ela não se renova.
    expect(await list(user, T0 + 2 * COPIES_CACHE_MS)).toEqual({ status: 200, body: { copies: (guarded.body as CloudCopies).copies, paused: 'ops' } });
    expect(r2.list).toBeUndefined();
    const other = 'lista-sem-ops-nova';
    await sync(other, [session]);
    expect(await list(other)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect(await opsOf('A')).toBe(caps.classAMonth);
  });

  it('uma cópia que sumiu (404) renova a lista', async () => {
    const user = 'lista-sumiu';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    expect(((await list(user)).body as CloudCopies).copies).toHaveLength(1);
    await env.SNAPSHOTS.delete(snapshotKey(user, dayOf(T0))); // a regra de 30 dias do bucket a apagou
    expect(((await list(user, T0 + 1000)).body as CloudCopies).copies).toHaveLength(1); // ainda a guardada
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await list(user, T0 + 3000)).toEqual({ status: 200, body: { copies: [], paused: null } });
  });
});

describe('restaurar dentro do grátis (decisões 1, 2 e 3)', () => {
  it('a quarta restauração do dia recebe 429 restore-limit', async () => {
    const user = 'restaura-limite';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    expect((await restore(user, '2020-01-01', T0 + 500)).status).toBe(404); // só a que deu certo conta
    for (let i = 1; i <= RESTORES_PER_DAY; i++) expect((await restore(user, dayOf(T0), T0 + i * 1000)).status).toBe(204);
    const before = [await objectsOf(user), await opsOf('B')];
    expect(await restore(user, dayOf(T0), T0 + 9000)).toEqual({ status: 429, body: { error: 'restore-limit' } });
    expect([await objectsOf(user), await opsOf('B')]).toEqual(before); // recusada antes de ler o R2
    expect((await restore(user, dayOf(T0), T0 + DAY)).status).toBe(204); // o dia seguinte (UTC) tem vaga
  });

  it('sem espaço para a cópia de antes, 409 no-room e nada muda na conta', async () => {
    const user = 'restaura-sem-espaco';
    await sync(user, [session, solve('a', 1000)]);
    await stubOf(user).snapshot(T0);
    await sync(user, [solve('extra'), { ...solve('a', 2000), updatedAt: T0 + 50 }]);
    const account = await accountOf(user);
    const objects = await objectsOf(user);
    await seedUsed(ROOM - 10);
    const opsA = await opsOf('A');
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 409, body: { error: 'no-room' } });
    expect(await accountOf(user)).toEqual(account); // nem os registros, nem a revisão, nem os contadores (restaurações, gravações)
    expect(await objectsOf(user)).toEqual(objects); // nenhuma cópia "antes de restaurar"
    expect([await storageUsed(env.DB), await opsOf('A')]).toEqual([ROOM - 10, opsA]);
    await seedUsed(0);
    expect((await restore(user, dayOf(T0), T0 + 2000)).status).toBe(204);
    expect(await objectsOf(user)).toContain(snapshotKey(user, preRestoreName(T0 + 2000)));
  });

  it('sem operações B, 503 r2-budget antes de ler a cópia', async () => {
    const user = 'restaura-sem-b';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    await sync(user, [solve('extra')]);
    const account = await accountOf(user);
    await seedOps('B', caps.classBMonth - 1); // a restauração pede as duas (ler a cópia e conferir a de antes) de uma vez
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect([r2.get, r2.head]).toEqual([undefined, undefined]);
    expect(await opsOf('B')).toBe(caps.classBMonth - 1);
    expect(await accountOf(user)).toEqual(account);
    // Com as B, mas sem a operação A da cópia de antes: o mesmo 503, e o espaço reservado para ela volta.
    await seedOps('B', 0);
    await seedOps('A', caps.classAMonth);
    const used = await storageUsed(env.DB); // a cópia do dia
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect([await storageUsed(env.DB), await opsOf('B')]).toEqual([used, 2]);
    expect(await accountOf(user)).toEqual(account);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(T0))]);
  });

  it('acima de 20 mil gravações, 413 too-big; acima do que sobra hoje, 429 write-budget', async () => {
    const big = 'restaura-grande';
    await sync(big, [session, solve('a')]);
    await stubOf(big).snapshot(T0);
    // Depois da cópia, a conta ganhou 20 mil solves (direto no SQLite do objeto): restaurar o dia mandaria todos eles para a lixeira.
    await runInDurableObject(stubOf(big), (_o, state) => {
      const sql = state.storage.sql;
      sql.exec(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${DAILY_WRITE_BUDGET})
         INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) SELECT 'solves', 'x' || i, ?, ?, NULL, ?, 2 + i, 's1' FROM n`,
        JSON.stringify(solve('x').data), T0, T0,
      );
      sql.exec("UPDATE state SET value = ? WHERE key = 'rev'", String(2 + DAILY_WRITE_BUDGET));
    });
    const account = await accountOf(big);
    expect(await restore(big, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(await accountOf(big)).toEqual(account);
    expect(await objectsOf(big)).toEqual([snapshotKey(big, dayOf(T0))]);

    const small = 'restaura-orcamento';
    await sync(small, [session, solve('a')]);
    await stubOf(small).snapshot(T0);
    await sync(small, [solve('extra')]);
    const n = await restoreCount(small, dayOf(T0)); // a sessão e o solve a de novo, o extra para a lixeira e os ajustes da conta
    await setState(small, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - n + 1 });
    const before = await accountOf(small);
    expect(await restore(small, dayOf(T0), T0 + 1000)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await accountOf(small)).toEqual(before);
    await setState(small, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - n });
    expect((await restore(small, dayOf(T0), T0 + 2000)).status).toBe(204);
    expect(JSON.parse((await stateOf(small, 'writes'))!)).toEqual({ day: utcDay(T0), n: DAILY_WRITE_BUDGET }); // as gravações contam no dia
  });
});

describe('apagar a conta (spec 7.7) com as operações no fim', () => {
  it('apaga as cópias mesmo sem operações A no mês: as listagens contam, sem recusar', async () => {
    const user = 'apaga-sem-ops';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    await seedOps('A', caps.classAMonth);
    const res = await call('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', [ACCOUNT_HEADER]: user },
      body: JSON.stringify({ email: `${user}@exemplo.com` }),
    }, { deps: testDeps({ user }) });
    expect(res.status).toBe(204);
    expect(await objectsOf(user)).toEqual([]);
    expect(await opsOf('A')).toBe(caps.classAMonth + 2); // a página com a cópia e a vazia, que confirma o fim
    expect(await list(user)).toEqual({ status: 401, body: { error: 'auth' } });
  });
});
