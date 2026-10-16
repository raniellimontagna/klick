import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Change, CloudCopy, SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { emailKeyOf } from '../../worker/abuse';
import type { Env } from '../../worker/env';
import { dayOf, gunzipJson, nextSnapshotAt, preRestoreName, snapshotKey } from '../../worker/snapshots';
import { call, postJson, T0, testDeps, testEnv } from './helpers';

const HOUR = 3_600_000;
const solve = (id: string, ms = 9000): Change => ({
  store: 'solves', id, updatedAt: T0, deletedAt: null, deletionStamp: T0,
  data: { sessionId: 's1', event: '333', ms, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0 },
});
const session: Change = { store: 'sessions', id: 's1', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0 };
const stubOf = (user: string) => env.ACCOUNT.get(env.ACCOUNT.idFromName(user));
const alarmOf = (user: string) => runInDurableObject(stubOf(user), (_o, state) => state.storage.getAlarm());

const syncCall = (user: string, changes: Change[], cursor = 0, now = () => T0, device = 'd1'): Promise<Response> =>
  call('/api/sync', postJson({ v: 1, deviceId: device, cursor, clock: T0, changes }), { deps: testDeps({ user, now }) });
async function sync(user: string, changes: Change[], cursor = 0, now = () => T0, device = 'd1'): Promise<SyncResponse> {
  return (await (await syncCall(user, changes, cursor, now, device)).json()) as SyncResponse;
}
const copies = async (user: string): Promise<CloudCopy[]> =>
  ((await (await call('/api/snapshots', {}, { deps: testDeps({ user }) })).json()) as { copies: CloudCopy[] }).copies;
const deleteAccount = (user: string): Promise<Response> =>
  call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `${user}@exemplo.com` }) }, {
    deps: testDeps({ user }),
  });

// Segura as gravações no R2 do objeto da conta até `gate.open`: o que chega ao objeto com uma gravação no meio (as corridas que os testes
// conferem) acontece de verdade. O objeto e o teste dividem só um objeto simples, sem promessa de um contexto resolvida no outro.
interface Gate {
  started: boolean;
  open: boolean;
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 1000 && !cond(); i++) await wait(2);
  if (!cond()) throw new Error('o objeto não chegou à gravação');
}
async function holdUploads(user: string): Promise<Gate> {
  const gate: Gate = { started: false, open: false };
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { env: Env };
    const held = new Proxy(o.env.SNAPSHOTS, {
      get(target, key) {
        if (key === 'put') {
          return async (...args: Parameters<R2Bucket['put']>) => {
            gate.started = true;
            while (!gate.open) await wait(2);
            return target.put(...args);
          };
        }
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    o.env = { ...o.env, SNAPSHOTS: held };
  });
  return gate;
}

describe('a cópia diária (spec 8.3)', () => {
  it('o primeiro sync agenda o alarme pela hora de verdade; o alarme grava a cópia do dia no formato do export, e só se a conta mudou', async () => {
    const before = Date.now();
    await sync('conta-alarme', [session, solve('a'), solve('b')]); // a hora do pedido (T0) fica no passado: o alarme não segue ela
    expect([nextSnapshotAt(before), nextSnapshotAt(Date.now())]).toContain(await alarmOf('conta-alarme'));
    const stub = stubOf('conta-alarme');
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const day = dayOf(Date.now());
    const object = await env.SNAPSHOTS.get(snapshotKey('conta-alarme', day));
    const data = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
    expect(data).toMatchObject({ format: 'klick', version: 1 });
    expect(data.solves.map((s) => s.id)).toEqual(['a', 'b']);
    expect(await copies('conta-alarme')).toEqual([{ name: day, day, kind: 'daily', solves: 2 }]);
    expect(await stub.snapshot(Date.now())).toBe(false); // nada mudou desde a última
    expect(await alarmOf('conta-alarme')).toBeGreaterThan(Date.now()); // e o de amanhã já está marcado
  });

  it('o alarme também apaga os pedidos de código com mais de uma hora, de qualquer conta (spec 10)', async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('e:velho', now - 2 * HOUR),
      env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('i:recente', now - 10 * 60_000),
    ]);
    await sync('conta-limpa', [solve('x')]);
    expect(await runDurableObjectAlarm(stubOf('conta-limpa'))).toBe(true);
    const keys = await env.DB.prepare("SELECT key FROM otp_requests WHERE key IN ('e:velho', 'i:recente')").all<{ key: string }>();
    expect(keys.results.map((r) => r.key)).toEqual(['i:recente']);
  });

  it('a hora da cópia é logo depois da meia-noite em Brasília; a de antes de restaurar leva a hora em UTC', () => {
    const t = Date.UTC(2026, 9, 15, 2, 0); // 23h do dia 14 em Brasília
    expect(new Date(nextSnapshotAt(t)).toISOString()).toBe('2026-10-15T03:05:00.000Z');
    expect(new Date(nextSnapshotAt(Date.UTC(2026, 9, 15, 3, 5))).toISOString()).toBe('2026-10-16T03:05:00.000Z');
    expect(dayOf(t)).toBe('2026-10-14');
    expect(preRestoreName(Date.UTC(2026, 9, 15, 21, 3, 7))).toBe('2026-10-15T21-03-07Z-antes');
    expect(preRestoreName(t)).toBe('2026-10-15T02-00-00Z-antes'); // o dia e a hora em UTC, mesmo quando em Brasília ainda é dia 14
  });
});

describe('restaurar um dia (spec 8.3)', () => {
  it('grava antes a cópia "antes de restaurar"; o dia volta com datas novas, e o que sobra vai para a lixeira', async () => {
    await sync('conta-volta', [session, solve('a', 1000)]);
    const stub = stubOf('conta-volta');
    expect(await stub.snapshot(T0)).toBe(true);
    await sync('conta-volta', [solve('extra'), { ...solve('a', 2000), updatedAt: T0 + 50 }]);
    const res = await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}), { deps: testDeps({ user: 'conta-volta', now: () => T0 + 1000 }) });
    expect(res.status).toBe(204);
    const list = await copies('conta-volta');
    expect(list.map((c) => c.kind).sort()).toEqual(['daily', 'pre-restore']);
    expect(list.find((c) => c.kind === 'pre-restore')).toEqual({ name: preRestoreName(T0 + 1000), day: dayOf(T0 + 1000), kind: 'pre-restore', solves: 2 });
    const all = new Map((await sync('conta-volta', [], 0)).changes.map((c) => [c.id, c]));
    expect(all.get('a')).toMatchObject({ deletedAt: null, data: { ms: 1000 } });
    expect(all.get('a')!.updatedAt).toBeGreaterThan(T0 + 50);
    expect(all.get('extra')!.deletedAt).not.toBeNull();
  });

  it('um nome torto é 400; um dia sem cópia é 404; na rajada, listar e restaurar dão 429', async () => {
    const deps = testDeps({ user: 'conta-nome' });
    expect((await call('/api/snapshots/..%2Foutra/restore', postJson({}), { deps })).status).toBe(400);
    expect((await call('/api/snapshots/%E0%A4%A/restore', postJson({}), { deps })).status).toBe(400); // nem se lê como URI
    await sync('conta-nome', [solve('z')]);
    expect((await call('/api/snapshots/2020-01-01/restore', postJson({}), { deps })).status).toBe(404);
    const busy = testEnv({ API_BURST: { limit: async () => ({ success: false }) } });
    expect((await call('/api/snapshots/2020-01-01/restore', postJson({}), { deps, env: busy })).status).toBe(429);
    expect((await call('/api/snapshots', {}, { deps, env: busy })).status).toBe(429);
  });

  it('duas restaurações no mesmo segundo: a cópia "antes de restaurar" fica com o estado de antes da primeira', async () => {
    const user = 'conta-duas';
    await sync(user, [session, solve('a', 1000)]);
    await stubOf(user).snapshot(T0);
    await sync(user, [solve('extra')]);
    const deps = testDeps({ user, now: () => T0 + 1000 });
    const restore = () => call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}), { deps });
    expect((await restore()).status).toBe(204);
    expect((await restore()).status).toBe(204); // o clique duplo
    const object = await env.SNAPSHOTS.get(snapshotKey(user, preRestoreName(T0 + 1000)));
    const before = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
    expect(before.solves.map((s) => [s.id, s.deletedAt])).toEqual([['a', null], ['extra', null]]);
    expect((await copies(user)).filter((c) => c.kind === 'pre-restore')).toHaveLength(1);
  });

  it('um sync que chega no meio de uma restauração espera ela terminar: o que ele grava não vai para a lixeira', async () => {
    const user = 'conta-meio';
    await sync(user, [session, solve('a', 1000)]);
    await stubOf(user).snapshot(T0);
    const gate = await holdUploads(user);
    const restore = call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}), { deps: testDeps({ user, now: () => T0 + 1000 }) });
    await until(() => gate.started); // a cópia "antes de restaurar" está a caminho do R2
    let synced = false;
    const during = sync(user, [solve('durante')], 0, () => T0, 'd2').then((r) => {
      synced = true;
      return r;
    });
    await wait(30);
    expect(synced).toBe(false); // o objeto não atende ninguém enquanto restaura
    gate.open = true;
    expect((await restore).status).toBe(204);
    await during;
    const all = new Map((await sync(user, [], 0)).changes.map((c) => [c.id, c]));
    expect(all.get('durante')!.deletedAt).toBeNull();
    expect(all.get('a')).toMatchObject({ deletedAt: null, data: { ms: 1000 } });
  });
});

describe('apagar a conta (spec 7.7)', () => {
  it('confirma pelo e-mail; apaga na hora o objeto, as cópias e as linhas do D1', async () => {
    const user = 'conta-fim';
    const email = `${user}@exemplo.com`;
    const at = new Date(T0).toISOString();
    const verification = 'INSERT INTO verification (id, identifier, value, expiresAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)';
    await env.DB.batch([
      env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)').bind(user, '', email, at, at),
      env.DB.prepare(verification).bind('v-fim', `sign-in-otp-${email}`, 'hash:0', at, at, at),
      env.DB.prepare(verification).bind('v-outra', `sign-in-otp-x${email}`, 'hash:0', at, at, at), // outra conta, com o e-mail de dentro
      env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind(await emailKeyOf(email, env.BETTER_AUTH_SECRET), Date.now()),
    ]);
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    const deps = testDeps({ user });
    const del = (typed: string) => call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: typed }) }, { deps });
    expect((await del('outro@exemplo.com')).status).toBe(400);
    expect((await del(` ${user.toUpperCase()}@EXEMPLO.COM `)).status).toBe(204);
    expect(await alarmOf(user)).toBeNull();
    expect(await copies(user)).toEqual([]);
    expect(await env.DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(user).first()).toBeNull();
    const left = await env.DB.prepare("SELECT id FROM verification WHERE id IN ('v-fim', 'v-outra')").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(['v-outra']);
    const requests = await env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ?').bind(await emailKeyOf(email, env.BETTER_AUTH_SECRET)).first<{ n: number }>();
    expect(requests?.n).toBe(0);
    expect((await syncCall(user, [])).status).toBe(401);
  });

  it('o objeto apagado não volta: com a sessão ainda aberta, o sync e a restauração recebem 401, e nada é gravado nem agendado', async () => {
    const user = 'conta-volta-nao';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    expect((await deleteAccount(user)).status).toBe(204);
    // A sessão falsa continua valendo: é o sync de outro aparelho que chega antes de as linhas do D1 sumirem.
    expect((await syncCall(user, [solve('depois')], 0, () => T0, 'd2')).status).toBe(401);
    expect((await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}), { deps: testDeps({ user }) })).status).toBe(401);
    expect(await stubOf(user).snapshot(Date.now())).toBe(false);
    expect(await alarmOf(user)).toBeNull();
    expect(await copies(user)).toEqual([]);
    const count = await runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ n: number }>('SELECT count(*) AS n FROM records').one().n);
    expect(count).toBe(0);
    expect((await deleteAccount(user)).status).toBe(204); // apagar de novo (um pedido que falhou no meio) funciona
  });

  it('um alarme no meio da cópia não traz a conta de volta: apagar espera a cópia terminar e a leva junto', async () => {
    const user = 'conta-alarme-meio';
    await sync(user, [session, solve('a')]);
    const gate = await holdUploads(user);
    const alarm = runDurableObjectAlarm(stubOf(user));
    await until(() => gate.started); // a cópia do dia está a caminho do R2
    const deleted = deleteAccount(user);
    await wait(30); // sem a espera do objeto, a exclusão terminaria aqui, antes de a cópia chegar ao R2
    gate.open = true;
    expect(await alarm).toBe(true);
    expect((await deleted).status).toBe(204);
    expect(await copies(user)).toEqual([]);
    expect(await alarmOf(user)).toBeNull();
  });

  it('um cursor além da revisão da conta recomeça do zero', async () => {
    const user = 'conta-recomeca';
    await sync(user, [session, solve('a'), solve('b')]);
    const ahead = await sync(user, [solve('novo')], 50, () => T0, 'd2'); // um cursor que este servidor nunca deu
    expect([ahead.changes.map((c) => c.id), ahead.cursor]).toEqual([['s1', 'a', 'b', 'novo'], 4]);
  });
});
