// As cópias na nuvem dentro do grátis do R2 (endurecimento 4.2, decisões 1 e 3): o teto do espaço das cópias, as operações do R2 por mês
// (A: gravar e listar; B: ler), a lista guardada por alguns minutos e as restaurações por dia. O espaço e as operações são semeados direto
// no D1 (r2_storage e r2_ops); o teto de cada um é o do wrangler.jsonc (o beta), o mesmo que o objeto da conta lê. As cópias saem por
// stub.snapshot(T0), não pelo alarme: o mês das operações é o de T0, qualquer que seja o dia em que os testes rodam.
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { restoreChanges } from '../../src/core/sync/restore';
import { accountPrefsOf } from '../../src/core/sync/snapshot';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, type Change, type CloudCopies, type SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { storageUsed } from '../../worker/budget';
import type { Env } from '../../worker/env';
import {
  capsOf,
  COPIES_CACHE_MS,
  DAILY_READ_BUDGET,
  DAILY_WRITE_BUDGET,
  RECORDS_PER_DAY,
  RESTORE_ATTEMPTS_PER_DAY,
  RESTORES_PER_DAY,
  rowsOf,
  STORAGE_HEADROOM,
  utcDay,
  utcMonth,
} from '../../worker/limits';
import { COMPACTABLE, rowToChange, type Row } from '../../worker/records-sql';
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

// As vars dos tamanhos (Task 12) trocadas só no objeto da conta de `user` (o env que ele lê): undefined tira a var. A falha fechada e um
// teto pequeno, sem mexer no wrangler.jsonc.
type SizeVars = Partial<Record<'SNAPSHOT_MAX_RECORDS' | 'RESTORE_MAX_RECORDS', string | undefined>>;
async function setVars(user: string, vars: SizeVars): Promise<void> {
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { env: Env };
    o.env = { ...o.env, ...vars } as Env;
  });
}

// N solves a mais na conta (ids `prefix`1 a `prefix`N), direto no SQLite do objeto (uma conta grande sem milhares de pedidos), com as
// revisões depois das dela.
async function seedSolves(user: string, n: number, prefix = 'x'): Promise<void> {
  await runInDurableObject(stubOf(user), (_o, state) => {
    const sql = state.storage.sql;
    const rev = Number(sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'rev'").toArray()[0]?.value ?? '0');
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) SELECT 'solves', ? || i, ?, ?, NULL, ?, ? + i, 's1' FROM n`,
      n, prefix, JSON.stringify(solve('x').data), T0, T0, rev,
    );
    sql.exec("UPDATE state SET value = ? WHERE key = 'rev'", String(rev + n));
  });
}
// Tira da conta, direto no SQLite, os solves semeados com `prefix` além dos primeiros `keep`.
const dropSolves = (user: string, prefix: string, keep = 0) =>
  runInDurableObject(stubOf(user), (_o, state) => {
    state.storage.sql.exec("DELETE FROM records WHERE store = 'solves' AND id LIKE ? AND CAST(substr(id, ?) AS INTEGER) > ?", `${prefix}%`, prefix.length + 1, keep);
  });
const recordCount = (user: string): Promise<number> =>
  runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ n: number }>('SELECT count(*) AS n FROM records').one().n);

// O que uma restauração recusada não pode mudar: os registros e os contadores do objeto, e as cópias no R2. Fora, a lista guardada das
// cópias e o que conta o que a recusa leu: as tentativas do dia (`attempts`, as que chegaram ao R2) e as linhas lidas (`reads`).
const accountOf = (user: string) =>
  runInDurableObject(stubOf(user), (_o, state) => ({
    records: state.storage.sql.exec('SELECT * FROM records ORDER BY store, id').toArray(),
    state: state.storage.sql.exec("SELECT key, value FROM state WHERE key NOT IN ('copies', 'attempts', 'reads') ORDER BY key").toArray(),
  }));
// Quantas mudanças restaurar a cópia `name` daria agora (restoreChanges, como o objeto faz, com a conta inteira lida do SQLite dele).
async function restoreCount(user: string, name: string): Promise<number> {
  const object = await env.SNAPSHOTS.get(snapshotKey(user, name));
  const copy = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
  const current = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<Row>('SELECT * FROM records').toArray().map(rowToChange));
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

  it('o alarme com o espaço cheio não grava a cópia, pausa com "space" e marca o alarme de amanhã', async () => {
    const user = 'alarme-sem-espaco';
    await sync(user, [session, solve('a')]); // marca o alarme
    await seedUsed(ROOM - 10);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(await objectsOf(user)).toEqual([]);
    expect(await stateOf(user, 'snapshotRev')).toBeNull();
    // Antes do sync seguinte, que marcaria um alarme se não houvesse nenhum: o próprio alarme marcou o de amanhã, que tenta de novo.
    const next = await runInDurableObject(stubOf(user), (_o, state) => state.storage.getAlarm());
    expect(next).toBeGreaterThan(Date.now());
    expect((await sync(user, [])).copiesPaused).toBe('space');
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

// Revisão final (I5 b): pausada por espaço ou por operações, a cópia do dia não lê nem comprime a conta inteira todo dia para descobrir que
// não cabe. Com o tamanho da última cópia guardado no estado, o espaço e a operação A são conferidos antes; a primeira cópia lê como antes.
describe('a cópia pausada não relê a conta', () => {
  // As leituras da conta inteira (SELECT * FROM records, o que a cópia exporta) no objeto de `user`.
  async function countAll(user: string): Promise<{ n: number }> {
    const reads = { n: 0 };
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      o.sql = new Proxy(real, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          return (query: string, ...bindings: unknown[]) => {
            if (query === 'SELECT * FROM records') reads.n++;
            return target.exec(query, ...(bindings as SqlStorageValue[]));
          };
        },
      });
    });
    return reads;
  }

  it('o alarme sem espaço e a cópia sem operação A não leem a conta; com os dois, a cópia lê e sai', async () => {
    const user = 'copia-pausada-barata';
    await sync(user, [session, solve('a')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true); // a primeira lê a conta e guarda o tamanho da cópia
    await sync(user, [solve('b')]);
    expect((await list(user)).status).toBe(200); // a lista nova fica guardada sem perder o tamanho
    const reads = await countAll(user);
    await seedUsed(ROOM - 10);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect((await sync(user, [])).copiesPaused).toBe('space');
    expect(reads.n).toBe(0);
    await seedUsed(0);
    await seedOps('A', caps.classAMonth);
    expect(await stubOf(user).snapshot(T0 + DAY)).toBe(false);
    expect((await sync(user, [])).copiesPaused).toBe('ops');
    expect([reads.n, await storageUsed(env.DB)]).toEqual([0, 0]);
    await seedOps('A', 0);
    expect(await stubOf(user).snapshot(T0 + DAY)).toBe(true);
    expect((await sync(user, [])).copiesPaused).toBeNull();
    expect(reads.n).toBe(1);
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
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect([r2.get, r2.list]).toEqual([1, undefined]); // estava na lista: o R2 é lido, e a lista se renova
    expect(await list(user, T0 + 3000)).toEqual({ status: 200, body: { copies: [], paused: null } });
    expect(r2.list).toBe(1);
  });

  // Senão, alternar "restaurar um nome bem formado que não existe" com "abrir a lista" gastaria uma operação A por par, só com a rajada no
  // caminho, e esvaziaria as A do mês de todas as contas.
  it('com a lista guardada e válida, restaurar um nome que não está nela não pergunta ao R2 nem mexe na lista', async () => {
    const user = 'lista-nome-ausente';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    const listed = await list(user);
    const [opsA, opsB] = [await opsOf('A'), await opsOf('B')];
    const r2 = await countR2(user);
    expect(await restore(user, '2020-01-01', T0 + 1000)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(r2).toEqual({}); // nenhuma chamada ao R2
    expect(await list(user, T0 + 2000)).toEqual(listed); // a guardada, ainda válida
    expect([r2, await opsOf('A'), await opsOf('B')]).toEqual([{}, opsA, opsB]);
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

  // Revisão final (I1): uma recusa depois de reservar as duas operações B (o nome que sumiu da lista velha, too-big, write-budget, no-room)
  // não contava em nada, e uma conta só, na rajada, esvaziaria as B do mês de todas. Toda tentativa que chega ao R2 conta no dia, e as
  // restaurações que dão certo continuam com o teto delas.
  it('cada tentativa que chega ao R2 conta: passadas RESTORE_ATTEMPTS_PER_DAY, mesmo de not-found, a seguinte é 429 restore-limit sem tocar no R2', async () => {
    expect(RESTORE_ATTEMPTS_PER_DAY).toBe(10);
    const user = 'restaura-tentativas';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    // Nenhuma lista guardada ainda: cada nome que não existe vai ao R2 (as duas B) e volta 404.
    for (let i = 1; i <= RESTORE_ATTEMPTS_PER_DAY; i++) expect((await restore(user, '2020-01-01', T0 + i * 1000)).status).toBe(404);
    expect(await opsOf('B')).toBe(2 * RESTORE_ATTEMPTS_PER_DAY);
    const r2 = await countR2(user);
    expect(await restore(user, '2020-01-01', T0 + 20_000)).toEqual({ status: 429, body: { error: 'restore-limit' } });
    expect(await restore(user, dayOf(T0), T0 + 21_000)).toEqual({ status: 429, body: { error: 'restore-limit' } }); // a cópia que existe também
    expect([r2, await opsOf('B')]).toEqual([{}, 2 * RESTORE_ATTEMPTS_PER_DAY]);
    expect((await restore(user, dayOf(T0), T0 + DAY)).status).toBe(204); // o dia seguinte (UTC) tem vaga
  });

  // As conferências que não precisam do R2 vêm antes de ler a cópia (revisão final, I1): as linhas de hoje, pelo mínimo que a restauração
  // grava (cada sessão e cada solve ativo de agora ganha uma mudança, volte da cópia ou vá para a lixeira), e o espaço e a operação A da cópia
  // de antes, pelo tamanho da última cópia da conta. As de depois de ler a cópia continuam a autoridade.
  it('sem linhas hoje para o mínimo da restauração, sem espaço ou sem operação A para a cópia de antes: a recusa vem sem tocar no R2', async () => {
    const user = 'restaura-barata';
    await sync(user, [session, solve('a')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true); // guarda o tamanho da cópia, a estimativa da cópia de antes
    await sync(user, [solve('extra')]); // ativos agora: a sessão e dois solves
    const opsB = await opsOf('B');
    const r2 = await countR2(user);
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(3) + 1 });
    let account = await accountOf(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await accountOf(user)).toEqual(account);
    await setState(user, 'writes', { day: utcDay(T0), n: 0 });
    account = await accountOf(user);
    await seedUsed(ROOM - 10);
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 409, body: { error: 'no-room' } });
    await seedUsed(0);
    await seedOps('A', caps.classAMonth);
    expect(await restore(user, dayOf(T0), T0 + 3000)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect([r2, await opsOf('B'), await accountOf(user)]).toEqual([{}, opsB, account]);
    // Com espaço e operações, a mesma restauração passa.
    await seedOps('A', 0);
    expect((await restore(user, dayOf(T0), T0 + 4000)).status).toBe(204);
  });

  // Revisão final (I1 c): depois de ler a cópia, a conferência do tamanho é a do corte do sync (RECORDS_PER_DAY, o que um pedido grava num
  // dia com a compactação do alarme ao lado), não as linhas de um dia inteiro: uma de 4.748 mudanças passava e voltava 429 nos dias em que o
  // alarme já tinha rodado.
  it('depois de ler a cópia, mais mudanças que RECORDS_PER_DAY é 413 too-big; com RECORDS_PER_DAY, passa', async () => {
    const user = 'restaura-um-dia';
    await sync(user, [session, solve('a')]);
    await seedSolves(user, 2_000, 'y');
    await stubOf(user).snapshot(T0);
    await dropSolves(user, 'y');
    await seedSolves(user, 2_000);
    const extra = RECORDS_PER_DAY + 1 - (await restoreCount(user, dayOf(T0))); // cada solve ativo fora da cópia vai para a lixeira: uma mudança
    await seedSolves(user, extra, 'z');
    expect(await restoreCount(user, dayOf(T0))).toBe(RECORDS_PER_DAY + 1);
    expect(rowsOf(RECORDS_PER_DAY + 1)).toBeLessThanOrEqual(DAILY_WRITE_BUDGET); // nas linhas de um dia inteiro, cabia
    const account = await accountOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2.get).toBe(1);
    expect(await accountOf(user)).toEqual(account);
    await dropSolves(user, 'z', extra - 1);
    expect(await restoreCount(user, dayOf(T0))).toBe(RECORDS_PER_DAY);
    expect((await restore(user, dayOf(T0), T0 + 2000)).status).toBe(204);
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
    // Com as B, mas sem a operação A da cópia de antes: o mesmo 503, antes de ler a cópia (o tamanho da cópia do dia é a estimativa da de
    // antes), e nada fica reservado.
    await seedOps('B', 0);
    await seedOps('A', caps.classAMonth);
    const used = await storageUsed(env.DB); // a cópia do dia
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect([await storageUsed(env.DB), await opsOf('B'), r2.get]).toEqual([used, 0, undefined]);
    expect(await accountOf(user)).toEqual(account);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(T0))]);
    // Sem estimativa (uma conta que ainda não teve cópia), a ordem de antes: a cópia é lida, e a reserva da de antes recusa e devolve o espaço.
    await runInDurableObject(stubOf(user), (_o, state) => {
      const copies = JSON.parse(state.storage.sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'copies'").one().value) as object;
      state.storage.sql.exec("UPDATE state SET value = ? WHERE key = 'copies'", JSON.stringify({ ...copies, gz: null }));
    });
    expect(await restore(user, dayOf(T0), T0 + 3000)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect([await storageUsed(env.DB), await opsOf('B'), r2.get]).toEqual([used, 2, 1]);
    expect(await accountOf(user)).toEqual(account);
  });

  // O orçamento do dia conta linhas (Task 12): ROWS_PER_WRITE por gravação, mais as do estado (rowsOf).
  it('acima das linhas de um dia, 413 too-big; acima do que sobra hoje, 429 write-budget', async () => {
    const big = 'restaura-grande';
    await sync(big, [session, solve('a')]);
    // A cópia leva 2.600 solves que a conta depois perde (tirados direto do SQLite) e troca por outros 2.600: a conta fica abaixo de
    // RECORDS_PER_DAY registros, e restaurar o dia volta os da cópia e manda os de agora para a lixeira, mais linhas que as de um dia. É
    // a conferência das linhas que recusa, depois de ler a cópia.
    await seedSolves(big, 2_600, 'y');
    await stubOf(big).snapshot(T0);
    await dropSolves(big, 'y');
    await seedSolves(big, 2_600);
    expect(await recordCount(big)).toBeLessThanOrEqual(RECORDS_PER_DAY);
    const account = await accountOf(big);
    const r2 = await countR2(big);
    expect(await restore(big, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2.get).toBe(1); // a cópia foi lida: decidiram as linhas
    expect(await accountOf(big)).toEqual(account);
    expect(await objectsOf(big)).toEqual([snapshotKey(big, dayOf(T0))]);

    const small = 'restaura-orcamento';
    await sync(small, [session, solve('a')]);
    await stubOf(small).snapshot(T0);
    await sync(small, [solve('extra')]);
    const n = await restoreCount(small, dayOf(T0)); // a sessão e o solve a de novo, o extra para a lixeira e os ajustes da conta
    await setState(small, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(n) + 1 });
    const before = await accountOf(small);
    expect(await restore(small, dayOf(T0), T0 + 1000)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await accountOf(small)).toEqual(before);
    await setState(small, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(n) });
    expect((await restore(small, dayOf(T0), T0 + 2000)).status).toBe(204);
    expect(JSON.parse((await stateOf(small, 'writes'))!)).toEqual({ day: utcDay(T0), n: DAILY_WRITE_BUDGET }); // as gravações contam no dia
  });
});

// Os tamanhos que cabem (Task 12, na leitura de 30 s do limite de CPU dos Durable Objects): acima de SNAPSHOT_MAX_RECORDS registros, a
// cópia do dia não sai; acima de RESTORE_MAX_RECORDS, a restauração é recusada antes de ler o R2. As duas são vars do wrangler.jsonc, e
// uma var ausente ou torta vale 0: nenhuma cópia, nenhuma restauração.
describe('os tamanhos que cabem: a cópia e a restauração (Task 12)', () => {
  it('acima de SNAPSHOT_MAX_RECORDS a cópia do dia não sai e o sync diz paused "size"', async () => {
    const user = 'copia-tamanho';
    await sync(user, [session, solve('a')]);
    await seedSolves(user, caps.snapshotRecords - 1);
    expect(await recordCount(user)).toBe(caps.snapshotRecords + 1);
    expect(await stubOf(user).snapshot(T0)).toBe(false);
    expect(await objectsOf(user)).toEqual([]);
    expect(await stateOf(user, 'snapshotRev')).toBeNull(); // não marca: tenta de novo no dia seguinte
    expect([await storageUsed(env.DB), await opsOf('A')]).toEqual([0, 0]); // nem o espaço nem a operação A foram reservados
    expect((await sync(user, [])).copiesPaused).toBe('size');
    expect(await list(user)).toEqual({ status: 200, body: { copies: [], paused: 'size' } });
    // O alarme: não grava, continua pausado e marca o de amanhã.
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(await objectsOf(user)).toEqual([]);
    expect(await runInDurableObject(stubOf(user), (_o, state) => state.storage.getAlarm())).toBeGreaterThan(Date.now());
    expect((await sync(user, [])).copiesPaused).toBe('size');
  });

  it('acima de RESTORE_MAX_RECORDS, 413 too-big', async () => {
    const user = 'restaura-tamanho';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    await seedSolves(user, caps.restoreRecords - 1);
    expect(await recordCount(user)).toBe(caps.restoreRecords + 1);
    const account = await accountOf(user);
    const opsB = await opsOf('B');
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2).toEqual({}); // um COUNT só: nem o R2, nem a cópia aberta
    expect(await opsOf('B')).toBe(opsB); // nem as operações B do mês
    expect(await accountOf(user)).toEqual(account);
    // O COUNT confere o menor entre a var e RECORDS_PER_DAY (o que um pedido grava num dia com a compactação do alarme ao lado): no teto da
    // var, a conta também volta sem ler o R2.
    await dropSolves(user, 'x', caps.restoreRecords - 2);
    expect(await recordCount(user)).toBe(caps.restoreRecords);
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2).toEqual({});
    // Em RECORDS_PER_DAY registros, o COUNT passa e a cópia é lida; decide a conferência das mudanças, que contam também os ajustes da conta
    // (revisão final, I1 c: mais que RECORDS_PER_DAY é too-big). Com as mudanças em RECORDS_PER_DAY, a restauração cabe no dia.
    await dropSolves(user, 'x', RECORDS_PER_DAY - 2);
    expect(await recordCount(user)).toBe(RECORDS_PER_DAY);
    const over = (await restoreCount(user, dayOf(T0))) - RECORDS_PER_DAY;
    expect(over).toBeGreaterThan(0);
    expect(await restore(user, dayOf(T0), T0 + 3000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2.get).toBe(1);
    await dropSolves(user, 'x', RECORDS_PER_DAY - 2 - over);
    expect((await restore(user, dayOf(T0), T0 + 4000)).status).toBe(204);
    expect(r2.get).toBe(2);
  });

  it('sem as vars (ausentes ou tortas), nenhuma cópia sai ("size") e toda restauração é 413 too-big, sem perguntar ao R2', async () => {
    const user = 'tamanhos-sem-vars';
    await sync(user, [session, solve('a')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true); // com as vars do wrangler.jsonc, a cópia sai
    await sync(user, [solve('b')]);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      for (const bad of [undefined, '', '0', '55k']) {
        await setVars(user, { SNAPSHOT_MAX_RECORDS: bad, RESTORE_MAX_RECORDS: bad });
        const r2 = await countR2(user);
        expect(await stubOf(user).snapshot(T0 + DAY), String(bad)).toBe(false);
        expect(await restore(user, dayOf(T0), T0 + DAY), String(bad)).toEqual({ status: 413, body: { error: 'too-big' } });
        expect(r2, String(bad)).toEqual({});
        expect((await sync(user, [])).copiesPaused, String(bad)).toBe('size');
      }
      const logged = out.mock.calls.flat().map(String);
      expect(logged).toContain(JSON.stringify({ evt: 'cap-missing', name: 'SNAPSHOT_MAX_RECORDS' }));
      expect(logged).toContain(JSON.stringify({ evt: 'cap-missing', name: 'RESTORE_MAX_RECORDS' }));
    } finally {
      out.mockRestore();
    }
    // Com um teto em que a conta cabe (3 registros), a cópia volta, a pausa sai, e a restauração passa.
    await setVars(user, { SNAPSHOT_MAX_RECORDS: '3', RESTORE_MAX_RECORDS: '3' });
    expect(await stubOf(user).snapshot(T0 + DAY)).toBe(true);
    expect((await sync(user, [])).copiesPaused).toBeNull();
    expect((await restore(user, dayOf(T0), T0 + DAY + 1000)).status).toBe(204);
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

// Revisão final (resíduo, I1): o COUNT do tamanho da conta percorria a tabela inteira, antes de qualquer teto da restauração; a restauração
// não olhava o orçamento de leituras; e, contado nele, um punhado de restaurações recusadas numa conta grande travava o sync do dia. O COUNT
// para em (o limite em uso) + 1, e a restauração recusa com restore-limit antes dele quando o orçamento de leituras do dia acabou.
describe('a contagem limitada do tamanho da conta', () => {
  // As linhas que o SQLite do objeto de `user` leu nas consultas aos registros (o rowsRead de cada cursor, o que o grátis conta), desde agora.
  // Fora, a da compactação do alarme (um trabalho à parte dele, com o próprio teto).
  async function rowsRead(user: string): Promise<() => number> {
    const cursors: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      o.sql = new Proxy(real, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          return (query: string, ...bindings: unknown[]) => {
            const cursor = target.exec(query, ...(bindings as SqlStorageValue[]));
            if (/FROM records\b/.test(query) && query !== COMPACTABLE) cursors.push(cursor);
            return cursor;
          };
        },
      });
    });
    return () => cursors.reduce((sum, c) => sum + c.rowsRead, 0);
  }
  const most = Math.min(caps.restoreRecords, RECORDS_PER_DAY); // o tamanho que a restauração aceita

  it('pausada pelo tamanho, a cópia do alarme lê no máximo SNAPSHOT_MAX_RECORDS + 1 linhas', async () => {
    const user = 'tamanho-pausado-limitado';
    await sync(user, [session, solve('a')]);
    await seedSolves(user, 2 * caps.snapshotRecords);
    const read = await rowsRead(user);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(read()).toBeGreaterThan(0);
    expect(read()).toBeLessThanOrEqual(caps.snapshotRecords + 1);
    expect((await sync(user, [])).copiesPaused).toBe('size');
  });

  it('a restauração recusada de uma conta grande lê no máximo o limite + 1; passado o orçamento de leituras, restore-limit sem ler nada', async () => {
    const user = 'restaura-grande-limitada';
    await setState(user, 'userId', user);
    await seedSolves(user, 3 * most);
    const read = await rowsRead(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(read()).toBeLessThanOrEqual(most + 1);
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET });
    const before = read();
    const r2 = await countR2(user);
    for (let i = 2; i <= 4; i++) expect(await restore(user, dayOf(T0), T0 + i * 1000)).toEqual({ status: 429, body: { error: 'restore-limit' } });
    expect([read(), r2]).toEqual([before, {}]);
  });

  it('umas restaurações recusadas numa conta grande não travam o sync dela pelo orçamento de leituras', async () => {
    const user = 'restaura-grande-sync';
    await setState(user, 'userId', user);
    await seedSolves(user, 3 * most);
    const taps = 5;
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - taps * (most + 1) - 1 });
    for (let i = 1; i <= taps; i++) expect((await restore(user, dayOf(T0), T0 + i * 1000)).status).toBe(413);
    const res = await sync(user, []);
    expect(res.readsDeferred).toBeUndefined();
    expect(res.changes.length).toBeGreaterThan(0);
  });
});
