import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../../src/core/sync/merge';
import { MAX_DATA_CHARS } from '../../src/core/sync/shape';
import { SYNC_PROTOCOL, type Change, type SyncResponse } from '../../src/core/sync/types';
import { MAX_SYNC_REQUEST, MAX_WRITES_PER_REQUEST, PULL_PAGE } from '../../worker/limits';
import { MAX_BODY } from '../../worker/router';
import { call, ORIGIN, postJson, setState, stateOf, T0, testDeps, testEnv } from './helpers';

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
  const res = await call('/api/sync', postJson({ v: SYNC_PROTOCOL, account: user, deviceId: device, cursor, clock: T0, changes }), { deps: testDeps({ user }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}

describe('POST /api/sync (spec 6.1 e 8.2)', () => {
  it('sem sessão, 401', async () => {
    expect((await call('/api/sync', postJson({ v: SYNC_PROTOCOL, deviceId: 'd', cursor: 0, clock: 0, changes: [] }))).status).toBe(401);
  });

  it('aceita o lote, dá revisões e devolve o que mudou desde o cursor; o outro aparelho recebe', async () => {
    const first = await sync('conta-a', [session, solve('x1')]);
    expect(first).toMatchObject({ accepted: 2, rejected: [], cursor: 2, more: false, serverTime: T0 });
    expect(first.changes.map((c) => c.id)).toEqual(['s1', 'x1']);
    const other = await sync('conta-a', [], 0, 'd2');
    expect(other.changes.map((c) => `${c.store}/${c.id}`)).toEqual(['sessions/s1', 'solves/x1']);
    expect((await sync('conta-a', [], 2, 'd2')).changes).toEqual([]);
  });

  it('em páginas de PULL_PAGE para quem só recebe: `more` diz que há mais, e o cursor avança', async () => {
    const changes = Array.from({ length: PULL_PAGE }, (_, i) => solve(`b${String(i).padStart(3, '0')}`));
    for (let i = 0; i < changes.length; i += MAX_WRITES_PER_REQUEST) await sync('conta-lotes', changes.slice(i, i + MAX_WRITES_PER_REQUEST));
    await sync('conta-lotes', [solve('b500')]);
    const page = await sync('conta-lotes', [], 0, 'd2');
    expect([page.changes.length, page.more, page.cursor]).toEqual([PULL_PAGE, true, PULL_PAGE]);
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
    expect((await call('/api/sync', postJson({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] }), { deps })).status).toBe(426);
    expect((await call('/api/sync', { method: 'POST', body: '{}' }, { deps })).status).toBe(415);
    expect((await call('/api/sync', postJson({ v: SYNC_PROTOCOL }, { Origin: 'https://outro.site' }), { deps })).status).toBe(403);
    const many = Array.from({ length: MAX_SYNC_REQUEST + 1 }, (_, i) => solve(`m${i}`));
    expect((await call('/api/sync', postJson({ v: SYNC_PROTOCOL, account: 'conta-x', deviceId: 'd', cursor: 0, clock: 0, changes: many }), { deps })).status).toBe(400);
    const busy = testEnv({ API_BURST: { limit: async () => ({ success: false }) } });
    expect((await call('/api/sync', postJson({ v: SYNC_PROTOCOL, deviceId: 'd', cursor: 0, clock: 0, changes: [] }), { deps, env: busy })).status).toBe(429);
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

  // O lote cheio de um app de antes da Task 12 (MAX_SYNC_REQUEST): o servidor aceita o pedido, lê MAX_WRITES_PER_REQUEST e adia o resto.
  it('o limite do corpo: um lote cheio de verdade (MAX_SYNC_REQUEST mudanças no tamanho máximo) passa; acima de MAX_BODY, 413', async () => {
    const deps = testDeps({ user: 'conta-corpo' });
    const base = canonicalJson(solve('g').data).length;
    const full = Array.from({ length: MAX_SYNC_REQUEST }, (_, i) => solve(`g${i}-`.padEnd(96, 'g'), { note: 'n'.repeat(MAX_DATA_CHARS - base) }));
    const ok = await call('/api/sync', postJson({ v: SYNC_PROTOCOL, account: 'conta-corpo', deviceId: 'd'.repeat(64), cursor: 0, clock: T0, changes: full }), { deps });
    expect(ok.status).toBe(200);
    const res = (await ok.json()) as SyncResponse;
    expect([res.accepted, res.deferred, res.retryAt]).toEqual([MAX_WRITES_PER_REQUEST, MAX_SYNC_REQUEST - MAX_WRITES_PER_REQUEST, T0]);
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
    expect((await call('/api/sync', postJson({ ...body, v: String(SYNC_PROTOCOL) }), { deps })).status).toBe(400);
    expect((await call('/api/sync', postJson({ ...body, v: null }), { deps })).status).toBe(400);
    expect((await call('/api/sync', postJson({ ...body, v: 1 }), { deps })).status).toBe(426);
  });

  // O acabamento (A1): o piso da restauração pelo aparelho é opcional; quando vem, é um inteiro seguro >= 0, senão o pedido é torto (400).
  it('o piso no pedido: sem ele, o pedido de sempre; com ele, confirmado; torto, 400', async () => {
    const deps = testDeps({ user: 'conta-piso' });
    const body = { v: SYNC_PROTOCOL, account: 'conta-piso', deviceId: 'd', cursor: 0, clock: T0, changes: [] };
    const plain = await call('/api/sync', postJson(body), { deps });
    expect(plain.status).toBe(200);
    expect('floorSet' in ((await plain.json()) as object)).toBe(false);
    const sent = await call('/api/sync', postJson({ ...body, floor: T0 }), { deps });
    expect(((await sent.json()) as SyncResponse).floorSet).toBe(true);
    for (const floor of [-1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 2, true]) {
      expect((await call('/api/sync', postJson({ ...body, floor }), { deps })).status, String(floor)).toBe(400);
    }
    expect(await stateOf('conta-piso', 'restoreFloor')).toBe(String(T0));
  });

  it('a chave ACCOUNTS_ENABLED: com "true" o sync responde; com "false", 404 mesmo com sessão (spec 8.4)', async () => {
    const deps = testDeps({ user: 'conta-chave' });
    const body = (): RequestInit => postJson({ v: SYNC_PROTOCOL, account: 'conta-chave', deviceId: 'd', cursor: 0, clock: T0, changes: [] });
    expect((await call('/api/sync', body(), { deps, env: testEnv({ ACCOUNTS_ENABLED: 'true' }) })).status).toBe(200);
    expect((await call('/api/sync', body(), { deps, env: testEnv({ ACCOUNTS_ENABLED: 'false' }) })).status).toBe(404);
  });

  // Os desafios (spec do desafio, seção 7): uma store do sync como as outras, contada na cota. Vieram com o protocolo 3: o app de antes
  // recebe 426 e nunca vê um desafio que não entenderia.
  it('desafios sobem e voltam pelo objeto da conta', async () => {
    const user = 'conta-desafio';
    const duel = (linkId: string, o: Partial<Change> & { side?: string; status?: string } = {}): Change => ({
      store: 'duels',
      id: `${linkId}-a`,
      data: {
        linkId, side: o.side ?? 'a', event: '333', scrambles: Array.from({ length: 7 }, () => "R U R'"), mine: [{ ms: 9000, penalty: null }],
        theirs: null, myName: 'Ana', theirName: '', status: o.status ?? 'playing', createdAt: T0,
      },
      updatedAt: o.updatedAt ?? T0,
      deletedAt: o.deletedAt ?? null,
      deletionStamp: o.deletionStamp ?? T0,
    });
    // Uma conta de antes dos desafios: o contador da cota gravado sem a chave deles.
    await sync(user, [session]);
    await setState(user, 'active', { solves: 0, sessions: 1, practice: 0 });
    const first = await sync(user, [duel('abcdefgh12345678'), duel('abcdefgh87654321', { side: 'c' })]);
    expect(first).toMatchObject({ accepted: 1, rejected: [{ store: 'duels', id: 'abcdefgh87654321-a', reason: 'desafio inválido' }] });
    expect(JSON.parse((await stateOf(user, 'active'))!)).toEqual({ solves: 0, sessions: 1, practice: 0, duels: 1 });
    const other = await sync(user, [], 0, 'd2');
    expect(other.changes.filter((c) => c.store === 'duels')).toEqual([duel('abcdefgh12345678')]);
    // A resposta e a exclusão viajam como as de um solve.
    await sync(user, [duel('abcdefgh12345678', { status: 'done', updatedAt: T0 + 10 })]);
    await sync(user, [duel('abcdefgh12345678', { updatedAt: T0 + 20, deletedAt: T0 + 20, deletionStamp: T0 + 20 })], 0, 'd3');
    const back = await sync(user, [], other.cursor, 'd2');
    expect(back.changes.map((c) => [c.id, c.deletedAt, (c.data as { status: string }).status])).toEqual([['abcdefgh12345678-a', T0 + 20, 'playing']]);
    expect(JSON.parse((await stateOf(user, 'active'))!)).toMatchObject({ duels: 0 });
    // O app de antes (protocolo 2): 426.
    const old = await call('/api/sync', postJson({ v: 2, account: user, deviceId: 'd9', cursor: 0, clock: T0, changes: [] }), { deps: testDeps({ user }) });
    expect(old.status).toBe(426);
  });

  // As metas (estatísticas, spec 5 e 7): chaves novas do catálogo da conta (goal.<id>), sem nada novo no servidor além de isPrefValue,
  // que o Worker importa do app. A meta torta volta recusada com o motivo de sempre; apagar é gravar o padrão (null).
  it('o Worker aceita goal.<id> e recusa o torto com valor inválido para a chave', async () => {
    const user = 'conta-metas';
    const goal = { kind: 'single', event: '333', targetMs: 11_000, startMs: 12_500, createdAt: T0, reachedAt: null };
    const pref = (id: string, data: unknown, at = T0): Change => ({ store: 'prefs', id, data, updatedAt: at, deletedAt: null, deletionStamp: at });
    const crooked = [
      pref('goal.abc', goal), // vaga de 3 caracteres
      pref('goal.b2', { ...goal, extra: 1 }), // chave a mais
      pref('goal.c3', { ...goal, targetMs: 0 }),
      pref('goal.d4', { ...goal, targetMs: 3_600_000 }),
      pref('goal.e5', { ...goal, event: 'fto' }),
    ];
    const first = await sync(user, [pref('goal.a1', goal), ...crooked]);
    expect(first.accepted).toBe(1);
    expect(first.rejected).toEqual(crooked.map((c) => ({ store: 'prefs', id: c.id, reason: 'valor inválido para a chave' })));
    const other = await sync(user, [], 0, 'd2');
    expect(other.changes).toEqual([pref('goal.a1', goal)]);
    // Apagar a meta é voltar a chave ao padrão: o outro aparelho recebe o null.
    await sync(user, [pref('goal.a1', null, T0 + 10)]);
    const back = await sync(user, [], other.cursor, 'd2');
    expect(back.changes).toEqual([pref('goal.a1', null, T0 + 10)]);
  });
});
