import { runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { TOMBSTONE_KEEP_MS } from '../../src/core/sync/limits';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, type Change, type CloudCopies, type CloudCopy, type SyncResponse } from '../../src/core/sync/types';
import type { KlickExport } from '../../src/core/types';
import { emailKeyOf } from '../../worker/abuse';
import type { Env } from '../../worker/env';
import { COMPACT_PER_DAY, DAILY_WRITE_BUDGET, utcDay } from '../../worker/limits';
import { COMPACTABLE } from '../../worker/records-sql';
import { dayOf, gunzipJson, nextSnapshotAt, preRestoreName, snapshotKey, snapshotPrefix } from '../../worker/snapshots';
import { authDeps, call, postJson, setState, stateOf, stubOf, T0, testDeps, testEnv } from './helpers';

const as = (user: string): Record<string, string> => ({ [ACCOUNT_HEADER]: user }); // a conta que o aparelho espera (C1)

const HOUR = 3_600_000;
const solve = (id: string, ms = 9000): Change => ({
  store: 'solves', id, updatedAt: T0, deletedAt: null, deletionStamp: T0,
  data: { sessionId: 's1', event: '333', ms, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0 },
});
const session: Change = { store: 'sessions', id: 's1', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0 };
const alarmOf = (user: string) => runInDurableObject(stubOf(user), (_o, state) => state.storage.getAlarm());

const syncCall = (user: string, changes: Change[], cursor = 0, now = () => T0, device = 'd1'): Promise<Response> =>
  call('/api/sync', postJson({ v: SYNC_PROTOCOL, account: user, deviceId: device, cursor, clock: T0, changes }), { deps: testDeps({ user, now }) });
async function sync(user: string, changes: Change[], cursor = 0, now = () => T0, device = 'd1'): Promise<SyncResponse> {
  return (await (await syncCall(user, changes, cursor, now, device)).json()) as SyncResponse;
}
// A lista das cópias (CloudCopies: as cópias e a pausa) e as cópias de verdade no R2, sem passar pelo objeto da conta (uma conta apagada
// recusa a lista).
const listOf = async (user: string): Promise<CloudCopies> => {
  const res = await call('/api/snapshots', { headers: as(user) }, { deps: testDeps({ user }) });
  expect(res.status).toBe(200);
  return (await res.json()) as CloudCopies;
};
const copies = async (user: string): Promise<CloudCopy[]> => (await listOf(user)).copies;
const objectsOf = async (user: string): Promise<string[]> => (await env.SNAPSHOTS.list({ prefix: snapshotPrefix(user) })).objects.map((o) => o.key);
const listStatus = async (user: string): Promise<number> => (await call('/api/snapshots', { headers: as(user) }, { deps: testDeps({ user }) })).status;
const deleteAccount = (user: string): Promise<Response> =>
  call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...as(user) }, body: JSON.stringify({ email: `${user}@exemplo.com` }) }, {
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
    expect(await listOf('conta-alarme')).toEqual({ copies: [{ name: day, day, kind: 'daily', solves: 2 }], paused: null });
    expect(await stub.snapshot(Date.now())).toBe(false); // nada mudou desde a última
    expect(await alarmOf('conta-alarme')).toBeGreaterThan(Date.now()); // e o de amanhã já está marcado
  });

  // A revisão final (I5): a limpeza que a política promete (uma vez por dia) não pode depender de uma conta viva nem da cópia no R2 dar certo.
  // Ela saiu do alarme do objeto e foi para o Cron Trigger do Worker (worker/index.ts, scheduled).
  it('o alarme do objeto só grava a cópia: os pedidos de código velhos ficam para a limpeza diária do Worker', async () => {
    const now = Date.now();
    await env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('e:fica-para-o-cron', now - 2 * HOUR).run();
    await sync('conta-so-copia', [solve('x')]);
    expect(await runDurableObjectAlarm(stubOf('conta-so-copia'))).toBe(true);
    const left = await env.DB.prepare("SELECT key FROM otp_requests WHERE key = 'e:fica-para-o-cron'").all<{ key: string }>();
    expect(left.results).toHaveLength(1);
    await env.DB.prepare("DELETE FROM otp_requests WHERE key = 'e:fica-para-o-cron'").run();
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

// A marca compactada (endurecimento, decisão 5): o alarme, antes da cópia do dia, tira o conteúdo dos solves apagados há mais de 30 dias. O
// alarme usa a hora de verdade, então as exclusões são contadas a partir dela.
describe('a marca compactada no alarme (decisão 5)', () => {
  type Stored = { id: string; data: string; updated_at: number; deleted_at: number | null; deletion_stamp: number; rev: number; parent: string | null };
  const gone = (id: string, at: number): Change => ({ ...solve(id), updatedAt: at, deletedAt: at, deletionStamp: at });
  const solvesIn = (user: string) =>
    runInDurableObject(stubOf(user), (_o, state) => {
      const rows = state.storage.sql.exec<Stored>("SELECT id, data, updated_at, deleted_at, deletion_stamp, rev, parent FROM records WHERE store = 'solves'");
      return new Map(rows.toArray().map((r) => [r.id, { ...r }]));
    });
  const marks = (user: string) =>
    runInDurableObject(stubOf(user), (_o, state) => state.storage.sql.exec<{ n: number }>("SELECT count(*) AS n FROM records WHERE data = '{}'").one().n);

  it('o alarme guarda só a marca dos solves apagados há mais de 30 dias: data {}, mesma revisão, mesmas datas', async () => {
    const user = 'conta-marca';
    const now = Date.now();
    await sync(user, [session, gone('velho', now - TOMBSTONE_KEEP_MS - HOUR), gone('recente', now - TOMBSTONE_KEEP_MS + HOUR), solve('vivo')]);
    const before = await solvesIn(user);
    const [bytes, active] = [Number(await stateOf(user, 'bytes')), await stateOf(user, 'active')];
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    const after = await solvesIn(user);
    expect(after.get('velho')).toEqual({ ...before.get('velho'), data: '{}' }); // a sessão (parent) fica: a cascata ainda a acha
    expect(after.get('recente')).toEqual(before.get('recente'));
    expect(after.get('vivo')).toEqual(before.get('vivo'));
    expect(Number(await stateOf(user, 'bytes'))).toBe(bytes - (before.get('velho')!.data.length - '{}'.length));
    expect(await stateOf(user, 'active')).toBe(active);
    expect((JSON.parse((await stateOf(user, 'writes'))!) as { n: number }).n).toBe(1); // conta no orçamento do dia de hoje
  });

  it('no máximo COMPACT_PER_DAY por alarme', async () => {
    const user = 'conta-marcas';
    const old = Date.now() - TOMBSTONE_KEEP_MS - HOUR;
    const all = Array.from({ length: COMPACT_PER_DAY + 5 }, (_, i) => gone(`m${i}`, old));
    for (let i = 0; i < all.length; i += 500) await sync(user, all.slice(i, i + 500));
    // O orçamento de gravações do dia também segura a compactação: com 3 de folga, 3 marcas.
    await setState(user, 'writes', { day: utcDay(Date.now()), n: DAILY_WRITE_BUDGET - 3 });
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(await marks(user)).toBe(3);
    await setState(user, 'writes', { day: utcDay(Date.now()), n: 0 });
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(await marks(user)).toBe(3 + COMPACT_PER_DAY);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect(await marks(user)).toBe(COMPACT_PER_DAY + 5);
  });

  it('um aparelho que começa do zero recebe a marca e a cópia do dia não a leva', async () => {
    const user = 'conta-marca-nova';
    const old = Date.now() - TOMBSTONE_KEEP_MS - HOUR;
    const first = await sync(user, [session, gone('velho', old), solve('vivo')]);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    const object = await env.SNAPSHOTS.get(snapshotKey(user, dayOf(Date.now())));
    const copy = (await gunzipJson(await object!.arrayBuffer())) as KlickExport;
    expect(copy.solves.map((s) => s.id)).toEqual(['vivo']);
    const fresh = await sync(user, [], 0, () => T0, 'novo');
    expect(fresh.changes.find((c) => c.id === 'velho')).toEqual({ store: 'solves', id: 'velho', data: {}, updatedAt: old, deletedAt: old, deletionStamp: old });
    expect((await sync(user, [], first.cursor)).changes).toEqual([]); // quem já viu o solve não recebe nada
  });

  it('a cascata da sessão não mexe na marca; o aparelho que ainda tem o conteúdo o manda de novo, e o alarme seguinte o compacta outra vez', async () => {
    const user = 'conta-marca-volta';
    const old = Date.now() - TOMBSTONE_KEEP_MS - HOUR;
    await sync(user, [session, gone('velho', old), solve('vivo')]);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    const mark = (await solvesIn(user)).get('velho')!;
    expect(mark.data).toBe('{}');
    await sync(user, [{ ...session, updatedAt: T0 + 10, deletedAt: T0 + 10, deletionStamp: T0 + 10 }]); // a cascata apaga o vivo
    const afterCascade = await solvesIn(user);
    expect(afterCascade.get('vivo')!.deleted_at).toBe(T0 + 10);
    expect(afterCascade.get('velho')).toEqual(mark);
    // Um aparelho que ficou fora mais de 30 dias e editou o solve na lixeira dele: o conteúdo vence a marca, com revisão nova.
    const bytes = Number(await stateOf(user, 'bytes'));
    const back = { ...gone('velho', old), updatedAt: T0 + 20, data: { ...(solve('velho').data as object), note: 'de volta' } };
    expect((await sync(user, [back], 0, () => T0, 'd-antigo')).rejected).toEqual([]);
    const reuploaded = (await solvesIn(user)).get('velho')!;
    expect(reuploaded.rev).toBeGreaterThan(mark.rev);
    expect(Number(await stateOf(user, 'bytes'))).toBe(bytes + reuploaded.data.length - '{}'.length);
    expect(await runDurableObjectAlarm(stubOf(user))).toBe(true);
    expect((await solvesIn(user)).get('velho')).toEqual({ ...reuploaded, data: '{}' });
  });

  // O alarme roda todo dia em toda conta: a busca dos que vencem lê o índice dos solves apagados com conteúdo, não a conta inteira.
  it('a compactação procura pelo índice dos apagados com conteúdo', async () => {
    const plan = await runInDurableObject(stubOf('conta-plano'), (_o, state) =>
      state.storage.sql.exec<{ detail: string }>(`EXPLAIN QUERY PLAN ${COMPACTABLE}`, 0, COMPACT_PER_DAY).toArray().map((r) => r.detail),
    );
    expect(plan).toEqual([expect.stringContaining('USING INDEX records_tombs')]);
  });
});

describe('restaurar um dia (spec 8.3)', () => {
  it('grava antes a cópia "antes de restaurar"; o dia volta com datas novas, e o que sobra vai para a lixeira', async () => {
    await sync('conta-volta', [session, solve('a', 1000)]);
    const stub = stubOf('conta-volta');
    expect(await stub.snapshot(T0)).toBe(true);
    await sync('conta-volta', [solve('extra'), { ...solve('a', 2000), updatedAt: T0 + 50 }]);
    const res = await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, as('conta-volta')), { deps: testDeps({ user: 'conta-volta', now: () => T0 + 1000 }) });
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
    expect((await call('/api/snapshots/2020-01-01/restore', postJson({}, as('conta-nome')), { deps })).status).toBe(404);
    const busy = testEnv({ API_BURST: { limit: async () => ({ success: false }) } });
    expect((await call('/api/snapshots/2020-01-01/restore', postJson({}, as('conta-nome')), { deps, env: busy })).status).toBe(429);
    expect((await call('/api/snapshots', { headers: as('conta-nome') }, { deps, env: busy })).status).toBe(429);
  });

  it('duas restaurações no mesmo segundo: a cópia "antes de restaurar" fica com o estado de antes da primeira', async () => {
    const user = 'conta-duas';
    await sync(user, [session, solve('a', 1000)]);
    await stubOf(user).snapshot(T0);
    await sync(user, [solve('extra')]);
    const deps = testDeps({ user, now: () => T0 + 1000 });
    const restore = () => call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, as(user)), { deps });
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
    const restore = call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, as(user)), { deps: testDeps({ user, now: () => T0 + 1000 }) });
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
    const del = (typed: string) =>
      call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...as(user) }, body: JSON.stringify({ email: typed }) }, { deps });
    expect((await del('outro@exemplo.com')).status).toBe(400);
    expect((await del(` ${user.toUpperCase()}@EXEMPLO.COM `)).status).toBe(204);
    expect(await alarmOf(user)).toBeNull();
    expect(await objectsOf(user)).toEqual([]);
    expect(await listStatus(user)).toBe(401); // a lista de uma conta apagada: como uma sessão revogada
    expect(await env.DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(user).first()).toBeNull();
    const left = await env.DB.prepare("SELECT id FROM verification WHERE id IN ('v-fim', 'v-outra')").all<{ id: string }>();
    expect(left.results.map((r) => r.id)).toEqual(['v-outra']);
    const requests = await env.DB.prepare('SELECT count(*) AS n FROM otp_requests WHERE key = ?').bind(await emailKeyOf(email, env.BETTER_AUTH_SECRET)).first<{ n: number }>();
    expect(requests?.n).toBe(0);
    expect((await syncCall(user, [])).status).toBe(401);
  });

  // Revisão final (5.3): sem sessão, o aparelho precisa saber se a conta acabou (apagada em outro aparelho) ou se só a sessão venceu. O id da
  // conta é aleatório e só o aparelho o conhece: dizer 'gone' ou 'auth' para ele não revela nada de nenhum e-mail.
  it('apagar a conta sem sessão: 401 gone para uma conta que já não existe, 401 auth para uma que existe', async () => {
    const user = 'conta-sem-sessao';
    const at = new Date(T0).toISOString();
    await env.DB.prepare('INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 1, ?, ?)')
      .bind(user, '', `${user}@exemplo.com`, at, at)
      .run();
    const del = (headers: Record<string, string>) =>
      call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ email: `${user}@exemplo.com` }) }, {
        deps: testDeps({ user: null }),
      });
    const answer = async (res: Response) => [res.status, await res.json()];
    expect(await answer(await del(as('conta-que-nao-existe')))).toEqual([401, { error: 'gone' }]);
    expect(await answer(await del(as(user)))).toEqual([401, { error: 'auth' }]); // a conta existe: só a sessão venceu
    expect(await answer(await del({}))).toEqual([401, { error: 'auth' }]); // sem o id da conta, nada a dizer
    expect(await env.DB.prepare('SELECT id FROM "user" WHERE id = ?').bind(user).first()).not.toBeNull(); // e nada foi apagado
  });

  it('o objeto apagado não volta: com a sessão ainda aberta, o sync e a restauração recebem 401, e nada é gravado nem agendado', async () => {
    const user = 'conta-volta-nao';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    expect((await deleteAccount(user)).status).toBe(204);
    // A sessão falsa continua valendo: é o sync de outro aparelho que chega antes de as linhas do D1 sumirem.
    expect((await syncCall(user, [solve('depois')], 0, () => T0, 'd2')).status).toBe(401);
    expect((await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, as(user)), { deps: testDeps({ user }) })).status).toBe(401);
    expect(await stubOf(user).snapshot(Date.now())).toBe(false);
    expect(await alarmOf(user)).toBeNull();
    expect(await objectsOf(user)).toEqual([]);
    expect(await listStatus(user)).toBe(401);
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
    expect(await objectsOf(user)).toEqual([]);
    expect(await alarmOf(user)).toBeNull();
  });

  it('um cursor além da revisão da conta recomeça do zero', async () => {
    const user = 'conta-recomeca';
    await sync(user, [session, solve('a'), solve('b')]);
    const ahead = await sync(user, [solve('novo')], 50, () => T0, 'd2'); // um cursor que este servidor nunca deu
    expect([ahead.changes.map((c) => c.id), ahead.cursor]).toEqual([['s1', 'a', 'b', 'novo'], 4]);
  });
});

// A revisão final (C1): o aparelho diz a conta que espera, e a sessão de outra conta (a pessoa entrou com outro e-mail, e o aparelho ainda
// está na conta de antes) nunca lê nem grava nela. 401, como uma sessão que não vale para esta conta; sem a conta no pedido, 400.
describe('a conta que o aparelho espera (C1)', () => {
  it('o sync com o cookie de outra conta é 401 e não grava nem devolve nada, nas duas contas; sem a conta, 400', async () => {
    await sync('conta-c1-b', [session, solve('de-b')]);
    const deps = testDeps({ user: 'conta-c1-b' }); // o cookie é da conta B; o aparelho espera a conta A
    const res = await call('/api/sync', postJson({ v: SYNC_PROTOCOL, account: 'conta-c1-a', deviceId: 'd1', cursor: 0, clock: T0, changes: [solve('de-a')] }), { deps });
    expect([res.status, await res.json()]).toEqual([401, { error: 'auth' }]);
    expect((await sync('conta-c1-b', [], 0, () => T0, 'd2')).changes.map((c) => c.id)).toEqual(['s1', 'de-b']);
    expect((await sync('conta-c1-a', [], 0)).changes).toEqual([]);
    const missing = await call('/api/sync', postJson({ v: SYNC_PROTOCOL, deviceId: 'd1', cursor: 0, clock: T0, changes: [] }), { deps });
    expect(missing.status).toBe(400);
  });

  it('listar e restaurar as cópias e apagar a conta com a conta de outra sessão são 401, e nada muda; sem o cabeçalho, 400', async () => {
    const user = 'conta-c1-dona';
    await sync(user, [session, solve('a')]);
    await stubOf(user).snapshot(T0);
    const deps = testDeps({ user, now: () => T0 + 1000 });
    const wrong = as('conta-c1-outra');
    expect((await call('/api/snapshots', { headers: wrong }, { deps })).status).toBe(401);
    expect((await call('/api/snapshots', {}, { deps })).status).toBe(400);
    expect((await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, wrong), { deps })).status).toBe(401);
    expect((await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}), { deps })).status).toBe(400);
    const del = (headers: Record<string, string>) =>
      call('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ email: `${user}@exemplo.com` }) }, { deps });
    expect((await del(wrong)).status).toBe(401);
    expect((await del({})).status).toBe(400);
    // Nada mudou: só a cópia do dia (nenhuma "antes de restaurar"), e a conta continua viva, com o alarme da cópia.
    expect((await copies(user)).map((c) => c.kind)).toEqual(['daily']);
    expect((await sync(user, [], 0)).changes.map((c) => [c.id, c.deletedAt])).toEqual([['s1', null], ['a', null]]);
    expect(await alarmOf(user)).not.toBeNull();
  });
});
