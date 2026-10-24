// As cópias na nuvem dentro do grátis do R2 (endurecimento 4.2, decisões 1 e 3): o teto do espaço das cópias, as operações do R2 por mês
// (A: gravar e listar; B: ler), a lista guardada por alguns minutos e as restaurações por dia. O espaço e as operações são semeados direto
// no D1 (r2_storage e r2_ops); o teto de cada um é o do wrangler.jsonc (o beta), o mesmo que o objeto da conta lê. As cópias saem por
// stub.snapshot(T0), não pelo alarme: o mês das operações é o de T0, qualquer que seja o dia em que os testes rodam.
import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyChanges, type RecordView } from '../../src/core/sync/apply';
import { sessionOfChange } from '../../src/core/sync/records';
import { restoreChanges } from '../../src/core/sync/restore';
import { assembleCopy, isManifest, sliceOf, type CopyManifest, type CopyPart } from '../../src/core/sync/copy-parts';
import { accountPrefsOf, exportFromRecords } from '../../src/core/sync/snapshot';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, syncKey, type Change, type CloudCopies, type SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { storageUsed } from '../../worker/budget';
import type { Env } from '../../worker/env';
import {
  BIG_COPY_EVERY_DAYS,
  capsOf,
  COPIES_CACHE_MS,
  COPY_PART_READS_PER_DAY,
  COPY_PART_RECORDS,
  COPY_READS_EXTRA,
  DAILY_READ_BUDGET,
  DAILY_WRITE_BUDGET,
  RECORDS_PER_DAY,
  recordsPerDay,
  RESTORE_ATTEMPTS_PER_DAY,
  RESTORE_READS_EXTRA,
  RESTORES_PER_DAY,
  rowsOf,
  STORAGE_HEADROOM,
  utcDay,
  copyShareOf,
  COPY_KEEP_DAYS,
  utcMonth,
} from '../../worker/limits';
import { COMPACTABLE, COUNT_RECORDS, PAGE_AFTER, RANGE_AFTER, rowToChange, SLICE_PAGE, type Row } from '../../worker/records-sql';
import { copySlot, dayOf, daySlot, gunzipJson, gzipJson, partKey, preRestoreName, snapshotKey, snapshotPrefix } from '../../worker/snapshots';
import { call, ORIGIN, postJson, setState, stateOf, stubOf, T0, testDeps } from './helpers';

const DAY = 86_400_000;
const MONTH = utcMonth(T0);
// A cópia grande sai no dia dela (copySlot, a revisão final I5 c), ou passados 2 × BIG_COPY_EVERY_DAYS − 1 dias da última. Os testes que
// precisam da cópia grande em T0 partem de uma última cópia de muito tempo atrás (LONG_AGO): a vez dela, qualquer que seja o dia.
const LONG_AGO = dayOf(T0 - 2 * BIG_COPY_EVERY_DAYS * DAY);
// Um id de conta cujo dia da cópia grande é o dia de `t`: com ele, a cópia sai em `t` e de 7 em 7 dias depois.
const onSlot = (name: string, t = T0): string => {
  for (let i = 0; ; i++) {
    const id = i === 0 ? name : `${name}-${i}`;
    if (copySlot(id) === daySlot(dayOf(t))) return id;
  }
};
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
// O app de antes manda {}; `body` é o corpo do pedido de restaurar.
const restore = async (user: string, name: string, now: number, body: unknown = {}): Promise<{ status: number; body: unknown }> => {
  const res = await call(`/api/snapshots/${name}/restore`, postJson(body, { [ACCOUNT_HEADER]: user }), { deps: testDeps({ user, now: () => now }) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};
// O app novo: diz que restaura no aparelho o que o servidor não grava hoje (spec das cópias grandes, seção 5).
const restoreDevice = (user: string, name: string, now: number) => restore(user, name, now, { device: true });
// Uma parte da cópia `name` pelo Worker (o índice 0 é o objeto da cópia), com a conta que o aparelho espera.
const part = (user: string, name: string, index: number | string, now = T0, headers: Record<string, string> = { [ACCOUNT_HEADER]: user }): Promise<Response> =>
  call(`/api/snapshots/${name}/parts/${index}`, { headers }, { deps: testDeps({ user, now: () => now }) });

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
    state: state.storage.sql.exec("SELECT key, value FROM state WHERE key NOT IN ('copies', 'attempts', 'reads', 'readsGranted') ORDER BY key").toArray(),
  }));
// Quantas mudanças restaurar a cópia `name` daria agora (restoreChanges, como o objeto faz, com a conta inteira lida do SQLite dele).
async function restoreCount(user: string, name: string): Promise<number> {
  const object = await env.SNAPSHOTS.get(snapshotKey(user, name));
  const copy = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
  const current = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<Row>('SELECT * FROM records').toArray().map(rowToChange));
  const practice = Array.isArray(copy.practice) ? copy.practice : null;
  const duels = Array.isArray(copy.duels) ? copy.duels : null;
  return restoreChanges(current, { sessions: copy.sessions, solves: copy.solves, practice, duels }, accountPrefsOf(copy.profile, current), T0 + DAY).length;
}
const objectsOf = async (user: string): Promise<string[]> => (await env.SNAPSHOTS.list({ prefix: snapshotPrefix(user) })).objects.map((o) => o.key);
// As linhas do teto do ambiente no D1, no dia UTC de `t`.
const dayRows = async (t: number): Promise<number> =>
  (await env.DB.prepare('SELECT count FROM rows_day WHERE day = ?').bind(utcDay(t)).first<{ count: number }>())?.count ?? 0;
// As linhas lidas no dia que o objeto de `user` contou (o orçamento de leituras: as do estado mais as que ainda estão na memória).
const readsCounted = (user: string, now: number): Promise<number> =>
  runInDurableObject(stubOf(user), (instance) => (instance as unknown as { readsOf(t: number): { n: number } }).readsOf(now).n);

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

  it('cada conta tem uma parte do espaço: acima dela, só as cópias dela pausam (a auditoria de segurança, NV-5)', async () => {
    const [heavy, light] = ['copia-parte-a', 'copia-parte-b'];
    for (const user of [heavy, light]) await sync(user, [session, solve('a')]);
    const share = copyShareOf(caps.snapshotBytes);
    await setState(heavy, 'copyBytes', [{ day: utcDay(T0 - 86_400_000), bytes: share }]); // as cópias dela do mês já ocupam a parte
    expect(await stubOf(heavy).snapshot(T0)).toBe(false);
    expect(await objectsOf(heavy)).toEqual([]);
    expect((await sync(heavy, [])).copiesPaused).toBe('space');
    expect(await stubOf(light).snapshot(T0)).toBe(true); // a outra conta segue
    // Depois de 30 dias, a regra do bucket apagou aquelas cópias: a parte volta, e a cópia gravada entra na conta.
    const later = T0 + COPY_KEEP_DAYS * 86_400_000;
    expect(await stubOf(heavy).snapshot(later)).toBe(true);
    const kept = JSON.parse((await stateOf(heavy, 'copyBytes')) as string) as { day: string; bytes: number }[];
    expect(kept).toEqual([{ day: utcDay(later), bytes: expect.any(Number) }]);
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

  // O acabamento (A3): a cópia de um arquivo só reserva o espaço antes do put. Um put que falha devolve o espaço na hora (antes, ele ficava
  // reservado até a recontagem do Cron) e o erro segue para quem chamou (o alarme o pega); a operação A fica contada, como nas partes.
  it('um put que falha na cópia de um arquivo só devolve o espaço reservado, e o erro segue', async () => {
    const user = 'copia-put-falha';
    await sync(user, [session, solve('a')]);
    await seedUsed(1000);
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { env: Env };
      const failing = new Proxy(o.env.SNAPSHOTS, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (typeof value !== 'function') return value;
          if (key === 'put') return async () => Promise.reject(new Error('R2: falha no put'));
          return (value as (...a: unknown[]) => unknown).bind(target);
        },
      });
      o.env = { ...o.env, SNAPSHOTS: failing };
    });
    const failed = await stubOf(user).snapshot(T0).then(() => null, (error: unknown) => error);
    expect(String(failed)).toContain('R2: falha no put');
    expect(await objectsOf(user)).toEqual([]);
    expect(await storageUsed(env.DB)).toBe(1000); // o espaço da cópia voltou
    expect(await opsOf('A')).toBe(1); // a do put fica contada (a lista, depois dele, nem chegou)
    expect(await stateOf(user, 'snapshotRev')).toBeNull();
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
    const first = { name: dayOf(T0), day: dayOf(T0), kind: 'daily', solves: 1, parts: 0 };
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

  // As conferências que não precisam do R2 vêm antes de ler a cópia (revisão final, I1): o espaço e a operação A da cópia de antes, pelo
  // tamanho da última cópia da conta. As linhas de hoje dependem das mudanças, que só se sabem depois de ler a cópia (spec das cópias
  // grandes, seção 3): sem lugar para elas, a recusa vem depois do get, sem a cópia de antes e sem gravar nada.
  it('sem espaço ou sem operação A para a cópia de antes, a recusa vem sem tocar no R2; sem linhas hoje para as mudanças, depois de ler a cópia', async () => {
    const user = 'restaura-barata';
    await sync(user, [session, solve('a')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true); // guarda o tamanho da cópia, a estimativa da cópia de antes
    await sync(user, [solve('extra')]); // uma mudança: o extra vai para a lixeira
    const opsB = await opsOf('B');
    const r2 = await countR2(user);
    let account = await accountOf(user);
    await seedUsed(ROOM - 10);
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 409, body: { error: 'no-room' } });
    await seedUsed(0);
    await seedOps('A', caps.classAMonth);
    expect(await restore(user, dayOf(T0), T0 + 3000)).toEqual({ status: 503, body: { error: 'r2-budget' } });
    expect([r2, await opsOf('B'), await accountOf(user)]).toEqual([{}, opsB, account]);
    await seedOps('A', 0);
    // A uma linha de a mudança caber hoje: a cópia é lida, e nada mais (nem a cópia de antes, nem a gravação).
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(1) + 1 });
    account = await accountOf(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect([r2.get, r2.head, r2.put]).toEqual([1, undefined, undefined]);
    expect(await accountOf(user)).toEqual(account);
    // Com lugar para ela, a mesma restauração passa.
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(1) });
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
    // A cópia leva pouco mais da metade do dia útil do ambiente em solves, que a conta depois perde (tirados direto do SQLite) e troca por
    // outros tantos: a conta fica abaixo do dia útil, e restaurar o dia volta os da cópia e manda os de agora para a lixeira, mais que um
    // dia. É a conferência das linhas que recusa, depois de ler a cópia.
    const day = recordsPerDay(capsOf(env as unknown as Env).rowsDay);
    const half = Math.ceil(day * 0.55);
    await seedSolves(big, half, 'y');
    await stubOf(big).snapshot(T0);
    await dropSolves(big, 'y');
    await seedSolves(big, half);
    expect(await recordCount(big)).toBeLessThanOrEqual(day);
    const account = await accountOf(big);
    const r2 = await countR2(big);
    expect(await restore(big, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(r2.get).toBe(1); // a cópia foi lida: decidiram as linhas
    expect(await accountOf(big)).toEqual(account);
    expect(await objectsOf(big)).toEqual([snapshotKey(big, dayOf(T0))]);

    const small = 'restaura-orcamento';
    await sync(small, [session, solve('a')]);
    await stubOf(small).snapshot(T0);
    // A restauração só grava o que muda: a sessão e o solve a, editados depois da cópia, voltam; o extra vai para a lixeira. Três mudanças,
    // e as linhas do dia ficam no limite exato delas.
    await sync(small, [solve('extra'), { ...solve('a', 2000), updatedAt: T0 + 50 }, { ...session, data: { ...session.data as object, name: 'Renomeada' }, updatedAt: T0 + 50 }]);
    const n = await restoreCount(small, dayOf(T0)); // a sessão e o solve a de novo e o extra para a lixeira
    expect(n).toBe(3);
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
// cópia do dia não sai; acima de RESTORE_MAX_RECORDS mudanças (spec das cópias grandes: as da restauração, não os registros da conta), o
// servidor não restaura, e só sabe depois de ler a cópia. As duas são vars do wrangler.jsonc, e uma var ausente ou torta vale 0: nenhuma
// cópia, nenhuma restauração (essa, sem perguntar ao R2).
describe('os tamanhos que cabem: a cópia e a restauração (Task 12)', () => {
  const SMALL_CAP = '50'; // o SNAPSHOT_MAX_RECORDS de um teste que precisa passar dele sem semear 150 mil registros
  it('acima de SNAPSHOT_MAX_RECORDS a cópia do dia não sai e o sync diz paused "size"', async () => {
    const user = 'copia-tamanho';
    await sync(user, [session, solve('a')]);
    await setVars(user, { SNAPSHOT_MAX_RECORDS: SMALL_CAP }); // o teto de verdade (150 mil) pede uma conta enorme: um pequeno, só neste objeto
    await seedSolves(user, Number(SMALL_CAP) - 1);
    expect(await recordCount(user)).toBe(Number(SMALL_CAP) + 1);
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

  it('acima de RESTORE_MAX_RECORDS mudanças, 413 too-big depois de ler a cópia; com RESTORE_MAX_RECORDS, passa; o tamanho da conta não decide', async () => {
    const user = 'restaura-tamanho';
    await sync(user, [session, solve('a'), solve('gone')]);
    await stubOf(user).snapshot(T0);
    await setVars(user, { RESTORE_MAX_RECORDS: '10' }); // um teto pequeno, só neste objeto
    // A restauração só conta o que muda. Depois da cópia, a sessão e o solve a são editados (voltam: 2 mudanças) e o `gone` some da conta,
    // direto no SQLite (volta: 1 mudança): com 8 `x` semeados (uma mudança cada, para a lixeira), 11.
    await sync(user, [{ ...solve('a', 2000), updatedAt: T0 + 50 }, { ...session, data: { ...session.data as object, name: 'Renomeada' }, updatedAt: T0 + 50 }]);
    await runInDurableObject(stubOf(user), (_o, state) => {
      state.storage.sql.exec("DELETE FROM records WHERE store = 'solves' AND id = 'gone'");
    });
    await seedSolves(user, 8);
    expect(await restoreCount(user, dayOf(T0))).toBe(11);
    const account = await accountOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect([r2.get, r2.head, r2.put]).toEqual([1, undefined, undefined]); // a cópia foi lida; nem a cópia de antes
    expect(await accountOf(user)).toEqual(account);
    // No teto da var, cabe.
    await dropSolves(user, 'x', 7);
    expect(await restoreCount(user, dayOf(T0))).toBe(10);
    expect((await restore(user, dayOf(T0), T0 + 2000)).status).toBe(204);

    // Uma conta muito maior que a var, com uma mudança só, também passa: a var conta as mudanças, não os registros.
    const big = 'restaura-tamanho-conta-grande';
    await sync(big, [session, solve('a')]);
    await seedSolves(big, 40);
    await stubOf(big).snapshot(T0);
    await setVars(big, { RESTORE_MAX_RECORDS: '10' });
    await sync(big, [solve('novo')]);
    expect(await recordCount(big)).toBeGreaterThan(10);
    expect((await restore(big, dayOf(T0), T0 + 1000)).status).toBe(204);
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

// A cópia em partes (spec das cópias grandes, seção 4): acima de COPY_PART_RECORDS registros, a cópia sai em partes de COPY_PART_RECORDS
// registros, na ordem das chaves, e o manifesto, gravado por último, é a cópia na lista; uma conta grande (acima do dia útil) copia só a cada
// BIG_COPY_EVERY_DAYS dias. No ambiente dos testes o teto de linhas do dia está em 1e9, então o dia útil é o da conta (4.747): uma conta de
// 5.001 registros é grande (semanal) e vai em partes. Os registros vêm direto no SQLite do objeto (seedSolves), sem milhares de pedidos.
describe('a cópia em partes e a cada 7 dias numa conta grande', () => {
  const bigDay = recordsPerDay(caps.rowsDay); // acima disto a conta é grande
  const prefsAna: Change = { store: 'prefs', id: 'duelName', data: 'Ana', updatedAt: T0, deletedAt: null, deletionStamp: T0 };

  // Uma conta de `n` registros: a sessão s1, o solve a e os x1.. semeados. `extra` entra no total. A última cópia foi há muito tempo
  // (LONG_AGO): grande, ela copia em qualquer dia; `fresh`, nenhuma cópia ainda.
  async function accountWith(user: string, n: number, extra: Change[] = [], fresh = false): Promise<void> {
    await sync(user, [session, solve('a'), ...extra]);
    await seedSolves(user, n - 2 - extra.length);
    if (!fresh) await setState(user, 'lastSnapshotDay', LONG_AGO);
    expect(await recordCount(user)).toBe(n);
  }
  const readGz = async <T>(key: string): Promise<T> => (await gunzipJson(await (await env.SNAPSHOTS.get(key))!.arrayBuffer())) as T;
  // O tamanho de tudo o que há no R2 da conta, as partes inclusive (a lista sem delimitador).
  const bytesOf = async (user: string): Promise<number> => (await env.SNAPSHOTS.list({ prefix: snapshotPrefix(user) })).objects.reduce((sum, o) => sum + o.size, 0);
  // A chave do registro `offset` (de 0) na ordem da tabela, sem os ajustes (que a cópia não pagina).
  const keyAt = (user: string, offset: number): Promise<[string, string]> =>
    runInDurableObject(stubOf(user), (_o, state) => {
      const r = state.storage.sql.exec<{ store: string; id: string }>("SELECT store, id FROM records WHERE store <> 'prefs' ORDER BY store, id LIMIT 1 OFFSET ?", offset).one();
      return [r.store, r.id] as [string, string];
    });
  const manifestOf = async (user: string, name: string): Promise<CopyManifest> => {
    const m = await readGz<unknown>(snapshotKey(user, name));
    expect(isManifest(m)).toBe(true);
    return m as CopyManifest;
  };
  const partsOf = async (user: string, name: string, m: CopyManifest): Promise<CopyPart[]> =>
    Promise.all(m.parts.map((_p, i) => readGz<CopyPart>(partKey(user, name, i + 1))));

  it('conta com mais de COPY_PART_RECORDS: partes de 5.000 e o manifesto, na lista como uma cópia', async () => {
    const user = 'partes-lista';
    await accountWith(user, COPY_PART_RECORDS + 1);
    expect(COPY_PART_RECORDS + 1).toBeGreaterThan(bigDay); // grande: sai em partes e semanal, a primeira vez sem esperar
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const day = dayOf(T0);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, day), partKey(user, day, 1), partKey(user, day, 2)]);

    const m = await manifestOf(user, day);
    expect([m.format, m.version, m.exportedAt, m.day, m.solves]).toEqual(['klick-parts', 1, T0, day, COPY_PART_RECORDS]);
    expect(m.profile).toEqual(exportFromRecords([], T0).profile);
    expect(m.parts).toEqual([
      { last: await keyAt(user, COPY_PART_RECORDS - 1), records: COPY_PART_RECORDS },
      { last: await keyAt(user, COPY_PART_RECORDS), records: 1 },
    ]);
    // Os metadados do manifesto (a lista os lê) trazem os solves ativos e as partes; a parte, nenhum.
    expect((await env.SNAPSHOTS.head(snapshotKey(user, day)))!.customMetadata).toEqual({ kind: 'daily', day, solves: String(COPY_PART_RECORDS), parts: '2' });
    expect((await env.SNAPSHOTS.head(partKey(user, day, 1)))!.customMetadata ?? {}).toEqual({});
    const whole = assembleCopy(m, await partsOf(user, day, m));
    expect([whole.sessions.length, whole.solves.length]).toEqual([1, COPY_PART_RECORDS]);
    expect(new Set(whole.solves.map((s) => s.id)).size).toBe(COPY_PART_RECORDS);

    expect(await list(user)).toEqual({ status: 200, body: { copies: [{ name: day, day, kind: 'daily', solves: COPY_PART_RECORDS, parts: 2 }], paused: null } });
    expect(await stateOf(user, 'lastSnapshotDay')).toBe(day);
    expect(await stateOf(user, 'snapshotRev')).not.toBeNull();
  });

  it('as páginas particionam as chaves: a parte acaba na última linha do SQL, mesmo a que a cópia não leva', async () => {
    const user = 'partes-particao';
    await accountWith(user, COPY_PART_RECORDS + 103, [prefsAna]); // 5.102 sem o ajuste: a parte 1 e 102 na 2
    const lastOfFirst = await keyAt(user, COPY_PART_RECORDS - 1);
    await runInDurableObject(stubOf(user), (_o, state) => {
      const sql = state.storage.sql;
      // A última linha da primeira página vira marca compactada (a cópia não a leva), e outro solve vai para a lixeira, com conteúdo.
      sql.exec("UPDATE records SET data = '{}', deleted_at = ? WHERE store = ? AND id = ?", T0, ...lastOfFirst);
      sql.exec("UPDATE records SET deleted_at = ? WHERE store = 'solves' AND id = 'x100'", T0);
    });
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const day = dayOf(T0);
    const m = await manifestOf(user, day);
    expect(m.parts).toEqual([
      { last: lastOfFirst, records: COPY_PART_RECORDS },
      { last: await keyAt(user, COPY_PART_RECORDS + 101), records: 102 },
    ]);
    expect(m.profile?.duelName).toBe('Ana');
    const parts = await partsOf(user, day, m);
    expect(parts[0].solves.length).toBe(COPY_PART_RECORDS - 2); // sem a sessão e sem a marca compactada
    expect(parts[0].solves.some((s) => s.id === lastOfFirst[1])).toBe(false);
    expect(parts[1].solves.length).toBe(102);
    // 5.103 solves (a, x1..x5101 menos o que é sessão): ativos, sem a marca e sem o da lixeira.
    const solves = COPY_PART_RECORDS + 103 - 1 /* a sessão */ - 1 /* o ajuste */ - 2;
    expect((await env.SNAPSHOTS.head(snapshotKey(user, day)))!.customMetadata!.solves).toBe(String(solves));
    // As faixas do manifesto (sliceOf), lidas por RANGE_AFTER, são as partes: é o que a restauração (Task 4) vai ler.
    for (let i = 0; i < m.parts.length; i++) {
      const { lo, hi } = sliceOf(m, i);
      const ids = await runInDurableObject(stubOf(user), (_o, state) =>
        state.storage.sql
          .exec<Row>(RANGE_AFTER, ...(lo ?? ['', '']), ...(hi ?? ['￿', '']), 100_000)
          .toArray()
          .map((r) => `${r.store}/${r.id}`),
      );
      expect(ids.length).toBe(m.parts[i].records);
      const inPart = [...parts[i].sessions, ...parts[i].solves].map((r) => `${'order' in r ? 'sessions' : 'solves'}/${r.id}`);
      expect(inPart.every((k) => ids.includes(k))).toBe(true);
    }
  });

  it('PAGE_AFTER pula os ajustes, segue a ordem das chaves e para em LIMIT; RANGE_AFTER fecha a faixa em <=', async () => {
    const user = 'partes-sql';
    await sync(user, [session, solve('a'), solve('b'), solve('c'), prefsAna]);
    const rows = await runInDurableObject(stubOf(user), (_o, state) => {
      const sql = state.storage.sql;
      const keys = (q: string, ...b: SqlStorageValue[]) => sql.exec<Row>(q, ...b).toArray().map((r) => `${r.store}/${r.id}`);
      return {
        all: keys(PAGE_AFTER, '', '', 100),
        after: keys(PAGE_AFTER, 'sessions', 's1', 100),
        limited: keys(PAGE_AFTER, '', '', 2),
        range: keys(RANGE_AFTER, 'sessions', 's1', 'solves', 'b', 100),
      };
    });
    expect(rows.all).toEqual(['sessions/s1', 'solves/a', 'solves/b', 'solves/c']);
    expect(rows.after).toEqual(['solves/a', 'solves/b', 'solves/c']);
    expect(rows.limited).toEqual(['sessions/s1', 'solves/a']);
    expect(rows.range).toEqual(['solves/a', 'solves/b']);
  });

  // A revisão final (M7): apagar a conta lista o prefixo dela sem delimitador, e as pastas das partes (snap/<conta>/<nome>/) vão junto.
  it('apagar a conta leva também as pastas das partes', async () => {
    const user = 'partes-apagar-conta';
    await accountWith(user, COPY_PART_RECORDS + 1);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(T0)), partKey(user, dayOf(T0), 1), partKey(user, dayOf(T0), 2)]);
    const res = await call('/api/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', [ACCOUNT_HEADER]: user },
      body: JSON.stringify({ email: `${user}@exemplo.com` }),
    }, { deps: testDeps({ user }) });
    expect(res.status).toBe(204);
    expect(await objectsOf(user)).toEqual([]);
  });

  it('a cópia em partes lê só páginas de COPY_PART_RECORDS, nunca a conta inteira de uma vez', async () => {
    const user = 'partes-memoria';
    await accountWith(user, 2 * COPY_PART_RECORDS + 1);
    const queries: string[] = [];
    const pages: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      o.sql = new Proxy(real, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          return (query: string, ...bindings: unknown[]) => {
            queries.push(query);
            const cursor = target.exec(query, ...(bindings as SqlStorageValue[]));
            if (query === PAGE_AFTER) pages.push(cursor);
            return cursor;
          };
        },
      });
    });
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(queries).not.toContain('SELECT * FROM records');
    // Três páginas (5.000, 5.000 e 1), e cada uma lê o que devolve, mais a linha em que o SQLite confere que o LIMIT acabou.
    expect(pages).toHaveLength(3);
    for (const p of pages) expect(p.rowsRead).toBeLessThanOrEqual(COPY_PART_RECORDS + 1);
  });

  it('cada parte reserva o espaço e uma operação A; o manifesto também', async () => {
    const user = 'partes-reserva';
    await accountWith(user, COPY_PART_RECORDS + 1);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(await opsOf('A')).toBe(3); // as duas partes e o manifesto
    expect(await storageUsed(env.DB)).toBe(await bytesOf(user)); // o espaço de cada objeto, somado
    expect(JSON.parse((await stateOf(user, 'copies'))!)).toMatchObject({ gz: await bytesOf(user), paused: null }); // a estimativa da próxima
  });

  it('espaço ou operação recusados na parte k: nenhuma parte fica, o espaço volta, a cópia pausa', async () => {
    // O tamanho de cada objeto de uma cópia igual, numa conta de outro nome (o conteúdo das partes não leva o nome).
    await accountWith('partes-medida', COPY_PART_RECORDS + 1);
    expect(await stubOf('partes-medida').snapshot(T0)).toBe(true);
    const part1 = (await env.SNAPSHOTS.head(partKey('partes-medida', dayOf(T0), 1)))!.size;
    await env.DB.batch([env.DB.prepare('DELETE FROM r2_ops'), env.DB.prepare('DELETE FROM r2_storage')]);

    // Espaço: a parte 1 cabe e a 2 não (o espaço vem antes da operação, que a 2 não gasta).
    const space = 'partes-sem-espaco';
    await accountWith(space, COPY_PART_RECORDS + 1);
    await seedUsed(ROOM - part1 - 5);
    expect(await stubOf(space).snapshot(T0)).toBe(false);
    expect(await objectsOf(space)).toEqual([]); // a parte 1 foi apagada
    expect(await storageUsed(env.DB)).toBe(ROOM - part1 - 5); // o espaço dela voltou
    expect(await opsOf('A')).toBe(3); // as operações das duas partes e do manifesto, reservadas antes, ficam contadas (a mais, nunca a menos)
    expect(await stateOf(space, 'snapshotRev')).toBeNull();
    expect(await stateOf(space, 'lastSnapshotDay')).toBe(LONG_AGO); // não muda
    expect((await sync(space, [])).copiesPaused).toBe('space');
    expect(await list(space)).toEqual({ status: 200, body: { copies: [], paused: 'space' } });

    // Operações: as N + 1 (as partes e o manifesto) saem de uma vez, antes de gravar (I3): sem a da parte 2 (k = 2) ou, em outra conta, sem
    // a do manifesto (k = N + 1), nada vai ao R2 e nada fica contado.
    for (const [user, left] of [['partes-sem-op-2', 1], ['partes-sem-op-manifesto', 2]] as const) {
      await env.DB.batch([env.DB.prepare('DELETE FROM r2_ops'), env.DB.prepare('DELETE FROM r2_storage')]);
      await accountWith(user, COPY_PART_RECORDS + 1);
      await seedOps('A', caps.classAMonth - left);
      const r2 = await countR2(user);
      expect(await stubOf(user).snapshot(T0), user).toBe(false);
      expect([r2.put, r2.delete], user).toEqual([undefined, undefined]); // nenhuma parte gravada (nem apagada)
      expect(await objectsOf(user), user).toEqual([]);
      expect(await storageUsed(env.DB), user).toBe(0);
      expect(await opsOf('A'), user).toBe(caps.classAMonth - left);
      expect(await stateOf(user, 'snapshotRev'), user).toBeNull();
      expect((await sync(user, [])).copiesPaused, user).toBe('ops');
    }
    // Com espaço e operações de novo, a mesma conta copia inteira.
    await env.DB.batch([env.DB.prepare('DELETE FROM r2_ops'), env.DB.prepare('DELETE FROM r2_storage')]);
    expect(await stubOf('partes-sem-op-2').snapshot(T0)).toBe(true);
    expect(await objectsOf('partes-sem-op-2')).toHaveLength(3);
    expect((await sync('partes-sem-op-2', [])).copiesPaused).toBeNull();
  });

  it('a recusa que falha depois de devolver o espaço não o devolve de novo no catch', async () => {
    await accountWith('partes-medida-2', COPY_PART_RECORDS + 1);
    expect(await stubOf('partes-medida-2').snapshot(T0)).toBe(true);
    const part1 = (await env.SNAPSHOTS.head(partKey('partes-medida-2', dayOf(T0), 1)))!.size;
    await env.DB.batch([env.DB.prepare('DELETE FROM r2_ops'), env.DB.prepare('DELETE FROM r2_storage')]);
    const user = 'partes-devolve-uma-vez';
    await accountWith(user, COPY_PART_RECORDS + 1);
    await seedUsed(ROOM - part1 - 5); // a parte 1 cabe e a 2 não
    // A estimativa (`copies`) que a recusa grava falha uma vez, depois de apagar a parte 1 e devolver o espaço dela.
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      let armed = true;
      o.sql = new Proxy(real, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          return (query: string, ...bindings: unknown[]) => {
            if (armed && query.startsWith('INSERT INTO state') && bindings[0] === 'copies') {
              armed = false;
              throw new Error('SQLite: falha');
            }
            return target.exec(query, ...(bindings as SqlStorageValue[]));
          };
        },
      });
    });
    const failed = await stubOf(user).snapshot(T0).then(() => null, (error: unknown) => error); // o erro passa por quem chamou
    expect(String(failed)).toContain('SQLite: falha');
    expect(await objectsOf(user)).toEqual([]);
    expect(await storageUsed(env.DB)).toBe(ROOM - part1 - 5); // devolvido uma vez só
  });

  it('a cópia em partes vai para o log com as partes e o tempo de relógio; a restauração também leva o tempo', async () => {
    const user = 'partes-log';
    await accountWith(user, COPY_PART_RECORDS + 1);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(await stubOf(user).snapshot(T0)).toBe(true);
      expect((await restore(user, dayOf(T0), T0 + 1000)).status).toBe(204);
      const logged = out.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      expect(logged).toContainEqual({ evt: 'copy', user, kind: 'daily', parts: 2, ms: expect.any(Number) });
      expect(logged).toContainEqual({ evt: 'restore', user, outcome: 'ok', ms: expect.any(Number) });
    } finally {
      out.mockRestore();
    }
  });

  // A revisão final (I4): um erro no meio da cópia (o R2 que falha num put) não sai do alarme. Lançado, o runtime repetiria o alarme, e cada
  // repetição regravaria as partes; ele vai para o log, o alarme de amanhã é marcado, e a cópia espera a próxima vez dela (bigCopyDue: o
  // dia dela, ou 13 dias depois da última).
  it('um put que falha no meio das partes: o alarme termina, marca o de amanhã, e nenhuma parte nem espaço ficam', async () => {
    const user = 'partes-alarme-falha';
    await accountWith(user, COPY_PART_RECORDS + 1);
    await runInDurableObject(stubOf(user), async (instance, state) => {
      const o = instance as unknown as { env: Env };
      let puts = 0;
      const failing = new Proxy(o.env.SNAPSHOTS, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (typeof value !== 'function') return value;
          if (key === 'put' && ++puts === 2) return async () => Promise.reject(new Error('R2: falha no put'));
          return (value as (...a: unknown[]) => unknown).bind(target);
        },
      });
      o.env = { ...o.env, SNAPSHOTS: failing };
      await state.storage.setAlarm(Date.now() + 3_600_000); // no futuro: só runDurableObjectAlarm o dispara
    });
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
      const logged = out.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      expect(logged).toContainEqual({ evt: 'copy-failed', user, error: 'R2: falha no put' });
    } finally {
      out.mockRestore();
    }
    const next = await runInDurableObject(stubOf(user), (_o, state) => state.storage.getAlarm());
    expect(next).toBeGreaterThan(Date.now());
    expect(await objectsOf(user)).toEqual([]);
    expect(await storageUsed(env.DB)).toBe(0);
    expect(await stateOf(user, 'snapshotRev')).toBeNull(); // a cópia fica para amanhã
    expect(await readsCounted(user, Date.now())).toBeGreaterThan(COPY_PART_RECORDS); // o que ela leu continua contado
  });

  it('a cópia grande que passaria do orçamento de leituras do dia fica para depois, sem pausa', async () => {
    const user = 'partes-sem-leituras';
    await accountWith(user, COPY_PART_RECORDS + 1);
    // O que ela leria (as páginas, COPY_PART_RECORDS + 1, mais COPY_READS_EXTRA) não cabe no que sobra hoje: volta sem copiar nem pausar.
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - COPY_READS_EXTRA });
    const r2 = await countR2(user);
    expect(await stubOf(user).snapshot(T0)).toBe(false);
    expect([r2.put, await objectsOf(user), await stateOf(user, 'snapshotRev')]).toEqual([undefined, [], null]);
    expect((await sync(user, [], T0)).copiesPaused).toBeNull();
    // Com folga no dia, a mesma cópia sai.
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - 2 * COPY_READS_EXTRA - 2 * COPY_PART_RECORDS });
    expect(await stubOf(user).snapshot(T0)).toBe(true);
  });

  // A revisão final (I5 c): as cópias grandes não saem todas no mesmo dia. A primeira espera o dia da conta (copySlot: um hash do id, módulo
  // BIG_COPY_EVERY_DAYS, contra os dias desde 1970 do dia de Brasília), e as seguintes saem de 7 em 7 dias, no mesmo dia da semana; um dia
  // perdido (sem espaço, sem leituras) não espera a semana seguinte inteira: passados 2 × 7 − 1 dias, sai em qualquer dia.
  it('conta grande copia no dia dela, a cada BIG_COPY_EVERY_DAYS dias; um dia perdido espera no máximo 13', async () => {
    const user = 'grande-semanal';
    await accountWith(user, bigDay + 1, [], true); // acima do dia útil e dentro de uma parte só: um arquivo, semanal; nenhuma cópia ainda
    const first = [0, 1, 2, 3, 4, 5, 6].find((k) => daySlot(dayOf(T0 + k * DAY)) === copySlot(user))!;
    for (let k = 0; k < first; k++) expect(await stubOf(user).snapshot(T0 + k * DAY), `D+${k}`).toBe(false);
    const d0 = T0 + first * DAY;
    expect(await stubOf(user).snapshot(d0)).toBe(true); // o dia dela
    expect(await stateOf(user, 'lastSnapshotDay')).toBe(dayOf(d0));
    await sync(user, [solve('novo')], d0 + 1000); // a conta mudou: o que segura a cópia é só o prazo
    const rev = await stateOf(user, 'snapshotRev');
    const ops = await opsOf('A');
    for (let k = 1; k < BIG_COPY_EVERY_DAYS; k++) {
      expect(await stubOf(user).snapshot(d0 + k * DAY), `D+${k}`).toBe(false);
      expect(await objectsOf(user), `D+${k}`).toEqual([snapshotKey(user, dayOf(d0))]);
    }
    expect([await stateOf(user, 'snapshotRev'), await opsOf('A')]).toEqual([rev, ops]); // sem marcar e sem gastar operação
    expect((await sync(user, [], d0)).copiesPaused).toBeNull(); // adiada, não pausada
    const d7 = d0 + BIG_COPY_EVERY_DAYS * DAY;
    expect(await stubOf(user).snapshot(d7)).toBe(true);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(d0)), snapshotKey(user, dayOf(d7))]);
    expect(await stateOf(user, 'lastSnapshotDay')).toBe(dayOf(d7));
    // Um arquivo só, como sempre, e sem `parts` nos metadados.
    expect((await env.SNAPSHOTS.head(snapshotKey(user, dayOf(d0))))!.customMetadata).toEqual({ kind: 'daily', day: dayOf(d0), solves: String(bigDay) });
    // O dia dela 7 dias depois passou sem cópia: 12 dias depois da última, fora do dia, ainda não; 13 dias depois, sai.
    await sync(user, [solve('outro')], d7 + 1000);
    const late = 2 * BIG_COPY_EVERY_DAYS - 1;
    expect(await stubOf(user).snapshot(d7 + (late - 1) * DAY)).toBe(false);
    expect(daySlot(dayOf(d7 + late * DAY))).not.toBe(copySlot(user));
    expect(await stubOf(user).snapshot(d7 + late * DAY)).toBe(true);
  });

  it('o dia da cópia grande é estável e espalha as contas pela semana', () => {
    expect(copySlot('conta-1')).toBe(copySlot('conta-1'));
    const slots = new Set(Array.from({ length: 200 }, (_, i) => copySlot(`conta-${i}`)));
    expect([...slots].sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(daySlot('1970-01-01')).toBe(0);
    expect([daySlot('2026-10-19'), daySlot('2026-10-26')]).toEqual([daySlot('2026-10-12'), daySlot('2026-10-19')]);
  });

  it('conta grande fora do dia da cópia lê no máximo recordsPerDay + 1 linhas', async () => {
    const user = onSlot('grande-fora-do-dia');
    await accountWith(user, 2 * bigDay);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    await sync(user, [solve('novo')], T0 + 1000); // mudou: só o prazo segura a cópia
    // As linhas que o SQLite leu nas consultas aos registros (o rowsRead de cada cursor), desde agora.
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
    const read = () => cursors.reduce((sum, c) => sum + c.rowsRead, 0);
    for (let k = 1; k < BIG_COPY_EVERY_DAYS; k++) expect(await stubOf(user).snapshot(T0 + k * DAY), `D+${k}`).toBe(false);
    expect(read()).toBeGreaterThan(0);
    expect(read()).toBeLessThanOrEqual((BIG_COPY_EVERY_DAYS - 1) * (bigDay + 1)); // cada dia, no máximo recordsPerDay + 1
    expect((await sync(user, [], T0)).copiesPaused).toBeNull();
    // No dia da cópia, ela sai.
    expect(await stubOf(user).snapshot(T0 + BIG_COPY_EVERY_DAYS * DAY)).toBe(true);
    // A pausa por tamanho continua conferida na vez da conta grande: com um teto abaixo dela, 'size'.
    await sync(user, [solve('outro')], T0 + BIG_COPY_EVERY_DAYS * DAY + 1000);
    await setVars(user, { SNAPSHOT_MAX_RECORDS: String(bigDay + 5) });
    expect(await stubOf(user).snapshot(T0 + 2 * BIG_COPY_EVERY_DAYS * DAY)).toBe(false);
    expect((await sync(user, [], T0)).copiesPaused).toBe('size');
  });

  // A revisão final (I5 a): a conta grande na vez dela não é contada até o teto (SNAPSHOT_MAX_RECORDS) antes das páginas, que já leem a conta
  // inteira: as páginas conferem o teto, e a cópia não lê a conta duas vezes.
  it('a conta grande na vez dela não conta a conta até o teto antes das páginas', async () => {
    const user = 'grande-sem-contagem';
    await accountWith(user, 2 * COPY_PART_RECORDS + 1);
    const counts: SqlStorageCursor<Record<string, SqlStorageValue>>[] = [];
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      o.sql = new Proxy(real, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          return (query: string, ...bindings: unknown[]) => {
            const cursor = target.exec(query, ...(bindings as SqlStorageValue[]));
            if (query === COUNT_RECORDS) counts.push(cursor);
            return cursor;
          };
        },
      });
    });
    const reads = await readsCounted(user, T0);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(counts.length).toBeGreaterThan(0);
    for (const c of counts) expect(c.rowsRead).toBeLessThanOrEqual(COPY_PART_RECORDS + 1);
    // As leituras da cópia: as páginas (a conta, uma vez) mais as contagens limitadas e o resto, dentro de COPY_READS_EXTRA.
    expect((await readsCounted(user, T0)) - reads).toBeLessThanOrEqual(2 * COPY_PART_RECORDS + 1 + COPY_READS_EXTRA);
  });

  // A rodada residual: o teto da conta (recordsBound, uma linha) passa do teto da cópia, e a pausa 'size' vem antes de reservar as operações
  // A ou ler as páginas; o que as páginas conferem fica de reserva.
  it('acima do teto, a cópia grande pausa com size antes de reservar operações ou ler as páginas', async () => {
    const user = 'grande-acima-do-teto';
    await accountWith(user, 2 * COPY_PART_RECORDS + 1);
    await setVars(user, { SNAPSHOT_MAX_RECORDS: String(COPY_PART_RECORDS + 10) });
    const r2 = await countR2(user);
    const pages: unknown[] = [];
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      o.sql = new Proxy(real, {
        get(target, key) {
          const value = Reflect.get(target, key) as unknown;
          if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          return (query: string, ...bindings: unknown[]) => {
            if (query === PAGE_AFTER) pages.push(bindings);
            return target.exec(query, ...(bindings as SqlStorageValue[]));
          };
        },
      });
    });
    expect(await stubOf(user).snapshot(T0)).toBe(false);
    expect([r2.put, pages, await opsOf('A')]).toEqual([undefined, [], 0]); // nenhuma operação A reservada, nenhuma página lida
    expect([await objectsOf(user), await storageUsed(env.DB), await stateOf(user, 'snapshotRev')]).toEqual([[], 0, null]);
    expect((await sync(user, [], T0)).copiesPaused).toBe('size');
    // Um arquivo só acima do teto também é size.
    const single = 'grande-acima-do-teto-arquivo';
    await accountWith(single, bigDay + 100);
    await setVars(single, { SNAPSHOT_MAX_RECORDS: String(bigDay + 50) });
    expect(await stubOf(single).snapshot(T0)).toBe(false);
    expect(await objectsOf(single)).toEqual([]);
    expect((await sync(single, [], T0)).copiesPaused).toBe('size');
  });

  // Uma conta cujas leituras (o teto dela mais COPY_READS_EXTRA) não caberiam nem num dia vazio: 'size', e não "fica para depois" para sempre.
  // O teto da conta é o maior rowid: uma linha com o rowid alto o simula sem semear meio milhão de registros.
  it('a cópia grande que não caberia nem num dia inteiro de leituras pausa com size', async () => {
    const user = 'grande-sem-dia-de-leituras';
    await accountWith(user, COPY_PART_RECORDS + 1);
    await setVars(user, { SNAPSHOT_MAX_RECORDS: String(2 * DAILY_READ_BUDGET) });
    await runInDurableObject(stubOf(user), (_o, state) => {
      state.storage.sql.exec(
        "INSERT INTO records (rowid, store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) VALUES (?, 'solves', 'alto', ?, ?, NULL, ?, 0, 's1')",
        DAILY_READ_BUDGET, JSON.stringify(solve('alto').data), T0, T0,
      );
    });
    const r2 = await countR2(user);
    expect(await stubOf(user).snapshot(T0)).toBe(false);
    expect([r2.put, await opsOf('A')]).toEqual([undefined, 0]);
    expect((await sync(user, [], T0)).copiesPaused).toBe('size');
  });

  it('conta pequena continua com um arquivo só, todo dia; no limite do dia útil também', async () => {
    const user = 'pequena-diaria';
    await sync(user, [session, solve('a')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    await sync(user, [solve('b')], T0 + 1000);
    expect(await stubOf(user).snapshot(T0 + DAY)).toBe(true);
    await sync(user, [solve('c')], T0 + DAY + 1000);
    expect(await stubOf(user).snapshot(T0 + 2 * DAY)).toBe(true);
    expect(await objectsOf(user)).toEqual([0, 1, 2].map((k) => snapshotKey(user, dayOf(T0 + k * DAY))));
    expect((await env.SNAPSHOTS.head(snapshotKey(user, dayOf(T0))))!.customMetadata).toEqual({ kind: 'daily', day: dayOf(T0), solves: '1' });
    expect((await list(user, T0 + 2 * DAY)).body).toMatchObject({ copies: [{ solves: 3, parts: 0 }, { solves: 2, parts: 0 }, { solves: 1, parts: 0 }] });

    const edge = 'no-limite-do-dia';
    await accountWith(edge, bigDay - 1); // com o solve novo, exatamente o dia útil: ainda diária
    expect(await stubOf(edge).snapshot(T0)).toBe(true);
    await sync(edge, [solve('novo')], T0 + 1000);
    expect(await stubOf(edge).snapshot(T0 + DAY)).toBe(true);
  });
});

// Revisão final (resíduo, I1): o COUNT do tamanho da conta percorria a tabela inteira, antes de qualquer teto da restauração; a restauração
// não olhava o orçamento de leituras; e, contado nele, um punhado de restaurações recusadas numa conta grande travava o sync do dia. O COUNT
// para em (o limite em uso) + 1, e a restauração recusa com restore-limit antes dele quando o orçamento de leituras do dia acabou. Desde as
// cópias grandes, a restauração não conta a conta: a comparação para quando as mudanças passam do limite, e o que ela lê fica limitado igual.
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
    await setVars(user, { SNAPSHOT_MAX_RECORDS: '100' });
    await seedSolves(user, 200);
    const read = await rowsRead(user);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(read()).toBeGreaterThan(0);
    expect(read()).toBeLessThanOrEqual(100 + 1);
    expect((await sync(user, [])).copiesPaused).toBe('size');
  });

  // A restauração por diferenças (spec das cópias grandes) não conta a conta: compara e para assim que as mudanças passam do limite. A
  // leitura vai por páginas de SLICE_PAGE, então a recusa lê no máximo o limite + 1 registros e o resto da página em que parou.
  it('a restauração recusada de uma conta grande lê no máximo o limite + 1 e uma página; passado o orçamento de leituras, restore-limit sem ler nada', async () => {
    const user = 'restaura-grande-limitada';
    await setState(user, 'userId', user);
    await seedSolves(user, 3 * most);
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(T0)), await gzipJson(exportFromRecords([], T0))); // vazia: cada solve de agora é uma mudança
    const read = await rowsRead(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(read()).toBeGreaterThan(most);
    expect(read()).toBeLessThanOrEqual(most + 1 + SLICE_PAGE + 1); // e a linha em que o SQLite confere que o LIMIT acabou
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
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(T0)), await gzipJson(exportFromRecords([], T0)));
    const taps = 5;
    // Com lugar para a estimativa da restauração (RESTORE_READS_EXTRA, a cópia vazia: I5 b), que a deixa comparar e recusar.
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - RESTORE_READS_EXTRA - taps * (most + 1 + SLICE_PAGE) - 1 });
    for (let i = 1; i <= taps; i++) expect((await restore(user, dayOf(T0), T0 + i * 1000)).status).toBe(413);
    const res = await sync(user, []);
    expect(res.readsDeferred).toBeUndefined();
    expect(res.changes.length).toBeGreaterThan(0);
  });
});

// Os desafios (spec do desafio, seção 7): a cópia do dia os leva, e restaurá-la os troca pela regra de restoreChanges, como o treino; uma cópia
// de antes deles (sem `duels`) não mexe nos de agora.
describe('os desafios nas cópias na nuvem', () => {
  const duel = (linkId: string, o: Partial<Change> & { status?: string } = {}): Change => ({
    store: 'duels',
    id: `${linkId}-a`,
    data: {
      linkId, side: 'a', event: '333', scrambles: Array.from({ length: 7 }, () => 'R U'), mine: [{ ms: 9000, penalty: null }], theirs: null,
      myName: 'Ana', theirName: '', status: o.status ?? 'playing', createdAt: T0,
    },
    updatedAt: o.updatedAt ?? T0,
    deletedAt: o.deletedAt ?? null,
    deletionStamp: o.deletionStamp ?? T0,
  });
  const duelsOf = (user: string): Promise<Change[]> =>
    runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<Row>("SELECT * FROM records WHERE store = 'duels' ORDER BY id").toArray().map(rowToChange));

  it('restaurar um dia devolve os desafios daquele dia; uma cópia sem duels não mexe nos de agora', async () => {
    const user = 'restaura-desafios';
    await sync(user, [session, solve('a'), duel('abcdefgh00000001'), duel('abcdefgh00000002')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const day = (await gunzipJson(await (await env.SNAPSHOTS.get(snapshotKey(user, dayOf(T0))))!.arrayBuffer())) as KlickExport;
    expect(day.duels?.map((d) => d.id)).toEqual(['abcdefgh00000001-a', 'abcdefgh00000002-a']);

    // Depois da cópia: um desafio respondido, um apagado e um novo.
    const later = T0 + 1000;
    const gone = { updatedAt: later, deletedAt: later, deletionStamp: later };
    await sync(user, [duel('abcdefgh00000001', { status: 'done', updatedAt: later }), duel('abcdefgh00000002', gone), duel('abcdefgh00000003', { updatedAt: later })], later);
    const at = T0 + 2000;
    expect((await restore(user, dayOf(T0), at)).status).toBe(204);
    expect((await duelsOf(user)).map((c) => [c.id, c.deletedAt, (c.data as { status: string }).status, c.updatedAt])).toEqual([
      ['abcdefgh00000001-a', null, 'playing', at],
      ['abcdefgh00000002-a', null, 'playing', at],
      ['abcdefgh00000003-a', at, 'playing', at], // não está na cópia: vai para a lixeira
    ]);
    expect(JSON.parse((await stateOf(user, 'active'))!)).toMatchObject({ duels: 2 });

    // Uma cópia de antes dos desafios: os solves trocam, e os desafios ficam como estão.
    const { duels: _d, ...older } = exportFromRecords([session, solve('b')], T0 - DAY);
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(T0 - DAY)), await gzipJson(older));
    const before = await duelsOf(user);
    expect((await restore(user, dayOf(T0 - DAY), T0 + 3000)).status).toBe(204);
    expect(await duelsOf(user)).toEqual(before);
    const solves = (await sync(user, [])).changes.filter((c) => c.store === 'solves').sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(solves.map((c) => [c.id, c.deletedAt])).toEqual([['a', T0 + 3000], ['b', null]]);
  });

  // A revisão final: o nome dos desafios é a única chave da conta mais nova que as cópias na nuvem. Uma cópia de antes dele (o perfil sem
  // duelName) gravaria '' por cima do nome, com a data da restauração, e o sync o levaria a todos os aparelhos. Fica o da conta; a cópia
  // que traz o nome vale, como no aparelho (replaceAll).
  it('restaurar uma cópia de antes do nome dos desafios mantém o nome da conta; a que traz o nome o restaura', async () => {
    const user = 'restaura-nome';
    const named = (data: string, at: number): Change => ({ store: 'prefs', id: 'duelName', data, updatedAt: at, deletedAt: null, deletionStamp: at });
    const nameOf = async (): Promise<Change[]> => (await sync(user, [])).changes.filter((c) => c.store === 'prefs' && c.id === 'duelName');
    await sync(user, [session, solve('a'), named('Ana', T0)]);
    const { duels: _d, ...older } = exportFromRecords([session, solve('a')], T0 - DAY);
    const { duelName: _n, ...profile } = older.profile!;
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(T0 - DAY)), await gzipJson({ ...older, profile }));
    expect((await restore(user, dayOf(T0 - DAY), T0 + 1000)).status).toBe(204);
    expect(await nameOf()).toEqual([expect.objectContaining({ data: 'Ana', deletedAt: null })]);

    // Uma cópia com o nome: o dela volta.
    const withName = exportFromRecords([session, solve('a'), named('Bia', T0 - DAY)], T0 - DAY);
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(T0 - 2 * DAY)), await gzipJson(withName));
    expect((await restore(user, dayOf(T0 - 2 * DAY), T0 + 2000)).status).toBe(204);
    expect(await nameOf()).toEqual([expect.objectContaining({ data: 'Bia', deletedAt: null })]);
  });
});

// A restauração no servidor por diferenças, e a resposta "pelo aparelho" (spec das cópias grandes, seções 3 e 5): o servidor compara a cópia
// com a conta, faixa a faixa (a cópia em partes, cada parte contra a faixa de chaves dela), e grava só o que muda. As mudanças contra o dia
// (RESTORE_MAX_RECORDS e o dia útil, depois o que sobra hoje): quando não cabem, o app novo ({ device: true }) ouve que restaura no aparelho,
// e o de antes ({}) recebe too-big ou write-budget, como sempre (Review Focus 1).
describe('a restauração por diferenças e a resposta pelo aparelho', () => {
  const prefsAna: Change = { store: 'prefs', id: 'duelName', data: 'Ana', updatedAt: T0, deletedAt: null, deletionStamp: T0 };
  const writesOf = async (user: string): Promise<number> => (JSON.parse((await stateOf(user, 'writes')) ?? 'null') as { n: number } | null)?.n ?? 0;
  const restoresOf = async (user: string): Promise<unknown> => JSON.parse((await stateOf(user, 'restores')) ?? 'null');
  // Uma conta com a cópia do dia em duas partes: a sessão, o solve a e COPY_PART_RECORDS solves semeados (5.002 registros).
  async function bigWithParts(user: string, extra: Change[] = []): Promise<void> {
    await sync(user, [session, solve('a'), ...extra]);
    await seedSolves(user, COPY_PART_RECORDS);
    await setState(user, 'lastSnapshotDay', LONG_AGO); // a vez dela (copySlot), qualquer que seja o dia
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(T0)), partKey(user, dayOf(T0), 1), partKey(user, dayOf(T0), 2)]);
  }

  it('restaurar grava só as mudanças, e as linhas reservadas são as delas', async () => {
    const user = 'diferencas-so-mudancas';
    await sync(user, [session, solve('a', 1000), solve('b'), solve('c')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    await sync(user, [{ ...solve('a', 2000), updatedAt: T0 + 50 }, solve('d')]); // o a editado e o d novo: as duas mudanças
    const before = new Map((await accountOf(user)).records.map((r) => [r.id as string, r]));
    const [writes, day] = [await writesOf(user), await dayRows(T0 + 1000)];
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 204, body: null });
    const after = new Map((await accountOf(user)).records.map((r) => [r.id as string, r]));
    expect([...after.keys()].filter((id) => after.get(id)!.rev !== before.get(id)!.rev).sort()).toEqual(['a', 'd']);
    expect(JSON.parse(after.get('a')!.data as string)).toMatchObject({ ms: 1000 });
    expect([after.get('a')!.deleted_at, after.get('d')!.deleted_at === null]).toEqual([null, false]);
    expect([await writesOf(user), await dayRows(T0 + 1000)]).toEqual([writes + rowsOf(2), day + rowsOf(2)]);
  });

  it('conta grande, um dia ruim (uma sessão com 500 solves apagada): restaura no servidor, com a cópia de antes em partes', async () => {
    const user = 'diferencas-dia-ruim';
    const s2: Change = { ...session, id: 's2', data: { ...(session.data as object), name: 'Sessão 2', order: 1 } };
    const ofS2 = Array.from({ length: 500 }, (_, i): Change => ({ ...solve(`b${i}`), data: { ...(solve('b').data as object), sessionId: 's2' } }));
    await sync(user, [session, s2, solve('a')]);
    for (let i = 0; i < ofS2.length; i += 250) await sync(user, ofS2.slice(i, i + 250));
    await seedSolves(user, COPY_PART_RECORDS - 400);
    await setState(user, 'lastSnapshotDay', LONG_AGO); // a vez dela (copySlot), qualquer que seja o dia
    expect(await recordCount(user)).toBe(COPY_PART_RECORDS + 103); // acima do dia útil e de uma parte
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    expect(await objectsOf(user)).toContain(partKey(user, dayOf(T0), 2));
    // O dia ruim: a sessão 2 apagada, e a cascata leva os 500 solves dela.
    const bad = T0 + 100;
    expect((await sync(user, [{ ...s2, updatedAt: bad, deletedAt: bad, deletionStamp: bad }], bad)).accepted).toBe(1);
    const writes = await writesOf(user);
    const at = T0 + 1000;
    expect(await restore(user, dayOf(T0), at)).toEqual({ status: 204, body: null });
    const back = await runInDurableObject(stubOf(user), (_o, state) =>
      state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM records WHERE deleted_at IS NULL AND (id = 's2' OR parent = 's2')").one().n,
    );
    expect(back).toBe(501); // a sessão e os 500 solves dela, e só eles foram gravados
    expect(await writesOf(user)).toBe(writes + rowsOf(501));
    // A cópia de antes saiu em partes (a conta tem mais de COPY_PART_RECORDS registros), com o manifesto na lista.
    const name = preRestoreName(at);
    expect(await objectsOf(user)).toEqual(expect.arrayContaining([snapshotKey(user, name), partKey(user, name, 1), partKey(user, name, 2)]));
    const solves = String(1 + COPY_PART_RECORDS - 400); // o a e os semeados: os da sessão 2 estavam apagados
    expect((await env.SNAPSHOTS.head(snapshotKey(user, name)))!.customMetadata).toEqual({ kind: 'pre-restore', day: dayOf(at), solves, parts: '2' });
  });

  it('mudanças acima do limite, com device: 200 { restore: "device", parts }, nada gravado, restores + 1', async () => {
    const user = 'diferencas-pelo-aparelho';
    await bigWithParts(user);
    await setVars(user, { RESTORE_MAX_RECORDS: '10' }); // o servidor grava no máximo 10 mudanças
    await sync(user, Array.from({ length: 11 }, (_, i) => solve(`novo${i}`))); // 11 solves que a cópia não tem: 11 para a lixeira
    const account = await accountOf(user);
    const objects = await objectsOf(user);
    const [opsA, opsB, writes, day] = [await opsOf('A'), await opsOf('B'), await writesOf(user), await dayRows(T0 + 1000)];
    const r2 = await countR2(user);
    expect(await restoreDevice(user, dayOf(T0), T0 + 1000)).toEqual({ status: 200, body: { restore: 'device', parts: 2 } });
    // O manifesto e a parte 1: os novos estão na faixa dela, e as mudanças passam do limite ali, então a parte 2 nem é lida. Nenhuma cópia
    // de antes. As operações B das partes são reservadas de uma vez, com o manifesto lido.
    expect([r2.get, r2.head, r2.put]).toEqual([2, undefined, undefined]);
    expect([await opsOf('A'), await opsOf('B')]).toEqual([opsA, opsB + 2 + 2]);
    expect(await objectsOf(user)).toEqual(objects);
    const after = await accountOf(user);
    expect(after.records).toEqual(account.records);
    expect(after.state.filter((r) => r.key !== 'restores')).toEqual(account.state);
    expect(await restoresOf(user)).toEqual({ day: utcDay(T0), n: 1 });
    expect([await writesOf(user), await dayRows(T0 + 1000)]).toEqual([writes, day]); // nenhuma linha reservada

    // Uma cópia de um arquivo só: parts 0.
    const small = 'diferencas-pelo-aparelho-arquivo';
    await sync(small, [session, solve('a')]);
    expect(await stubOf(small).snapshot(T0)).toBe(true);
    await setVars(small, { RESTORE_MAX_RECORDS: '1' });
    await sync(small, [solve('b'), solve('c')]);
    const records = (await accountOf(small)).records;
    expect(await restoreDevice(small, dayOf(T0), T0 + 1000)).toEqual({ status: 200, body: { restore: 'device', parts: 0 } });
    expect((await accountOf(small)).records).toEqual(records);
    expect(await restoresOf(small)).toEqual({ day: utcDay(T0), n: 1 });
  });

  it('mudanças acima do limite, sem device: 413 too-big; sem lugar hoje: 429 write-budget', async () => {
    const user = 'diferencas-app-de-antes';
    await sync(user, [session, solve('a')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    await sync(user, [solve('b'), solve('c'), solve('d')]); // três mudanças: b, c e d para a lixeira
    await setVars(user, { RESTORE_MAX_RECORDS: '2' });
    const account = await accountOf(user);
    // O app de antes manda {}; um corpo sem `device: true`, ou que nem se lê, é o mesmo pedido, e nunca recebe a resposta nova.
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 413, body: { error: 'too-big' } });
    expect(await restore(user, dayOf(T0), T0 + 1100, { device: 'true' })).toEqual({ status: 413, body: { error: 'too-big' } });
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN, [ACCOUNT_HEADER]: user };
    const torn = await call(`/api/snapshots/${dayOf(T0)}/restore`, { method: 'POST', headers, body: 'não é json' }, { deps: testDeps({ user, now: () => T0 + 1200 }) });
    expect([torn.status, await torn.json()]).toEqual([413, { error: 'too-big' }]);
    expect(await accountOf(user)).toEqual(account); // nada gravado, e as recusas não contam como restaurações

    // As três cabem no limite de novo, mas não no que sobra hoje: o app de antes recebe write-budget; o novo, a resposta do aparelho.
    await setVars(user, { RESTORE_MAX_RECORDS: String(caps.restoreRecords) });
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(3) + 1 });
    const full = await accountOf(user);
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 429, body: { error: 'write-budget' } });
    expect(await accountOf(user)).toEqual(full);
    expect(await restoreDevice(user, dayOf(T0), T0 + 3000)).toEqual({ status: 200, body: { restore: 'device', parts: 0 } });
    expect((await accountOf(user)).records).toEqual(full.records);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(T0))]); // nenhuma cópia de antes
    // Com lugar hoje, o app de antes restaura no servidor.
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(3) });
    expect((await restore(user, dayOf(T0), T0 + 4000)).status).toBe(204);
  });

  it('cópia igual à conta: 204, nada gravado, sem cópia de antes', async () => {
    const user = 'diferencas-igual';
    await sync(user, [session, solve('a'), solve('b', 1000), prefsAna]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const account = await accountOf(user);
    const objects = await objectsOf(user);
    const [opsA, writes, day] = [await opsOf('A'), await writesOf(user), await dayRows(T0 + 1000)];
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 204, body: null });
    expect(await restoreDevice(user, dayOf(T0), T0 + 2000)).toEqual({ status: 204, body: null }); // o app novo, igual
    expect([r2.get, r2.head, r2.put]).toEqual([2, undefined, undefined]);
    expect(await objectsOf(user)).toEqual(objects);
    expect([await opsOf('A'), await writesOf(user), await dayRows(T0 + 1000)]).toEqual([opsA, writes, day]);
    const after = await accountOf(user);
    expect(after.records).toEqual(account.records);
    expect(after.state.filter((r) => r.key !== 'restores' && r.key !== 'restoreFloor')).toEqual(account.state);
    expect(await restoresOf(user)).toEqual({ day: utcDay(T0), n: 2 });
    expect(await stateOf(user, 'restoreFloor')).toBe(String(T0 + 2000)); // o piso sobe mesmo sem gravar (I1)
  });

  it('parte que sumiu: 404, nada gravado', async () => {
    const user = 'diferencas-parte-sumiu';
    await bigWithParts(user);
    await sync(user, [solve('novo')]);
    expect((await list(user)).status).toBe(200); // a lista guardada, com a cópia
    await env.SNAPSHOTS.delete(partKey(user, dayOf(T0), 2));
    const account = await accountOf(user);
    const objects = await objectsOf(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await accountOf(user)).toEqual(account);
    expect(await objectsOf(user)).toEqual(objects);
    expect(JSON.parse((await stateOf(user, 'copies'))!)).toMatchObject({ at: 0 }); // a lista se renova
    // Uma parte torta, também com o app novo: o mesmo.
    await env.SNAPSHOTS.put(partKey(user, dayOf(T0), 2), await gzipJson({ sessions: 'não', solves: [] }));
    const torn = await objectsOf(user);
    expect(await restoreDevice(user, dayOf(T0), T0 + 2000)).toEqual({ status: 404, body: { error: 'not-found' } });
    expect(await accountOf(user)).toEqual(account);
    expect(await objectsOf(user)).toEqual(torn);
  });

  // A revisão final (I6): as cópias de antes de restaurar ocupam o espaço que todas as contas dividem. (a) Quando a última cópia do dia já é a
  // conta de agora (snapshotRev igual à revisão), ela guarda o estado de antes, e a restauração não grava outra (vai para o log). (b) Uma
  // conta grande grava no máximo uma cópia de antes em partes por dia UTC; a restauração seguinte que precisaria de outra vai pelo aparelho
  // (o app novo) ou ouve restore-limit (o de antes), sem gravar nada.
  it('sem cópia de antes quando a última cópia do dia já é a conta de agora; vai para o log', async () => {
    const user = 'antes-igual-a-do-dia';
    await sync(user, [session, solve('a'), solve('b')]);
    await env.SNAPSHOTS.put(snapshotKey(user, dayOf(T0 - DAY)), await gzipJson(exportFromRecords([session, solve('a')], T0 - DAY))); // ontem: sem o b
    expect(await stubOf(user).snapshot(T0)).toBe(true); // a de hoje é a conta de agora
    const r2 = await countR2(user);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      expect(await restore(user, dayOf(T0 - DAY), T0 + 1000)).toEqual({ status: 204, body: null });
      const logged = out.mock.calls.map(([line]) => JSON.parse(String(line)) as Record<string, unknown>);
      expect(logged).toContainEqual({ evt: 'pre-restore-skipped', user });
    } finally {
      out.mockRestore();
    }
    expect([r2.head, r2.put]).toEqual([undefined, undefined]);
    expect(await objectsOf(user)).toEqual([snapshotKey(user, dayOf(T0 - DAY)), snapshotKey(user, dayOf(T0))]);
    // Depois da restauração a conta mudou: a próxima restauração grava a cópia de antes, como sempre.
    expect((await restore(user, dayOf(T0), T0 + 2000)).status).toBe(204);
    expect(await objectsOf(user)).toContain(snapshotKey(user, preRestoreName(T0 + 2000)));
  });

  it('uma cópia de antes em partes por dia: a segunda restauração grande do dia vai pelo aparelho, ou restore-limit no app de antes', async () => {
    const user = 'antes-em-partes-uma-por-dia';
    await bigWithParts(user);
    await sync(user, [solve('novo')]);
    expect((await restore(user, dayOf(T0), T0 + 1000)).status).toBe(204);
    expect(await objectsOf(user)).toContain(partKey(user, preRestoreName(T0 + 1000), 2)); // a primeira do dia, em partes
    await sync(user, [solve('outro')], T0 + 1500);
    const account = await accountOf(user);
    const objects = await objectsOf(user);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 2000)).toEqual({ status: 429, body: { error: 'restore-limit' } });
    expect(await restoreDevice(user, dayOf(T0), T0 + 3000)).toEqual({ status: 200, body: { restore: 'device', parts: 2 } });
    expect(r2.put).toBeUndefined();
    expect(await objectsOf(user)).toEqual(objects);
    expect((await accountOf(user)).records).toEqual(account.records);
    // No dia UTC seguinte, volta a caber.
    await sync(user, [solve('mais')], T0 + DAY);
    expect((await restore(user, dayOf(T0), T0 + DAY + 1000)).status).toBe(204);
  });

  // A revisão final (I5 b): uma restauração grande no servidor lê a conta duas vezes (a comparação e a cópia de antes). Quando as leituras de
  // hoje mais a estimativa dela (2 × os registros da cópia, mais RESTORE_READS_EXTRA) passam do orçamento do dia, ela não compara: o app novo
  // ouve a resposta do aparelho, o de antes restore-limit.
  // A rodada residual: uma conta acima do teto da cópia não teria a cópia de antes ('size'); a restauração responde antes de comparar.
  it('acima do teto da cópia, a restauração não compara: no-room no app de antes, o aparelho no novo', async () => {
    const user = 'diferencas-acima-do-teto';
    await bigWithParts(user);
    await sync(user, [solve('novo')]);
    await setVars(user, { SNAPSHOT_MAX_RECORDS: String(COPY_PART_RECORDS) });
    const account = await accountOf(user);
    const objects = await objectsOf(user);
    const reads = await readsCounted(user, T0 + 1000);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 409, body: { error: 'no-room' } });
    expect(await restoreDevice(user, dayOf(T0), T0 + 2000)).toEqual({ status: 200, body: { restore: 'device', parts: 2 } });
    expect([r2.get, r2.put]).toEqual([2, undefined]); // o objeto da cópia, uma vez por pedido; nenhuma parte
    expect(await readsCounted(user, T0 + 2000)).toBe(reads + 2); // só o teto da conta, uma linha por pedido
    expect(await objectsOf(user)).toEqual(objects);
    expect((await accountOf(user)).records).toEqual(account.records);
  });

  it('com as leituras de hoje perto do fim, a restauração não compara: vai pelo aparelho, ou restore-limit no app de antes', async () => {
    const user = 'diferencas-sem-leituras';
    await bigWithParts(user);
    await sync(user, [solve('novo')]);
    const estimate = 2 * (COPY_PART_RECORDS + 2) + RESTORE_READS_EXTRA; // as partes do manifesto têm 5.002 registros
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - estimate + 1 });
    const account = await accountOf(user);
    const reads = await readsCounted(user, T0 + 1000);
    const r2 = await countR2(user);
    expect(await restore(user, dayOf(T0), T0 + 1000)).toEqual({ status: 429, body: { error: 'restore-limit' } });
    expect(await restoreDevice(user, dayOf(T0), T0 + 2000)).toEqual({ status: 200, body: { restore: 'device', parts: 2 } });
    expect(r2.get).toBe(2); // o objeto da cópia, uma vez por pedido; nenhuma parte
    expect(await readsCounted(user, T0 + 2000)).toBe(reads); // nada comparado
    expect((await accountOf(user)).records).toEqual(account.records);
    // Um arquivo só: os registros dele.
    const small = 'diferencas-sem-leituras-arquivo';
    await sync(small, [session, solve('a')]);
    expect(await stubOf(small).snapshot(T0)).toBe(true);
    await sync(small, [solve('b')]);
    await setState(small, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - (2 * 2 + RESTORE_READS_EXTRA) + 1 });
    expect(await restore(small, dayOf(T0), T0 + 1000)).toEqual({ status: 429, body: { error: 'restore-limit' } });
    // Com folga no dia, compara e restaura no servidor.
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - estimate - 20_000 });
    expect((await restore(user, dayOf(T0), T0 + 3000)).status).toBe(204);
  });

  it('a comparação lê cada registro de agora uma vez só', async () => {
    const user = 'diferencas-leituras';
    await bigWithParts(user, [prefsAna]);
    await sync(user, [solve('novo')]);
    // Sem lugar hoje: a resposta do aparelho, depois de comparar tudo e sem a cópia de antes (que leria a conta de novo).
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET });
    const records = await recordCount(user);
    const reads = await readsCounted(user, T0 + 1000);
    expect(await restoreDevice(user, dayOf(T0), T0 + 1000)).toEqual({ status: 200, body: { restore: 'device', parts: 2 } });
    expect((await readsCounted(user, T0 + 1000)) - reads).toBe(records + 1); // as faixas e os ajustes, cada registro uma vez, e o teto da conta
  });

  it('GET parts: o índice 0 é o objeto, 1..N as partes; o dia tem COPY_PART_READS_PER_DAY leituras; cada uma reserva uma B', async () => {
    expect(COPY_PART_READS_PER_DAY).toBe(200);
    const user = 'diferencas-partes-get';
    await bigWithParts(user);
    const day = dayOf(T0);
    const bytes = async (key: string): Promise<Uint8Array> => new Uint8Array(await (await env.SNAPSHOTS.get(key))!.arrayBuffer());
    for (const [i, key] of [[0, snapshotKey(user, day)], [1, partKey(user, day, 1)], [2, partKey(user, day, 2)]] as const) {
      const res = await part(user, day, i);
      expect(res.status, String(i)).toBe(200);
      expect([res.headers.get('Content-Type'), res.headers.get('Cache-Control')]).toEqual(['application/octet-stream', 'no-store']);
      expect(new Uint8Array(await res.arrayBuffer()), String(i)).toEqual(await bytes(key));
    }
    expect(isManifest(await gunzipJson(await (await part(user, day, 0)).arrayBuffer()))).toBe(true);
    const past = await part(user, day, 3); // além das partes: o R2 não tem
    expect([past.status, await past.json()]).toEqual([404, { error: 'not-found' }]);
    expect(await opsOf('B')).toBe(5); // uma por leitura, a que não achou inclusive
    expect(JSON.parse((await stateOf(user, 'partReads'))!)).toEqual({ day: utcDay(T0), n: 5 });

    // O dia acaba em COPY_PART_READS_PER_DAY: a seguinte é 429, sem o R2 nem a operação B; no dia seguinte (UTC), volta.
    await setState(user, 'partReads', { day: utcDay(T0), n: COPY_PART_READS_PER_DAY - 1 });
    expect((await part(user, day, 1)).status).toBe(200);
    const r2 = await countR2(user);
    const over = await part(user, day, 1);
    expect([over.status, await over.json()]).toEqual([429, { error: 'restore-limit' }]);
    expect([{ ...r2 }, await opsOf('B')]).toEqual([{}, 6]);
    expect((await part(user, day, 1, T0 + DAY)).status).toBe(200);
    // Sem operações B no mês: 503, e a leitura não conta no dia.
    await seedOps('B', caps.classBMonth);
    const counted = await stateOf(user, 'partReads');
    const broke = await part(user, day, 2, T0 + DAY);
    expect([broke.status, await broke.json()]).toEqual([503, { error: 'r2-budget' }]);
    expect(await stateOf(user, 'partReads')).toBe(counted);
    await seedOps('B', 0);

    // Uma cópia de um arquivo só: o índice 0 é o arquivo.
    const small = 'diferencas-partes-get-arquivo';
    await sync(small, [session, solve('a')]);
    expect(await stubOf(small).snapshot(T0)).toBe(true);
    const file = await part(small, day, 0);
    expect(file.status).toBe(200);
    expect(((await gunzipJson(await file.arrayBuffer())) as KlickExport).solves.map((s) => s.id)).toEqual(['a']);
    // Um nome torto é 400; a conta de outra sessão, 401; sem a conta, 400; um índice fora da rota, 404.
    expect((await part(small, '..%2Foutra', 0)).status).toBe(400);
    expect((await part(small, day, 0, T0, { [ACCOUNT_HEADER]: 'outra-conta' })).status).toBe(401);
    expect((await part(small, day, 0, T0, {})).status).toBe(400);
    expect((await part(small, day, 1000)).status).toBe(404);
    expect((await part(small, day, 'x')).status).toBe(404);
  });
});

// O piso da restauração (a revisão final das cópias grandes, I1): a restauração por diferenças não regrava o que a cópia já tem. Sem o piso,
// uma mudança de antes dela (uma edição offline na fila, ou a fila longa de uma restauração pelo aparelho) venceria cada registro que ela
// deixou como estava, e "a última restauração vale" deixaria de valer. A restauração no servidor guarda a data dela (restoreFloor), a de
// 0 mudanças inclusive; no sync, a mudança com as duas datas abaixo dele, de um registro que a conta tem, perde, e a versão da conta volta
// com as datas no piso, gravada (e contada) como qualquer escrita: quem mandou e os outros aparelhos a recebem e convergem.
describe('o piso da restauração (cópias grandes, I1)', () => {
  const writesOf = async (user: string): Promise<number> => (JSON.parse((await stateOf(user, 'writes')) ?? 'null') as { n: number } | null)?.n ?? 0;
  const recordsOf = (user: string): Promise<Map<string, Change>> =>
    runInDurableObject(stubOf(user), (_o, state) =>
      new Map(state.storage.sql.exec<Row>("SELECT * FROM records WHERE store <> 'prefs'").toArray().map((r) => [syncKey(r.store, r.id), rowToChange(r)])),
    );
  // O aparelho junta a volta do servidor como o repositório faz (applyRemote: applyChanges no modo do aparelho, com o que ele mandou ainda
  // contado como na fila), sobre os registros dele.
  const deviceApply = (local: Map<string, Change>, changes: readonly Change[]): void => {
    const view: RecordView = {
      get: (store, id) => local.get(syncKey(store, id)),
      solvesOf: (sid) => [...local.values()].filter((c) => c.store === 'solves' && sessionOfChange(c) === sid),
    };
    for (const c of applyChanges(view, changes, { mode: 'client', pending: () => true }).writes) local.set(syncKey(c.store, c.id), c);
  };
  const localOf = (...list: Change[]): Map<string, Change> => new Map(list.map((c) => [syncKey(c.store, c.id), c]));

  it('uma edição velha na fila, de um registro que a restauração deixou como estava, perde: a conta fica com a restaurada, no piso, e o aparelho converge', async () => {
    const user = 'piso-edicao-velha';
    await sync(user, [session, solve('a'), solve('b')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const offline: Change = { ...solve('a', 7000), updatedAt: T0 + 500 }; // editado offline, na fila, antes da restauração
    const at = T0 + 1000;
    expect(await restore(user, dayOf(T0), at)).toEqual({ status: 204, body: null }); // a cópia é a conta: nada gravado, e o piso fica
    expect(await stateOf(user, 'restoreFloor')).toBe(String(at));
    const [writes, day] = [await writesOf(user), await dayRows(at)];

    const res = await sync(user, [offline], at + 100);
    const kept: Change = { ...solve('a'), updatedAt: at, deletionStamp: at };
    expect(res.accepted).toBe(1);
    expect(res.changes.filter((c) => c.id === 'a')).toEqual([kept]); // a volta leva a versão da conta, no piso
    expect((await recordsOf(user)).get('solves/a')).toEqual(kept);
    // A regravação no piso é uma escrita como as outras: conta no dia da conta e no teto do ambiente.
    expect([await writesOf(user), await dayRows(at)]).toEqual([writes + rowsOf(1), day + rowsOf(1)]);
    // O aparelho junta a volta e fica igual à conta.
    const device = localOf(session, offline, solve('b'));
    deviceApply(device, res.changes);
    expect(device).toEqual(await recordsOf(user));
  });

  it('um registro novo abaixo do piso passa; uma mudança com uma das datas no piso ou acima segue o merge de sempre', async () => {
    const user = 'piso-novo-e-depois';
    await sync(user, [session, solve('a'), solve('b')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    const at = T0 + 1000;
    expect((await restore(user, dayOf(T0), at)).status).toBe(204);
    const fresh: Change = { ...solve('novo'), updatedAt: T0 + 600, deletionStamp: T0 + 600 }; // criado offline antes da restauração
    const later: Change = { ...solve('b', 8000), updatedAt: at }; // editado depois dela
    const res = await sync(user, [fresh, later], at + 100);
    expect(res.accepted).toBe(2);
    const records = await recordsOf(user);
    expect([records.get('solves/novo'), records.get('solves/b')]).toEqual([fresh, later]);
  });

  it('restaurar X pelo aparelho e depois Y no servidor: a fila de X perde, e a conta e o aparelho terminam em Y', async () => {
    const user = 'piso-x-depois-y';
    await sync(user, [session, solve('a'), solve('b')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true); // X: s1, a, b
    const t1 = T0 + DAY;
    await sync(user, [{ ...solve('a'), updatedAt: t1, deletedAt: t1, deletionStamp: t1 }, solve('c')], t1);
    expect(await stubOf(user).snapshot(t1)).toBe(true); // Y: s1, a na lixeira, b, c
    await sync(user, [{ ...solve('b', 8000), updatedAt: t1 + 100 }, solve('d')], t1 + 100); // agora: b editado e d novo

    // O aparelho restaura X nele (as mudanças com a data dele, na fila: a de volta, b como era, c e d para a lixeira) e ainda não sincronizou.
    const read = async (name: string): Promise<KlickExport> => (await gunzipJson(await (await env.SNAPSHOTS.get(snapshotKey(user, name)))!.arrayBuffer())) as KlickExport;
    const copyOf = (data: KlickExport) => ({ sessions: data.sessions, solves: data.solves, practice: data.practice ?? null, duels: data.duels ?? null });
    const device = await recordsOf(user);
    const queued = restoreChanges([...device.values()], copyOf(await read(dayOf(T0))), null, t1 + 200);
    expect(queued.map((c) => `${c.id}:${c.deletedAt === null ? 'ativo' : 'lixeira'}`).sort()).toEqual(['a:ativo', 'b:ativo', 'c:lixeira', 'd:lixeira']);
    for (const c of queued) device.set(syncKey(c.store, c.id), c);

    // Outro aparelho restaura Y no servidor, depois.
    expect((await restore(user, dayOf(t1), t1 + 300)).status).toBe(204);
    const y = copyOf(await read(dayOf(t1)));
    expect(restoreChanges([...(await recordsOf(user)).values()], y, null, 0)).toEqual([]); // a conta é Y

    // A fila de X sobe: tudo abaixo do piso perde, e a conta continua Y.
    const res = await sync(user, queued, t1 + 400);
    expect(res.accepted).toBe(queued.length);
    expect(restoreChanges([...(await recordsOf(user)).values()], y, null, 0)).toEqual([]);
    deviceApply(device, res.changes);
    expect(device).toEqual(await recordsOf(user));
  });

  // O acabamento (A1): a restauração pelo aparelho também é "a última restauração vence". O aparelho gasta uma data do relógio (o piso F)
  // antes de gravar a restauração, cujos passos ficam acima dela, e manda F no sync seguinte (`floor`). O servidor sobe restoreFloor até F
  // (no máximo agora + 10 min), antes de juntar o lote, e confirma (`floorSet`); a regra do I1 faz o resto.
  const syncWith = async (user: string, changes: Change[], now: number, o: { floor?: number; device?: string } = {}): Promise<SyncResponse> => {
    const body = { v: SYNC_PROTOCOL, account: user, deviceId: o.device ?? 'd1', cursor: 0, clock: now, changes, ...(o.floor === undefined ? {} : { floor: o.floor }) };
    const res = await call('/api/sync', postJson(body), { deps: testDeps({ user, now: () => now }) });
    expect(res.status).toBe(200);
    return (await res.json()) as SyncResponse;
  };

  it('o piso que o aparelho manda depois de restaurar nele: a mudança velha de outro aparelho perde e volta no piso; os passos da restauração vencem', async () => {
    const user = 'piso-aparelho';
    await sync(user, [session, solve('a'), solve('b')]);
    const offline: Change = { ...solve('a', 7000), updatedAt: T0 + 500 }; // outro aparelho, na fila, de antes da restauração
    const floor = T0 + 1000; // a data que o aparelho gastou antes de gravar a restauração
    const step: Change = { ...solve('b', 8000), updatedAt: floor + 1, deletionStamp: floor + 1 }; // um passo dela, acima do piso
    const mine = await syncWith(user, [step], floor + 100, { floor });
    expect([mine.accepted, mine.floorSet]).toEqual([1, true]);
    expect(await stateOf(user, 'restoreFloor')).toBe(String(floor));

    const res = await syncWith(user, [offline], floor + 200, { device: 'd2' });
    expect(res.floorSet).toBeUndefined(); // sem piso no pedido, nada a confirmar
    const kept: Change = { ...solve('a'), updatedAt: floor, deletionStamp: floor };
    expect(res.changes.filter((c) => c.id === 'a')).toEqual([kept]);
    const records = await recordsOf(user);
    expect([records.get('solves/a'), records.get('solves/b')]).toEqual([kept, step]);
    const device = localOf(session, offline, solve('b'));
    deviceApply(device, res.changes);
    expect(device).toEqual(records);
  });

  it('o piso do aparelho fica no máximo 10 minutos à frente da hora do servidor, e nunca desce', async () => {
    const user = 'piso-aparelho-futuro';
    await sync(user, [session, solve('a')]);
    expect((await syncWith(user, [], T0, { floor: T0 + 3_600_000 })).floorSet).toBe(true);
    expect(await stateOf(user, 'restoreFloor')).toBe(String(T0 + 600_000));
    expect((await syncWith(user, [], T0 + 1000, { floor: T0 })).floorSet).toBe(true); // confirmado, mas o piso fica
    expect(await stateOf(user, 'restoreFloor')).toBe(String(T0 + 600_000));
  });

  it('sem leituras no dia, o servidor não lê o pedido: o piso não sobe nem é confirmado, e o aparelho o manda de novo', async () => {
    const user = 'piso-aparelho-sem-leituras';
    await sync(user, [session, solve('a')]);
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET });
    const res = await syncWith(user, [], T0, { floor: T0 - 1 });
    expect([res.readsDeferred, res.floorSet]).toEqual([true, undefined]);
    expect(await stateOf(user, 'restoreFloor')).toBeNull();
  });

  it('restaurar X pelo aparelho A (que sobe aos poucos) e depois Y pelo aparelho B: a conta e os dois aparelhos terminam exatamente em Y', async () => {
    const user = 'piso-aparelho-a-b';
    await sync(user, [session, solve('a'), solve('b')]);
    expect(await stubOf(user).snapshot(T0)).toBe(true); // X: s1, a, b
    const t1 = T0 + DAY;
    await sync(user, [{ ...solve('a'), updatedAt: t1, deletedAt: t1, deletionStamp: t1 }, solve('c')], t1);
    expect(await stubOf(user).snapshot(t1)).toBe(true); // Y: s1, a na lixeira, b, c
    await sync(user, [{ ...solve('b', 8000), updatedAt: t1 + 100 }, solve('d')], t1 + 100); // agora: b editado e d novo
    const read = async (name: string): Promise<KlickExport> => (await gunzipJson(await (await env.SNAPSHOTS.get(snapshotKey(user, name)))!.arrayBuffer())) as KlickExport;
    const copyOf = (data: KlickExport) => ({ sessions: data.sessions, solves: data.solves, practice: data.practice ?? null, duels: data.duels ?? null });
    const y = copyOf(await read(dayOf(t1)));

    // A restaura X: gasta o piso, grava as diferenças acima dele, e a fila dele vai como o aparelho a manda (as exclusões na frente, A2).
    // Só o primeiro lote sobe agora, com o piso; o resto espera o orçamento dos próximos dias.
    const deviceA = await recordsOf(user);
    const floorA = t1 + 200;
    const queuedA = restoreChanges([...deviceA.values()], copyOf(await read(dayOf(T0))), null, floorA + 1);
    const ordered = [...queuedA.filter((c) => c.deletedAt !== null), ...queuedA.filter((c) => c.deletedAt === null)];
    expect(ordered.map((c) => `${c.id}:${c.deletedAt === null ? 'ativo' : 'lixeira'}`)).toEqual(['c:lixeira', 'd:lixeira', 'a:ativo', 'b:ativo']);
    for (const c of queuedA) deviceA.set(syncKey(c.store, c.id), c);
    deviceApply(deviceA, (await syncWith(user, ordered.slice(0, 2), t1 + 250, { floor: floorA, device: 'A' })).changes);

    // B sincroniza (recebe o que A subiu) e restaura Y nele, com um piso acima de tudo o que viu.
    const deviceB = await recordsOf(user);
    const floorB = t1 + 400;
    const queuedB = restoreChanges([...deviceB.values()], y, null, floorB + 1);
    for (const c of queuedB) deviceB.set(syncKey(c.store, c.id), c);
    const fromB = await syncWith(user, queuedB, t1 + 450, { floor: floorB, device: 'B' });
    expect([fromB.accepted, fromB.floorSet]).toEqual([queuedB.length, true]);
    deviceApply(deviceB, fromB.changes);

    // O resto da fila de A sobe depois: abaixo do piso de B, perde; a conta fica Y.
    const restA = await syncWith(user, ordered.slice(2), t1 + 600, { device: 'A' });
    expect(restA.accepted).toBe(2);
    deviceApply(deviceA, restA.changes);
    const account = await recordsOf(user);
    expect(restoreChanges([...account.values()], y, null, 0)).toEqual([]);
    // Os dois aparelhos, com o que recebem pelo sync, terminam iguais à conta.
    deviceApply(deviceB, (await syncWith(user, [], t1 + 700, { device: 'B' })).changes);
    expect(deviceA).toEqual(account);
    expect(deviceB).toEqual(account);
  });
});
