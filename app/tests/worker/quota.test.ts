// A cota, o teto de bytes e o orçamento de gravações do dia no objeto da conta (endurecimento 4.1, decisões 5 e 6). Os registros chegam
// pelo /api/sync; os contadores de uma conta cheia são semeados direto no estado do objeto (setState), sem gravar 100 mil registros.
import { runInDurableObject } from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { QUOTA_REASON, type ActiveCounts } from '../../src/core/sync/limits';
import { ACCOUNT_HEADER, SYNC_PROTOCOL, type Change, type SyncResponse } from '../../src/core/sync/types';
import { ACCOUNT_BYTES_CAP, DAILY_WRITE_BUDGET, nextUtcDay, SESSION_PREPAY, utcDay } from '../../worker/limits';
import { dayOf } from '../../worker/snapshots';
import { seeded } from '../unit/sync-random';
import { call, postJson, setState, stateOf, stubOf, T0, testDeps } from './helpers';

const solve = (id: string, o: Partial<Change> & { note?: string; sessionId?: string } = {}): Change => ({
  store: 'solves',
  id,
  data: { sessionId: o.sessionId ?? 's1', event: '333', ms: 9000, penalty: null, at: T0, scramble: "R U R'", note: o.note ?? '', createdAt: T0 },
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
const gone = (at: number) => ({ updatedAt: at, deletedAt: at, deletionStamp: at });
const cota = (id: string, store = 'solves') => ({ store, id, reason: QUOTA_REASON });
const many = (prefix: string, n: number): Change[] => Array.from({ length: n }, (_, i) => solve(`${prefix}${String(i).padStart(3, '0')}`));

async function sync(user: string, changes: unknown[], o: { cursor?: number; device?: string; now?: number } = {}): Promise<SyncResponse> {
  const now = o.now ?? T0;
  const body = { v: SYNC_PROTOCOL, account: user, deviceId: o.device ?? 'd1', cursor: o.cursor ?? 0, clock: now, changes };
  const res = await call('/api/sync', postJson(body), { deps: testDeps({ user, now: () => now }) });
  expect(res.status).toBe(200);
  return (await res.json()) as SyncResponse;
}
const byId = (r: SyncResponse): Map<string, Change> => new Map(r.changes.map((c) => [c.id, c]));

// Os contadores gravados no objeto e a verdade do banco dele: os ativos de cada store e o tamanho, em UTF-8, do conteúdo gravado.
const json = async <T>(user: string, key: string): Promise<T> => JSON.parse((await stateOf(user, key)) ?? 'null') as T;
const counters = async (user: string) => ({ active: await json<ActiveCounts>(user, 'active'), bytes: await json<number>(user, 'bytes') });
const truth = (user: string) =>
  runInDurableObject(stubOf(user), (_o, state) => {
    const active: ActiveCounts = { solves: 0, sessions: 0, practice: 0 };
    let bytes = 0;
    for (const r of state.storage.sql.exec<{ store: string; data: string; deleted_at: number | null }>('SELECT store, data, deleted_at FROM records')) {
      if (r.deleted_at === null && r.store in active) active[r.store as keyof ActiveCounts]++;
      bytes += new TextEncoder().encode(r.data).byteLength;
    }
    return { active, bytes };
  });

describe('a cota no objeto da conta (endurecimento 4.1)', () => {
  it('com 100 mil solves ativos, o solve novo volta com o motivo "cota"; editar e apagar passam', async () => {
    const user = 'cota-cheia';
    await sync(user, [session(), solve('a'), solve('b')]);
    await setState(user, 'active', { solves: 100_000, sessions: 1, practice: 0 });
    const res = await sync(user, [solve('novo'), solve('a', { note: 'editado', updatedAt: T0 + 10 }), solve('b', gone(T0 + 10))]);
    expect(res.rejected).toEqual([cota('novo')]);
    expect([res.accepted, res.deferred, res.retryAt]).toEqual([2, undefined, undefined]);
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect(all.has('novo')).toBe(false);
    expect(all.get('a')!.data).toMatchObject({ note: 'editado' });
    expect(all.get('b')!.deletedAt).toBe(T0 + 10);
    // A exclusão abriu uma vaga, e o contador gravado desceu: o novo entra no lote seguinte.
    expect(await json(user, 'active')).toEqual({ solves: 99_999, sessions: 1, practice: 0 });
    expect((await sync(user, [solve('novo')])).rejected).toEqual([]);
    expect(await json(user, 'active')).toEqual({ solves: 100_000, sessions: 1, practice: 0 });
  });

  it('numa conta de antes da cota, o contador nasce da contagem do banco', async () => {
    // Uma conta do beta, gravada sem os contadores: 100 mil solves e a sessão deles, direto no SQLite do objeto.
    const user = 'cota-beta';
    const data = JSON.stringify(solve('x').data);
    const sessionData = JSON.stringify(session().data);
    await runInDurableObject(stubOf(user), (_o, state) => {
      const sql = state.storage.sql;
      sql.exec(
        `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 100000)
         INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) SELECT 'solves', 'x' || i, ?, ?, NULL, ?, i, 's1' FROM n`,
        data, T0, T0,
      );
      sql.exec("INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) VALUES ('sessions', 's1', ?, ?, NULL, ?, 100001, NULL)", sessionData, T0, T0);
      sql.exec("INSERT INTO state (key, value) VALUES ('rev', '100001'), ('userId', ?)", user);
    });
    expect(await stateOf(user, 'active')).toBeNull();
    expect((await sync(user, [solve('novo')])).rejected).toEqual([cota('novo')]);
    const size = (s: string) => new TextEncoder().encode(s).byteLength;
    expect(await counters(user)).toEqual({ active: { solves: 100_000, sessions: 1, practice: 0 }, bytes: 100_000 * size(data) + size(sessionData) });
    expect((await sync(user, [solve('x1', gone(T0 + 10))])).rejected).toEqual([]);
    expect((await sync(user, [solve('novo')])).rejected).toEqual([]);
    expect(await json(user, 'active')).toEqual({ solves: 100_000, sessions: 1, practice: 0 });
  });

  it('os contadores acompanham o banco: criar, editar, apagar, a cascata e a restauração', async () => {
    const user = 'cota-contadores';
    await sync(user, [session('s1'), session('s2'), solve('a', { note: 'ação 🧊 — nota' }), solve('b'), solve('c', { sessionId: 's2' }), practice('p1')]);
    expect(await counters(user)).toEqual(await truth(user));
    expect(await stubOf(user).snapshot(T0)).toBe(true);
    await sync(user, [
      solve('a', { note: 'outra nota, mais comprida, com acentuação: ç ã é 🧊🧊', updatedAt: T0 + 10 }),
      solve('b', gone(T0 + 10)),
      session('s2', gone(T0 + 10)), // a cascata leva o c junto
      solve('d'),
    ]);
    expect((await truth(user)).active).toEqual({ solves: 2, sessions: 1, practice: 1 });
    expect(await counters(user)).toEqual(await truth(user));
    const restored = await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, { [ACCOUNT_HEADER]: user }), { deps: testDeps({ user, now: () => T0 + 1000 }) });
    expect(restored.status).toBe(204);
    expect((await truth(user)).active).toEqual({ solves: 3, sessions: 2, practice: 1 }); // a cópia volta, e o d vai para a lixeira
    expect(await counters(user)).toEqual(await truth(user));
  });
});

describe('o teto de bytes da conta', () => {
  it('perto do teto, a mudança que faz a conta crescer volta com "cota"; a que encolhe ou mantém o tamanho passa', async () => {
    const user = 'teto-bytes';
    const note = (n: number) => 'x'.repeat(n);
    await sync(user, [session(), solve('a', { note: note(20) })]);
    await setState(user, 'bytes', ACCOUNT_BYTES_CAP - 5); // 5 bytes de folga
    const first = await sync(user, [solve('novo'), solve('a', { note: note(10), updatedAt: T0 + 10 })]);
    expect([first.rejected, first.accepted]).toEqual([[cota('novo')], 1]);
    expect(await json(user, 'bytes')).toBe(ACCOUNT_BYTES_CAP - 15); // a nota encolheu 10 bytes
    expect((await sync(user, [solve('a', { note: note(26), updatedAt: T0 + 20 })])).rejected).toEqual([cota('a')]); // 16 bytes a mais
    expect((await sync(user, [solve('a', { note: note(25), updatedAt: T0 + 20 })])).rejected).toEqual([]); // 15: cabe até o teto
    expect(await json(user, 'bytes')).toBe(ACCOUNT_BYTES_CAP);
    expect((await sync(user, [solve('a', { note: note(25), ...gone(T0 + 30) })])).rejected).toEqual([]); // apagar, no teto
    expect((await sync(user, [solve('novo')])).rejected).toEqual([cota('novo')]);
    expect(await json(user, 'bytes')).toBe(ACCOUNT_BYTES_CAP);
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect(all.has('novo')).toBe(false);
    expect(all.get('a')).toMatchObject({ deletedAt: T0 + 30, data: { note: note(25) } });
  });
});

describe('o teto de bytes: as exceções', () => {
  it('no teto, apagar com o conteúdo maior conta como crescer e volta com "cota"; o solve fica como estava', async () => {
    // Senão, "criar pequeno e apagar com 16 KB de nota" faria a conta crescer além do teto sem limite.
    const user = 'teto-apagar';
    await sync(user, [session(), solve('a', { note: 'curta' })]);
    await setState(user, 'bytes', ACCOUNT_BYTES_CAP);
    expect((await sync(user, [solve('a', { note: 'curta, e depois bem mais comprida', ...gone(T0 + 10) })])).rejected).toEqual([cota('a')]);
    const a = byId(await sync(user, [], { device: 'd2' })).get('a')!;
    expect([a.deletedAt, (a.data as { note: string }).note]).toEqual([null, 'curta']);
    expect(await json(user, 'bytes')).toBe(ACCOUNT_BYTES_CAP);
  });

  it('os ajustes, a temporada inclusive, passam com a conta no teto, e contam nos bytes', async () => {
    const user = 'teto-ajustes';
    const pref = (id: string, data: unknown, at: number): Change => ({ store: 'prefs', id, data, updatedAt: at, deletedAt: null, deletionStamp: at });
    await sync(user, [pref('settings.dailyGoal', 5, T0), pref('season', defaultSeason(), T0)]);
    await setState(user, 'bytes', ACCOUNT_BYTES_CAP);
    const past = [{ n: 1, startedAt: 0, endedAt: T0, solves: 1000, startAo12: null, endAo12: null }];
    const closed = { ...defaultSeason(), past, current: { ...defaultSeason().current, n: 2 } }; // uma temporada fechada: o progresso cresce
    const res = await sync(user, [pref('settings.dailyGoal', 12345, T0 + 10), pref('season', closed, T0 + 10)]);
    expect([res.rejected, res.accepted]).toEqual([[], 2]);
    expect(await json<number>(user, 'bytes')).toBeGreaterThan(ACCOUNT_BYTES_CAP);
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect(all.get('settings.dailyGoal')!.data).toBe(12345);
    expect((all.get('season')!.data as { past: unknown[] }).past).toHaveLength(1);
  });
});

// A vaga de sessão paga adiantado (revisão da Task 4): um solve que pede a vaga de uma sessão (movido para uma sessão nova, ou restaurado
// numa sessão da lixeira) pode não crescer nada, e a sessão que chega depois dele passa como obrigatória. Por isso ele reserva o maior
// tamanho de uma sessão (SESSION_PREPAY) no teto; sem espaço para a reserva, volta com "cota", e a sessão também.
describe('o teto de bytes: a vaga de sessão paga adiantado', () => {
  const named = (id: string, chars: number, o: Partial<Change> = {}): Change => session(id, { ...o, data: { name: 'N'.repeat(chars), event: '333', order: 0, createdAt: T0 } });

  it('no teto, mover um solve para uma sessão nova ou restaurá-lo numa sessão da lixeira, junto com a sessão grande: tudo volta com "cota"', async () => {
    const user = 'teto-vaga';
    await sync(user, [session('s00'), solve('a', { sessionId: 's00' }), session('lx', gone(T0)), solve('b', { sessionId: 'lx', ...gone(T0) })]);
    await setState(user, 'bytes', ACCOUNT_BYTES_CAP);
    const back = { updatedAt: T0 + 10, deletionStamp: T0 + 10 };
    const res = await sync(user, [
      solve('a', { sessionId: 'z00', updatedAt: T0 + 10 }), // o mesmo tamanho: não cresce nada
      named('z00', 16_000, back),
      solve('b', { sessionId: 'lx', ...back }), // da lixeira, numa sessão da lixeira
      named('lx', 16_000, back),
    ]);
    expect(res.rejected).toEqual([cota('a'), cota('z00', 'sessions'), cota('b'), cota('lx', 'sessions')]);
    expect(await json(user, 'bytes')).toBe(ACCOUNT_BYTES_CAP);
  });

  it('com folga para uma vaga paga, o primeiro par passa e o segundo volta', async () => {
    const user = 'teto-uma-vaga';
    await sync(user, [session('s00'), solve('a', { sessionId: 's00' }), solve('b', { sessionId: 's00' })]);
    await setState(user, 'bytes', ACCOUNT_BYTES_CAP - SESSION_PREPAY);
    const res = await sync(user, [solve('a', { sessionId: 'z00', updatedAt: T0 + 10 }), named('z00', 16_000), solve('b', { sessionId: 'z01', updatedAt: T0 + 10 }), named('z01', 16_000)]);
    expect(res.rejected).toEqual([cota('b'), cota('z01', 'sessions')]);
    const bytes = await json<number>(user, 'bytes');
    expect(bytes).toBeGreaterThan(ACCOUNT_BYTES_CAP - SESSION_PREPAY); // a sessão grande foi gravada
    expect(bytes).toBeLessThanOrEqual(ACCOUNT_BYTES_CAP);
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect([(all.get('a')!.data as { sessionId: string }).sessionId, (all.get('b')!.data as { sessionId: string }).sessionId]).toEqual(['z00', 's00']);
    expect(all.has('z01')).toBe(false);
  });

  // Lotes sorteados de mover, restaurar, criar sessões grandes e pequenas, editar e criar solves, numa conta perto do teto ou acima dele:
  // o conteúdo nunca passa do maior entre o teto e o de antes, e nenhum solve ativo fica sem a sessão ativa.
  it('propriedade: nenhum lote sorteado passa do teto, e nenhum solve ativo fica sem a sessão', async () => {
    const rnd = seeded(20261017);
    const int = (n: number): number => Math.floor(rnd() * n);
    const pick = <T>(list: readonly T[]): T => list[int(list.length)];
    let refused = 0;
    for (let round = 0; round < 24; round++) {
      const user = `teto-sorteio-${round}`;
      await sync(user, [session('s00'), session('lx', gone(T0)), solve('a0', { sessionId: 's00' }), solve('a1', { sessionId: 's00' }), solve('b0', { sessionId: 'lx', ...gone(T0) })]);
      const start = ACCOUNT_BYTES_CAP + pick([2_000, 0, -1_000, -SESSION_PREPAY, -SESSION_PREPAY - 20_000, -2 * SESSION_PREPAY - 5_000]);
      await setState(user, 'bytes', start);
      const at = T0 + 10 + round;
      const fresh = ['z0', 'z01', 'z002'].filter(() => rnd() < 0.7);
      const homes = ['s00', 'lx', ...fresh];
      const batch: Change[] = [];
      for (let i = 0, n = 2 + int(5); i < n; i++) {
        const op = int(4);
        if (op === 0) batch.push(solve(pick(['a0', 'a1']), { sessionId: pick(homes), updatedAt: at, deletionStamp: at }));
        else if (op === 1) batch.push(solve('b0', { sessionId: pick(homes), updatedAt: at, deletionStamp: at }));
        else if (op === 2) batch.push(solve(`n${i}`, { sessionId: pick(homes), note: 'x'.repeat(int(3) * 4_000), updatedAt: at, deletionStamp: at }));
        else batch.push(solve(pick(['a0', 'a1']), { sessionId: 's00', note: 'y'.repeat(int(2) * 3_000), updatedAt: at }));
      }
      // Toda sessão que um solve do lote pode pedir vem no lote, antes ou depois, grande ou pequena; a da lixeira às vezes volta também.
      for (const id of [...fresh, ...(rnd() < 0.5 ? ['lx'] : [])]) {
        batch.splice(int(batch.length + 1), 0, named(id, pick([1, 8_000, 16_000]), { updatedAt: at, deletionStamp: at }));
      }
      const res = await sync(user, batch);
      refused += res.rejected.length;
      expect(await json<number>(user, 'bytes'), `rodada ${round}`).toBeLessThanOrEqual(Math.max(start, ACCOUNT_BYTES_CAP));
      const all = byId(await sync(user, [], { device: 'd2' }));
      for (const c of all.values()) {
        if (c.store !== 'solves' || c.deletedAt !== null) continue;
        expect(all.get((c.data as { sessionId: string }).sessionId)?.deletedAt, `rodada ${round}: solve ativo ${c.id} sem sessão ativa`).toBeNull();
      }
    }
    expect(refused).toBeGreaterThan(20); // o sorteio chega no teto
  });
});

describe('o orçamento de gravações do dia (decisão 6)', () => {
  // A hora do pedido vem do Worker que o atendeu: um atrasado não pode fazer o dia do orçamento voltar e zerar o que já foi gravado hoje.
  it('o dia do orçamento não volta atrás: um pedido com a hora de ontem, atendido depois de um de hoje, conta no dia de hoje', async () => {
    const user = 'orcamento-relogio';
    const today = nextUtcDay(T0);
    await setState(user, 'writes', { day: utcDay(today), n: DAILY_WRITE_BUDGET - 1 });
    const late = await sync(user, [solve('x'), solve('y')], { now: T0 });
    expect([late.accepted, late.deferred, late.retryAt]).toEqual([1, 1, nextUtcDay(today)]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(today), n: DAILY_WRITE_BUDGET });
    expect((await sync(user, [solve('y')], { now: today })).deferred).toBe(1);
  });

  it('passado o orçamento do dia, o resto do lote volta em deferred, com retryAt à meia-noite UTC, e nada dele é gravado', async () => {
    const user = 'orcamento-fim';
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - 100 });
    const batch = many('o', 500);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let res: SyncResponse;
    try {
      res = await sync(user, batch);
      const logged = out.mock.calls.flat().flatMap((l) => (String(l).startsWith('{') ? [JSON.parse(String(l)) as unknown] : []));
      expect(logged).toContainEqual(expect.objectContaining({ evt: 'sync', user, pushed: 500, deferred: 400 }));
    } finally {
      out.mockRestore();
    }
    expect([res.accepted, res.rejected, res.deferred, res.retryAt]).toEqual([100, [], 400, Date.parse('2026-10-09T00:00:00.000Z')]);
    expect(res.retryAt).toBe(nextUtcDay(T0));
    const other = await sync(user, [], { device: 'd2' });
    expect(other.changes.map((c) => c.id)).toEqual(batch.slice(0, 100).map((c) => c.id));
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: DAILY_WRITE_BUDGET });
  });

  it('com o orçamento cheio, o recebimento continua', async () => {
    const user = 'orcamento-cheio';
    await sync(user, many('r', 500));
    await sync(user, [solve('ultimo')]);
    const free = await sync(user, [], { device: 'd2' });
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET });
    const full = await sync(user, [solve('d3-a'), solve('d3-b')], { device: 'd3' });
    expect([full.accepted, full.rejected, full.deferred, full.retryAt]).toEqual([0, [], 2, nextUtcDay(T0)]);
    expect([full.changes, full.cursor, full.more]).toEqual([free.changes, free.cursor, free.more]);
    expect([full.changes.length, full.more]).toEqual([500, true]);
    const rest = await sync(user, [], { device: 'd3', cursor: full.cursor });
    expect([rest.changes.map((c) => c.id), rest.more, rest.deferred]).toEqual([['ultimo'], false, undefined]);
  });

  it('no dia seguinte (UTC) o orçamento volta', async () => {
    const user = 'orcamento-amanha';
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET });
    const today = await sync(user, [solve('x')]);
    expect([today.accepted, today.deferred, today.retryAt]).toEqual([0, 1, nextUtcDay(T0)]);
    expect((await sync(user, [solve('x')], { now: nextUtcDay(T0) - 1 })).deferred).toBe(1); // o último milissegundo ainda é hoje
    const tomorrow = await sync(user, [solve('x')], { now: nextUtcDay(T0) });
    expect([tomorrow.accepted, tomorrow.rejected, tomorrow.deferred, tomorrow.retryAt]).toEqual([1, [], undefined, undefined]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(nextUtcDay(T0)), n: 1 });
    expect(byId(await sync(user, [], { device: 'd2', now: nextUtcDay(T0) })).has('x')).toBe(true);
  });

  // Revisão, foco 3: o orçamento corta o lote no meio, e o pedaço lido tem uma recusa da cota. Com 2 gravações de folga, só as duas
  // primeiras mudanças são lidas: o novo volta com o motivo da cota, a edição é gravada, e as duas últimas ficam para amanhã, sem gravar.
  it('cota e orçamento no mesmo lote', async () => {
    const user = 'cota-e-orcamento';
    await sync(user, [session(), solve('a'), solve('b')]);
    await setState(user, 'active', { solves: 100_000, sessions: 1, practice: 0 });
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - 2 });
    const res = await sync(user, [solve('novo'), solve('a', { note: 'edição', updatedAt: T0 + 10 }), solve('novo2'), solve('b', { note: 'edição 2', updatedAt: T0 + 10 })]);
    expect([res.rejected, res.accepted, res.deferred, res.retryAt]).toEqual([[cota('novo')], 1, 2, nextUtcDay(T0)]);
    expect(res.changes.map((c) => c.id)).toEqual(['s1', 'b', 'a']); // o recebimento continua: a conta inteira, com a edição gravada por último
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect([all.has('novo'), all.has('novo2')]).toEqual([false, false]);
    expect(all.get('a')!.data).toMatchObject({ note: 'edição' });
    expect(all.get('b')!.data).toMatchObject({ note: '' });
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: DAILY_WRITE_BUDGET - 1 });
  });
});
