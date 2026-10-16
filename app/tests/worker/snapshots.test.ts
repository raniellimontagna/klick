import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Change, CloudCopy, SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { emailKeyOf } from '../../worker/abuse';
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

async function sync(user: string, changes: Change[], cursor = 0, now = () => T0, device = 'd1'): Promise<SyncResponse> {
  const res = await call('/api/sync', postJson({ v: 1, deviceId: device, cursor, clock: T0, changes }), { deps: testDeps({ user, now }) });
  return (await res.json()) as SyncResponse;
}
const copies = async (user: string): Promise<CloudCopy[]> =>
  ((await (await call('/api/snapshots', {}, { deps: testDeps({ user }) })).json()) as { copies: CloudCopy[] }).copies;

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
    expect((await sync(user, [], 0)).changes).toEqual([]);
  });

  it('depois de apagar, um aparelho com o cursor adiante recomeça do zero e recebe o que foi gravado depois', async () => {
    const user = 'conta-recomeca';
    const first = await sync(user, [session, solve('a'), solve('b')]);
    expect(first.cursor).toBe(3);
    await stubOf(user).wipe();
    const pushed = await sync(user, [solve('novo')], first.cursor);
    expect(pushed.changes.map((c) => c.id)).toEqual(['novo']);
    expect(pushed.cursor).toBe(1);
    const other = await sync(user, [], first.cursor, () => T0, 'd2'); // o outro aparelho, parado na revisão de antes
    expect([other.changes.map((c) => c.id), other.cursor]).toEqual([['novo'], 1]);
  });
});
