import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/core/sync/merge';
import { MAX_DATA_CHARS } from '../../src/core/sync/shape';
import type { Change, SyncResponse } from '../../src/core/sync/types';
import { MAX_BODY } from '../../worker/router';
import { call, ORIGIN, postJson, T0, testDeps, testEnv } from './helpers';

const solve = (id: string, o: Partial<Change> & { note?: string; sessionId?: string } = {}): Change => ({
  store: 'solves',
  id,
  data: { sessionId: o.sessionId ?? 's1', event: '333', ms: 9000, penalty: null, at: T0, scramble: "R U R'", note: o.note ?? '', createdAt: T0 },
  updatedAt: o.updatedAt ?? T0,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? T0,
});
const session: Change = { store: 'sessions', id: 's1', data: { name: 'Sessão 1', event: '333', order: 0, createdAt: T0 }, updatedAt: T0, deletedAt: null, deletionStamp: T0 };

async function sync(user: string, changes: unknown[], cursor = 0, device = 'd1'): Promise<SyncResponse> {
  const res = await call('/api/sync', postJson({ v: 1, account: user, deviceId: device, cursor, clock: T0, changes }), { deps: testDeps({ user }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

describe('POST /api/sync (spec 6.1 e 8.2)', () => {
  it('sem sessão, 401', async () => {
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] }))).status).toBe(401);
  });

  it('aceita o lote, dá revisões e devolve o que mudou desde o cursor; o outro aparelho recebe', async () => {
    const first = await sync('conta-a', [session, solve('x1')]);
    expect(first).toMatchObject({ accepted: 2, rejected: [], cursor: 2, more: false, serverTime: T0 });
    expect(first.changes.map((c) => c.id)).toEqual(['s1', 'x1']);
    const other = await sync('conta-a', [], 0, 'd2');
    expect(other.changes.map((c) => `${c.store}/${c.id}`)).toEqual(['sessions/s1', 'solves/x1']);
    expect((await sync('conta-a', [], 2, 'd2')).changes).toEqual([]);
  });

  it('lotes de 500: `more` diz que há mais, e o cursor avança', async () => {
    const changes = Array.from({ length: 500 }, (_, i) => solve(`b${String(i).padStart(3, '0')}`));
    await sync('conta-lotes', changes);
    await sync('conta-lotes', [solve('b500')]);
    const page = await sync('conta-lotes', [], 0, 'd2');
    expect([page.changes.length, page.more, page.cursor]).toEqual([500, true, 500]);
    const rest = await sync('conta-lotes', [], page.cursor, 'd2');
    expect([rest.changes.length, rest.more]).toEqual([1, false]);
  });

  it('uma conta não lê nem grava na outra', async () => {
    await sync('conta-1', [solve('so-da-1')]);
    expect((await sync('conta-2', [])).changes).toEqual([]);
    await sync('conta-2', [solve('so-da-1', { note: 'da conta 2' })]);
    const one = await sync('conta-1', [], 0, 'd9');
    expect(one.changes.map((c) => (c.data as { note: string }).note)).toEqual(['']);
  });

  it('a exclusão vence a edição feita depois (D5), nos dois sentidos de chegada', async () => {
    await sync('conta-d5', [session, solve('x')]);
    await sync('conta-d5', [solve('x', { deletedAt: T0 + 10, deletionStamp: T0 + 10, updatedAt: T0 + 10 })]);
    const res = await sync('conta-d5', [solve('x', { note: 'editado offline', updatedAt: T0 + 20 })], 0, 'd2');
    const x = res.changes.find((c) => c.id === 'x')!;
    expect(x).toMatchObject({ deletedAt: T0 + 10, data: { note: 'editado offline' } });
  });

  it('a versão velha que chega depois do purge perde e volta corrigida para quem a mandou', async () => {
    await sync('conta-purge', [solve('y', { deletedAt: T0 + 5, deletionStamp: T0 + 5, updatedAt: T0 + 5 })]);
    const before = await sync('conta-purge', [], 0, 'd2');
    const stale = await sync('conta-purge', [solve('y')], before.cursor, 'd2');
    expect(stale.changes.map((c) => [c.id, c.deletedAt])).toEqual([['y', T0 + 5]]);
  });

  it('uma mudança inválida volta com o motivo e não derruba o lote', async () => {
    const res = await sync('conta-forma', [solve('ok'), { ...solve('ruim'), data: { sessionId: 's1' } }, { store: 'profile', id: 'x' }]);
    expect(res.accepted).toBe(1);
    expect(res.rejected).toEqual([
      { store: 'solves', id: 'ruim', reason: 'solve inválido' },
      { store: 'profile', id: 'x', reason: 'store desconhecida' },
    ]);
  });

  it('pedidos tortos: 426 para outra versão do protocolo, 415 sem JSON, 403 de outra origem, 400 com mais de 500 mudanças, 429 na rajada', async () => {
    const deps = testDeps({ user: 'conta-x' });
    expect((await call('/api/sync', postJson({ v: 2, deviceId: 'd', cursor: 0, clock: 0, changes: [] }), { deps })).status).toBe(426);
    expect((await call('/api/sync', { method: 'POST', body: '{}' }, { deps })).status).toBe(415);
    expect((await call('/api/sync', postJson({ v: 1 }, { Origin: 'https://outro.site' }), { deps })).status).toBe(403);
    const many = Array.from({ length: 501 }, (_, i) => solve(`m${i}`));
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: many }), { deps })).status).toBe(400);
    const busy = testEnv({ API_BURST: { limit: async () => ({ success: false }) } });
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] }), { deps, env: busy })).status).toBe(429);
  });

  it('a versão que perde ganha revisão nova e volta para quem a mandou; a igual à gravada não ganha (decisão 6)', async () => {
    const first = await sync('conta-rev', [solve('w', { note: 'nova', updatedAt: T0 + 10 })]);
    const old = await sync('conta-rev', [solve('w', { note: 'velha' })], first.cursor, 'd2');
    expect(old.cursor).toBe(first.cursor + 1);
    expect(old.changes).toEqual([solve('w', { note: 'nova', updatedAt: T0 + 10 })]);
    const same = await sync('conta-rev', [solve('w', { note: 'nova', updatedAt: T0 + 10 })], old.cursor, 'd3');
    expect([same.accepted, same.changes, same.cursor]).toEqual([1, [], old.cursor]);
  });

  it('o solve que muda de sessão leva a coluna parent junto: apagar a sessão de antes não o apaga, apagar a nova sim (spec 6.3)', async () => {
    const sx = { ...session, id: 'sx' };
    const sy = { ...session, id: 'sy' };
    const gone = (s: Change, at: number): Change => ({ ...s, updatedAt: at, deletedAt: at, deletionStamp: at });
    await sync('conta-parent', [sx, sy, solve('z', { sessionId: 'sx' })]);
    const moved = await sync('conta-parent', [solve('z', { sessionId: 'sy', updatedAt: T0 + 10 })]);
    const afterX = await sync('conta-parent', [gone(sx, T0 + 20)], moved.cursor, 'd2');
    expect(afterX.changes.map((c) => `${c.store}/${c.id}`)).toEqual(['sessions/sx']);
    const afterY = await sync('conta-parent', [gone(sy, T0 + 30)], afterX.cursor, 'd2');
    expect(afterY.changes.map((c) => [`${c.store}/${c.id}`, c.deletedAt])).toEqual([
      ['sessions/sy', T0 + 30],
      ['solves/z', T0 + 30],
    ]);
  });

  it('ids com nome de propriedade do Object (__proto__, constructor) são registros como os outros', async () => {
    const proto = { ...session, id: '__proto__' };
    const res = await sync('conta-proto', [proto, solve('constructor', { sessionId: '__proto__' }), solve('__proto__', { sessionId: '__proto__' })]);
    expect([res.accepted, res.changes.map((c) => `${c.store}/${c.id}`)]).toEqual([3, ['sessions/__proto__', 'solves/constructor', 'solves/__proto__']]);
    const del = await sync('conta-proto', [{ ...proto, updatedAt: T0 + 1, deletedAt: T0 + 1, deletionStamp: T0 + 1 }], res.cursor);
    expect(del.changes.map((c) => [`${c.store}/${c.id}`, c.deletedAt]).sort()).toEqual([
      ['sessions/__proto__', T0 + 1],
      ['solves/__proto__', T0 + 1],
      ['solves/constructor', T0 + 1],
    ]);
  });

  it('datas no futuro não são recusadas: quem corrige o relógio adiantado é o app', async () => {
    const later = T0 + 10 * 365 * 86_400_000;
    const res = await sync('conta-futuro', [solve('f', { updatedAt: later, deletionStamp: later })]);
    expect([res.accepted, res.rejected]).toEqual([1, []]);
    expect(res.changes.map((c) => [c.id, c.updatedAt, c.deletionStamp])).toEqual([['f', later, later]]);
  });

  it('o limite do corpo: um lote cheio de verdade (500 mudanças no tamanho máximo) passa; acima de MAX_BODY, 413', async () => {
    const deps = testDeps({ user: 'conta-corpo' });
    const base = canonicalJson(solve('g').data).length;
    const full = Array.from({ length: 500 }, (_, i) => solve(`g${i}-`.padEnd(96, 'g'), { note: 'n'.repeat(MAX_DATA_CHARS - base) }));
    const ok = await call('/api/sync', postJson({ v: 1, account: 'conta-corpo', deviceId: 'd'.repeat(64), cursor: 0, clock: T0, changes: full }), { deps });
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as SyncResponse).accepted).toBe(500);
    expect((await call('/api/sync', postJson('x'.repeat(MAX_BODY)), { deps })).status).toBe(413);
  });

  it('o corpo não é lido inteiro além do limite: Content-Length grande barra antes de ler; sem ele, a leitura para no limite (413)', async () => {
    const deps = testDeps({ user: 'conta-corpo-stream' });
    const headers = { 'Content-Type': 'application/json', Origin: ORIGIN };
    // 40 MB em pedaços de 1 MB, entregues só quando alguém lê (highWaterMark 0); `pulled` conta o que foi lido.
    const chunk = new TextEncoder().encode('x'.repeat(1_000_000));
    const source = () => {
      const s = {
        pulled: 0,
        body: new ReadableStream<Uint8Array>(
          {
            pull(c) {
              if (s.pulled >= 40 * chunk.length) return c.close();
              s.pulled += chunk.length;
              c.enqueue(chunk);
            },
          },
          { highWaterMark: 0 },
        ),
      };
      return s;
    };
    // Um caractere ocupa até 3 bytes em UTF-8: acima de 3 × MAX_BODY bytes, o corpo não cabe em MAX_BODY caracteres.
    const big = source();
    const declared = await call('/api/sync', { method: 'POST', headers: { ...headers, 'Content-Length': String(3 * MAX_BODY + 1) }, body: big.body }, { deps });
    expect([declared.status, big.pulled]).toEqual([413, 0]);
    const parts = source();
    const chunked = await call('/api/sync', { method: 'POST', headers, body: parts.body }, { deps });
    expect(chunked.status).toBe(413);
    expect(parts.pulled).toBeLessThanOrEqual(MAX_BODY + 2 * chunk.length);
  });

  it('sem `v` numérico, 400; o 426 fica para uma versão numérica que o servidor não conhece', async () => {
    const deps = testDeps({ user: 'conta-v' });
    const body = { deviceId: 'd', cursor: 0, clock: T0, changes: [] };
    expect((await call('/api/sync', postJson(body), { deps })).status).toBe(400);
    expect((await call('/api/sync', postJson({ ...body, v: '1' }), { deps })).status).toBe(400);
    expect((await call('/api/sync', postJson({ ...body, v: null }), { deps })).status).toBe(400);
    expect((await call('/api/sync', postJson({ ...body, v: 2 }), { deps })).status).toBe(426);
  });

  it('a chave ACCOUNTS_ENABLED: com "true" o sync responde; com "false", 404 mesmo com sessão (spec 8.4)', async () => {
    const deps = testDeps({ user: 'conta-chave' });
    const body = (): RequestInit => postJson({ v: 1, account: 'conta-chave', deviceId: 'd', cursor: 0, clock: T0, changes: [] });
    expect((await call('/api/sync', body(), { deps, env: testEnv({ ACCOUNTS_ENABLED: 'true' }) })).status).toBe(200);
    expect((await call('/api/sync', body(), { deps, env: testEnv({ ACCOUNTS_ENABLED: 'false' }) })).status).toBe(404);
  });
});
