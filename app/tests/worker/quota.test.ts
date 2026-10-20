// A cota, o teto de bytes e o orçamento de gravações do dia no objeto da conta (endurecimento 4.1, decisões 5 e 6). Os registros chegam
// pelo /api/sync; os contadores de uma conta cheia são semeados direto no estado do objeto (setState), sem gravar 100 mil registros.
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { QUOTA_REASON, type ActiveCounts } from '../../src/core/sync/limits';
import { exportFromRecords } from '../../src/core/sync/snapshot';
import { ACCOUNT_HEADER, SYNC_BATCH, SYNC_PROTOCOL, type Change, type SyncResponse } from '../../src/core/sync/types';
import type { Env } from '../../worker/env';
import { ACTIVE_CHILDREN } from '../../worker/records-sql';
import {
  ACCOUNT_BYTES_CAP,
  BIG_COPY_EVERY_DAYS,
  capsOf,
  COMPACT_PER_DAY,
  COPY_PART_READS_PER_DAY,
  COPY_PART_RECORDS,
  DAILY_READ_BUDGET,
  DAILY_WRITE_BUDGET,
  DEVICE_TOUCH_MS,
  MAX_DEVICES,
  MAX_SYNC_REQUEST,
  MAX_WRITES_PER_REQUEST,
  nextUtcDay,
  PULL_PAGE,
  PULL_PAGE_WITH_PUSH,
  READS_SAVE_EVERY,
  RECORDS_PER_DAY,
  REQUEST_ROWS,
  rowsOf,
  ROWS_PER_COMPACT,
  ROWS_PER_WRITE,
  SESSION_PREPAY,
  utcDay,
} from '../../worker/limits';
import { dayOf, gzipJson, snapshotKey } from '../../worker/snapshots';
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
const many = (prefix: string, n: number): Change[] => Array.from({ length: n }, (_, i) => solve(`${prefix}${String(i).padStart(4, '0')}`));

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
    const active: ActiveCounts = { solves: 0, sessions: 0, practice: 0, duels: 0 };
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
    expect(await json(user, 'active')).toEqual({ solves: 99_999, sessions: 1, practice: 0, duels: 0 });
    expect((await sync(user, [solve('novo')])).rejected).toEqual([]);
    expect(await json(user, 'active')).toEqual({ solves: 100_000, sessions: 1, practice: 0, duels: 0 });
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
    expect(await counters(user)).toEqual({ active: { solves: 100_000, sessions: 1, practice: 0, duels: 0 }, bytes: 100_000 * size(data) + size(sessionData) });
    expect((await sync(user, [solve('x1', gone(T0 + 10))])).rejected).toEqual([]);
    expect((await sync(user, [solve('novo')])).rejected).toEqual([]);
    expect(await json(user, 'active')).toEqual({ solves: 100_000, sessions: 1, practice: 0, duels: 0 });
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
    expect((await truth(user)).active).toEqual({ solves: 2, sessions: 1, practice: 1, duels: 0 });
    expect(await counters(user)).toEqual(await truth(user));
    const restored = await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, { [ACCOUNT_HEADER]: user }), { deps: testDeps({ user, now: () => T0 + 1000 }) });
    expect(restored.status).toBe(204);
    expect((await truth(user)).active).toEqual({ solves: 3, sessions: 2, practice: 1, duels: 0 }); // a cópia volta, e o d vai para a lixeira
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
    await setState(user, 'writes', { day: utcDay(today), n: DAILY_WRITE_BUDGET - rowsOf(1) }); // cabe uma gravação
    const late = await sync(user, [solve('x'), solve('y')], { now: T0 });
    expect([late.accepted, late.deferred, late.retryAt]).toEqual([1, 1, nextUtcDay(today)]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(today), n: DAILY_WRITE_BUDGET });
    expect((await sync(user, [solve('y')], { now: today })).deferred).toBe(1);
  });

  it('passado o orçamento do dia, o resto do lote volta em deferred, com retryAt à meia-noite UTC, e nada dele é gravado', async () => {
    const user = 'orcamento-fim';
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(100) }); // cabem 100 gravações
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

  // A página de quem manda mudanças é a menor (PULL_PAGE_WITH_PUSH), mesmo com tudo adiado: o recebimento segue igual, em páginas.
  it('com o orçamento cheio, o recebimento continua', async () => {
    const user = 'orcamento-cheio';
    await sync(user, many('r', 250));
    await sync(user, many('q', 250));
    await sync(user, [solve('ultimo')]);
    const free = await sync(user, [], { device: 'd2' });
    expect([free.changes.length, free.more]).toEqual([PULL_PAGE, true]);
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET });
    const full = await sync(user, [solve('d3-a'), solve('d3-b')], { device: 'd3' });
    expect([full.accepted, full.rejected, full.deferred, full.retryAt]).toEqual([0, [], 2, nextUtcDay(T0)]);
    expect([full.changes, full.more]).toEqual([free.changes.slice(0, PULL_PAGE_WITH_PUSH), true]);
    const rest = await sync(user, [], { device: 'd3', cursor: full.cursor });
    expect(rest.changes.map((c) => c.id)).toEqual([...free.changes.slice(PULL_PAGE_WITH_PUSH).map((c) => c.id), 'ultimo']);
    expect([rest.more, rest.deferred]).toEqual([false, undefined]);
  });

  it('no dia seguinte (UTC) o orçamento volta', async () => {
    const user = 'orcamento-amanha';
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET });
    const today = await sync(user, [solve('x')]);
    expect([today.accepted, today.deferred, today.retryAt]).toEqual([0, 1, nextUtcDay(T0)]);
    expect((await sync(user, [solve('x')], { now: nextUtcDay(T0) - 1 })).deferred).toBe(1); // o último milissegundo ainda é hoje
    const tomorrow = await sync(user, [solve('x')], { now: nextUtcDay(T0) });
    expect([tomorrow.accepted, tomorrow.rejected, tomorrow.deferred, tomorrow.retryAt]).toEqual([1, [], undefined, undefined]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(nextUtcDay(T0)), n: rowsOf(1) });
    expect(byId(await sync(user, [], { device: 'd2', now: nextUtcDay(T0) })).has('x')).toBe(true);
  });

  // Revisão, foco 3: o orçamento corta o lote no meio, e o pedaço lido tem uma recusa da cota. Com 2 gravações de folga, só as duas
  // primeiras mudanças são lidas: o novo volta com o motivo da cota, a edição é gravada, e as duas últimas ficam para amanhã, sem gravar.
  // Conta só o que foi gravado (a edição).
  it('cota e orçamento no mesmo lote', async () => {
    const user = 'cota-e-orcamento';
    await sync(user, [session(), solve('a'), solve('b')]);
    await setState(user, 'active', { solves: 100_000, sessions: 1, practice: 0 });
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(2) });
    const res = await sync(user, [solve('novo'), solve('a', { note: 'edição', updatedAt: T0 + 10 }), solve('novo2'), solve('b', { note: 'edição 2', updatedAt: T0 + 10 })]);
    expect([res.rejected, res.accepted, res.deferred, res.retryAt]).toEqual([[cota('novo')], 1, 2, nextUtcDay(T0)]);
    expect(res.changes.map((c) => c.id)).toEqual(['s1', 'b', 'a']); // o recebimento continua: a conta inteira, com a edição gravada por último
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect([all.has('novo'), all.has('novo2')]).toEqual([false, false]);
    expect(all.get('a')!.data).toMatchObject({ note: 'edição' });
    expect(all.get('b')!.data).toMatchObject({ note: '' });
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(2) + rowsOf(1) });
  });
});

// Os tamanhos que cabem (Task 12; a medição em docs/superpowers/measurements/2026-10-17-conta-100k.md): o orçamento do dia em linhas, o
// corte de cada pedido, a página de volta e a cascata de apagar uma sessão dentro do dia de uma conta.
describe('os tamanhos que cabem (Task 12)', () => {
  // N solves ativos na sessão `sid`, direto no SQLite do objeto (uma conta grande, sem 5 mil pedidos), com as revisões e os contadores.
  async function seedSolves(user: string, sid: string, n: number): Promise<void> {
    const data = JSON.stringify(solve('x', { sessionId: sid }).data);
    await runInDurableObject(stubOf(user), (_o, state) => {
      const sql = state.storage.sql;
      const read = (key: string) => sql.exec<{ value: string }>('SELECT value FROM state WHERE key = ?', key).toArray()[0]?.value ?? null;
      const set = (key: string, value: string) =>
        sql.exec('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
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
  const recordsOf = (user: string) =>
    runInDurableObject(stubOf(user), (_o, state) =>
      state.storage.sql.exec("SELECT store, id, deleted_at, rev FROM records WHERE store <> 'practice' ORDER BY store, id").toArray(),
    );

  it('as constantes medidas', () => {
    expect(MAX_SYNC_REQUEST).toBe(500); // o lote de um app de antes da Task 12, que o servidor ainda aceita
    expect(MAX_WRITES_PER_REQUEST).toBe(250);
    expect(SYNC_BATCH).toBe(MAX_WRITES_PER_REQUEST); // o app manda o que o servidor lê de uma vez
    expect([PULL_PAGE, PULL_PAGE_WITH_PUSH]).toEqual([500, 250]);
    expect([DAILY_WRITE_BUDGET, COMPACT_PER_DAY]).toEqual([20_000, 1_000]);
    expect([ROWS_PER_WRITE, ROWS_PER_COMPACT, REQUEST_ROWS]).toEqual([4, 1, 5]);
    // O máximo de registros que um pedido grava num dia (a sessão e a cascata dela; a restauração), com a compactação do alarme ao lado.
    expect(RECORDS_PER_DAY).toBe(4_747);
    expect(rowsOf(RECORDS_PER_DAY) + rowsOf(0, COMPACT_PER_DAY)).toBeLessThanOrEqual(DAILY_WRITE_BUDGET);
    expect(rowsOf(RECORDS_PER_DAY + 1) + rowsOf(0, COMPACT_PER_DAY)).toBeGreaterThan(DAILY_WRITE_BUDGET);
    // As vars do beta (wrangler.jsonc; a raiz em tests/unit/wrangler-config.test.ts). A cópia do dia não pára mais no que o app restaura num
    // dia: uma conta grande sai em partes e a restauração, quando não cabe no dia, vira um download (spec das cópias grandes). O teto fica em
    // 150 mil (a revisão final, I3): uma conta de 100 mil solves com a lixeira e as sessões, até o tempo de relógio ser medido no beta.
    const caps = capsOf(env as unknown as Env);
    expect([caps.snapshotRecords, caps.restoreRecords]).toEqual([150_000, 5_000]);
    expect([COPY_PART_RECORDS, BIG_COPY_EVERY_DAYS, COPY_PART_READS_PER_DAY]).toEqual([5_000, 7, 200]);
  });

  it('rowsOf: 4 linhas por registro gravado, 1 por solve compactado, e as 5 do estado quando o pedido grava; só receber não conta', () => {
    expect([rowsOf(0), rowsOf(0, 0)]).toEqual([0, 0]);
    expect([rowsOf(1), rowsOf(MAX_WRITES_PER_REQUEST), rowsOf(0, 1), rowsOf(0, COMPACT_PER_DAY), rowsOf(2, 3)]).toEqual([9, 1005, 6, 1005, 16]);
    // Por cima da medição (seção 9 (a)): 500 solves novos gravaram 2.007 linhas, 2 delas do aparelho, que só receber também grava.
    expect(rowsOf(500)).toBeGreaterThanOrEqual(2_007 - 2);
  });

  it('um lote maior que MAX_WRITES_PER_REQUEST (um app de antes manda até MAX_SYNC_REQUEST) volta com deferred e retryAt = agora', async () => {
    const user = 'corte-pedido';
    const batch = many('c', MAX_SYNC_REQUEST);
    const first = await sync(user, batch);
    const left = MAX_SYNC_REQUEST - MAX_WRITES_PER_REQUEST;
    expect([first.accepted, first.rejected, first.deferred, first.retryAt, first.serverTime]).toEqual([MAX_WRITES_PER_REQUEST, [], left, T0, T0]);
    const rest = await sync(user, batch.slice(MAX_WRITES_PER_REQUEST), { cursor: first.cursor });
    expect([rest.accepted, rest.rejected, rest.deferred, rest.retryAt]).toEqual([left, [], undefined, undefined]);
    expect((await sync(user, [], { device: 'd2' })).changes.map((c) => c.id)).toEqual(batch.map((c) => c.id));
    // Mais as linhas do estado de um pedido pelo aparelho novo (d2) que só recebeu: a linha dele conta no orçamento (revisão final, I2).
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: rowsOf(MAX_WRITES_PER_REQUEST) + rowsOf(left) + REQUEST_ROWS });
  });

  it('o corte do pedido e o orçamento juntos: lê o menor dos dois; o que o orçamento corta fica para amanhã, o que o pedido corta, para agora', async () => {
    const short = 'corte-orcamento-curto';
    await setState(short, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(100) });
    const a = await sync(short, many('x', MAX_WRITES_PER_REQUEST));
    expect([a.accepted, a.deferred, a.retryAt]).toEqual([100, MAX_WRITES_PER_REQUEST - 100, nextUtcDay(T0)]);
    const long = 'corte-orcamento-longo';
    await setState(long, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(300) });
    const b = await sync(long, many('y', MAX_SYNC_REQUEST));
    expect([b.accepted, b.deferred, b.retryAt]).toEqual([MAX_WRITES_PER_REQUEST, MAX_SYNC_REQUEST - MAX_WRITES_PER_REQUEST, T0]);
  });

  it('a página de volta: PULL_PAGE para quem só recebe, PULL_PAGE_WITH_PUSH para quem manda mudanças', async () => {
    const user = 'paginas';
    for (const prefix of ['a', 'b', 'c']) await sync(user, many(prefix, MAX_WRITES_PER_REQUEST));
    const pull = await sync(user, [], { device: 'd2' });
    expect([pull.changes.length, pull.more, pull.cursor]).toEqual([PULL_PAGE, true, PULL_PAGE]);
    const push = await sync(user, [solve('novo')], { device: 'd3' });
    expect([push.changes.length, push.more, push.cursor]).toEqual([PULL_PAGE_WITH_PUSH, true, PULL_PAGE_WITH_PUSH]);
    expect(push.changes).toEqual(pull.changes.slice(0, PULL_PAGE_WITH_PUSH));
  });

  it('apagar uma sessão: a cascata que cabe passa, e as linhas dela contam no orçamento', async () => {
    const user = 'cascata-cabe';
    await sync(user, [session(), solve('a'), solve('b'), solve('c')]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: rowsOf(4) });
    const res = await sync(user, [session('s1', gone(T0 + 10))]);
    expect([res.accepted, res.rejected, res.deferred]).toEqual([1, [], undefined]);
    const all = byId(await sync(user, [], { device: 'd2' }));
    expect(['s1', 'a', 'b', 'c'].map((id) => all.get(id)!.deletedAt)).toEqual([T0 + 10, T0 + 10, T0 + 10, T0 + 10]);
    // A sessão e os 3 solves da cascata, e o aparelho novo (d2) que recebeu.
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: rowsOf(4) + rowsOf(4) + REQUEST_ROWS });
  });

  it('a cascata que não cabe no que sobra hoje fica para amanhã, com o resto do lote, e passa no dia seguinte', async () => {
    const user = 'cascata-amanha';
    await sync(user, [session(), solve('a'), solve('b'), solve('c')]);
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(3) }); // cabem 3 gravações; a cascata grava 4
    const today = await sync(user, [practice('antes'), session('s1', gone(T0 + 10)), practice('depois')]);
    expect([today.accepted, today.rejected, today.deferred, today.retryAt]).toEqual([1, [], 2, nextUtcDay(T0)]);
    const seen = byId(await sync(user, [], { device: 'd2' }));
    expect(['s1', 'a', 'b', 'c'].map((id) => seen.get(id)!.deletedAt)).toEqual([null, null, null, null]);
    expect([seen.has('antes'), seen.has('depois')]).toEqual([true, false]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(3) + rowsOf(1) + REQUEST_ROWS }); // e o d2
    // No dia seguinte (UTC), o aparelho manda o resto, e a cascata passa.
    const tomorrow = nextUtcDay(T0);
    const next = await sync(user, [session('s1', gone(T0 + 10)), practice('depois')], { now: tomorrow });
    expect([next.accepted, next.rejected, next.deferred, next.retryAt]).toEqual([2, [], undefined, undefined]);
    const all = byId(await sync(user, [], { device: 'd2', now: tomorrow }));
    expect(['s1', 'a', 'b', 'c'].map((id) => all.get(id)!.deletedAt)).toEqual([T0 + 10, T0 + 10, T0 + 10, T0 + 10]);
    expect(all.has('depois')).toBe(true);
    // A sessão, os 3 solves e a tentativa; e a linha do d2, que passou de uma hora.
    expect(await json(user, 'writes')).toEqual({ day: utcDay(tomorrow), n: rowsOf(5) + REQUEST_ROWS });
  });

  // Nenhum pedido grava mais que o dia de uma conta, e a compactação do alarme sempre cabe ao lado: a exclusão de uma sessão cuja cascata
  // passa de RECORDS_PER_DAY registros (a sessão e os solves ativos dela) volta com o motivo da cota, e o aparelho a guarda ("só neste
  // aparelho"). Com um solve a menos, cabe num dia novo.
  it('a cascata que não caberia num dia volta com "cota", nada dela é gravado, e o resto do lote segue', async () => {
    const most = RECORDS_PER_DAY - 1; // os solves da maior cascata que cabe num dia
    const user = 'cascata-grande';
    await sync(user, [session()]);
    await seedSolves(user, 's1', most + 1);
    const before = await recordsOf(user);
    const writes = await json(user, 'writes');
    const rev = Number(await stateOf(user, 'rev'));
    const res = await sync(user, [session('s1', gone(T0 + 10)), practice('depois')], { now: nextUtcDay(T0) });
    expect([res.accepted, res.rejected, res.deferred, res.retryAt]).toEqual([1, [cota('s1', 'sessions')], undefined, undefined]);
    expect(await recordsOf(user)).toEqual(before); // nem a sessão nem os solves dela
    expect(writes).toEqual({ day: utcDay(T0), n: rowsOf(1) });
    expect(await json(user, 'writes')).toEqual({ day: utcDay(nextUtcDay(T0)), n: rowsOf(1) }); // só a tentativa
    expect((await sync(user, [], { device: 'd2', cursor: rev, now: nextUtcDay(T0) })).changes.map((c) => c.id)).toEqual(['depois']);

    const edge = 'cascata-no-limite';
    await sync(edge, [session()]);
    await seedSolves(edge, 's1', most);
    const day = await sync(edge, [session('s1', gone(T0 + 10))], { now: nextUtcDay(T0) });
    expect([day.accepted, day.rejected, day.deferred]).toEqual([1, [], undefined]);
    expect(await json(edge, 'writes')).toEqual({ day: utcDay(nextUtcDay(T0)), n: rowsOf(RECORDS_PER_DAY) });
    expect((await json<ActiveCounts>(edge, 'active')).solves).toBe(0);
  });

  // As exclusões repetidas da mesma sessão no lote (um app torto, ou de outra versão) leem os solves dela no índice uma vez só.
  it('250 exclusões da mesma sessão enorme leem os solves dela no índice uma vez só', async () => {
    const user = 'cascata-memo';
    await sync(user, [session()]);
    await seedSolves(user, 's1', RECORDS_PER_DAY);
    const reads = { n: 0 };
    await runInDurableObject(stubOf(user), (instance) => {
      const o = instance as unknown as { sql: SqlStorage };
      const real = o.sql;
      o.sql = new Proxy(real, {
        get(target, key) {
          if (key !== 'exec') {
            const value = Reflect.get(target, key) as unknown;
            return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
          }
          return (query: string, ...bindings: unknown[]) => {
            if (query === ACTIVE_CHILDREN) reads.n++;
            return target.exec(query, ...(bindings as SqlStorageValue[]));
          };
        },
      });
    });
    const res = await sync(user, Array.from({ length: MAX_WRITES_PER_REQUEST }, () => session('s1', gone(T0 + 10))), { now: nextUtcDay(T0) });
    expect([res.accepted, res.rejected.length, res.deferred]).toEqual([0, MAX_WRITES_PER_REQUEST, undefined]);
    expect(res.rejected.every((r) => r.id === 's1' && r.reason === QUOTA_REASON)).toBe(true);
    expect(reads.n).toBe(1);
  });
});

// As gravações do SQLite do objeto de `user` passam a falhar, como no grátis depois das 100 mil linhas do dia somadas entre todas as contas,
// e cada tentativa é contada. Só as gravações: as leituras seguem.
async function failWrites(user: string): Promise<{ n: number }> {
  const tried = { n: 0 };
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { sql: SqlStorage };
    const real = o.sql;
    o.sql = new Proxy(real, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        return (query: string, ...bindings: unknown[]) => {
          if (/^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP)\b/i.test(query)) {
            tried.n++;
            throw new Error('Exceeded allowed rows written in Durable Objects free tier.');
          }
          return target.exec(query, ...(bindings as SqlStorageValue[]));
        };
      },
    });
  });
  return tried;
}

// As consultas aos registros (FROM records) no objeto de `user`, contadas.
async function countRecordQueries(user: string): Promise<{ n: number }> {
  const seen = { n: 0 };
  await runInDurableObject(stubOf(user), (instance) => {
    const o = instance as unknown as { sql: SqlStorage };
    const real = o.sql;
    o.sql = new Proxy(real, {
      get(target, key) {
        const value = Reflect.get(target, key) as unknown;
        if (key !== 'exec') return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        return (query: string, ...bindings: unknown[]) => {
          if (/FROM records\b/.test(query)) seen.n++;
          return target.exec(query, ...(bindings as SqlStorageValue[]));
        };
      },
    });
  });
  return seen;
}

// N solves ativos na sessão s1 (ids `prefix`1 a `prefix`N), direto no SQLite do objeto, com as revisões depois das dela. Sem ler nada pelo
// pedido: as leituras do teste são só as dos pedidos dele.
async function seedRecords(user: string, n: number, prefix = 'x'): Promise<void> {
  const data = JSON.stringify(solve('x').data);
  await runInDurableObject(stubOf(user), (_o, state) => {
    const sql = state.storage.sql;
    const rev = Number(sql.exec<{ value: string }>("SELECT value FROM state WHERE key = 'rev'").toArray()[0]?.value ?? '0');
    sql.exec(
      `WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ?)
       INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) SELECT 'solves', ? || i, ?, ?, NULL, ?, ? + i, 's1' FROM n`,
      n, prefix, data, T0, T0, rev,
    );
    sql.exec("INSERT INTO state (key, value) VALUES ('rev', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", String(rev + n));
  });
}

// Revisão final (I2 a, b): o que um pedido grava além das mudanças dele. O aparelho (a tabela `devices`, que a página de privacidade cita e
// nada lê) é gravado só quando é novo ou quando a linha dele passou de DEVICE_TOUCH_MS, só os MAX_DEVICES mais recentes ficam, e a gravação
// conta no orçamento do dia; um sync que só recebe, com a linha do aparelho fresca, não grava nada.
describe('o que um pedido grava além das mudanças (revisão final, I2)', () => {
  const DAY = nextUtcDay(T0); // a meia-noite UTC depois de T0: o dia inteiro pela frente
  const devicesOf = (user: string) =>
    runInDurableObject(stubOf(user), (_o, state) =>
      state.storage.sql.exec<{ device_id: string; last_sync_at: number }>('SELECT device_id, last_sync_at FROM devices ORDER BY last_sync_at, device_id').toArray(),
    );

  it('as constantes', () => {
    expect([DEVICE_TOUCH_MS, MAX_DEVICES]).toEqual([3_600_000, 20]);
  });

  it('esgotadas as gravações do dia, um sync que só recebe, com a linha do aparelho fresca, devolve a página sem gravar nada', async () => {
    const user = 'so-recebe-sem-gravar';
    await sync(user, [session(), solve('a'), solve('b')], { now: DAY });
    await sync(user, [], { device: 'd2', now: DAY }); // a linha do d2 nasce aqui
    await setState(user, 'writes', { day: utcDay(DAY), n: DAILY_WRITE_BUDGET });
    const tried = await failWrites(user);
    const res = await sync(user, [], { device: 'd2', now: DAY + DEVICE_TOUCH_MS });
    expect(res.changes.map((c) => c.id)).toEqual(['s1', 'a', 'b']);
    expect(tried.n).toBe(0);
  });

  it('com a linha do aparelho velha e as gravações falhando, o recebimento continua: o aparelho fica para depois', async () => {
    const user = 'so-recebe-aparelho-velho';
    await sync(user, [session(), solve('a')], { now: DAY });
    const tried = await failWrites(user);
    const res = await sync(user, [], { now: DAY + DEVICE_TOUCH_MS + 1 });
    expect(res.changes.map((c) => c.id)).toEqual(['s1', 'a']);
    expect(tried.n).toBeGreaterThan(0); // tentou gravar o aparelho, e a falha não derrubou o pedido
  });

  it('o aparelho é gravado quando é novo ou quando a linha dele passou de DEVICE_TOUCH_MS, e conta no orçamento do dia', async () => {
    const user = 'aparelho-hora';
    await sync(user, [session()], { now: DAY });
    expect(await devicesOf(user)).toEqual([{ device_id: 'd1', last_sync_at: DAY }]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(DAY), n: rowsOf(1) }); // num pedido que grava, o aparelho está nas REQUEST_ROWS
    await sync(user, [], { now: DAY + DEVICE_TOUCH_MS }); // fresca: nada
    expect(await devicesOf(user)).toEqual([{ device_id: 'd1', last_sync_at: DAY }]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(DAY), n: rowsOf(1) });
    await sync(user, [], { now: DAY + DEVICE_TOUCH_MS + 1 }); // velha: gravada, e conta as linhas do estado de um pedido
    expect(await devicesOf(user)).toEqual([{ device_id: 'd1', last_sync_at: DAY + DEVICE_TOUCH_MS + 1 }]);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(DAY), n: rowsOf(1) + REQUEST_ROWS });
    await sync(user, [], { device: 'd2', now: DAY + DEVICE_TOUCH_MS + 2 }); // novo
    expect((await devicesOf(user)).map((d) => d.device_id)).toEqual(['d1', 'd2']);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(DAY), n: rowsOf(1) + 2 * REQUEST_ROWS });
    // Sem linhas no dia para ele, um aparelho novo não é gravado (nada o lê), e o sync dele segue.
    await setState(user, 'writes', { day: utcDay(DAY), n: DAILY_WRITE_BUDGET - REQUEST_ROWS + 1 });
    expect((await sync(user, [], { device: 'd3', now: DAY + DEVICE_TOUCH_MS + 3 })).changes.map((c) => c.id)).toEqual(['s1']);
    expect((await devicesOf(user)).map((d) => d.device_id)).toEqual(['d1', 'd2']);
    expect(await json(user, 'writes')).toEqual({ day: utcDay(DAY), n: DAILY_WRITE_BUDGET - REQUEST_ROWS + 1 });
  });

  it('só os MAX_DEVICES aparelhos mais recentes ficam: o mais velho sai quando entra um novo além deles', async () => {
    const user = 'aparelhos-teto';
    for (let i = 0; i < MAX_DEVICES + 5; i++) await sync(user, [], { device: `d${i}`, now: DAY + i });
    expect((await devicesOf(user)).map((d) => d.device_id)).toEqual(Array.from({ length: MAX_DEVICES }, (_, i) => `d${i + 5}`));
  });
});

// Revisão final (I2 c): pedir sempre do cursor 0 lê uma página inteira por pedido; na rajada, uma conta só esvaziaria as 5 milhões de linhas
// lidas por dia que todas dividem. Cada conta tem um orçamento de leituras por dia UTC (DAILY_READ_BUDGET), folgado para o primeiro sync de
// uma conta de 100 mil solves; passado dele, o pedido não lê nada, o lote volta todo para a virada do dia, e o cursor fica.
describe('o orçamento de leituras do dia (revisão final, I2 c)', () => {
  it('as constantes', () => {
    expect([DAILY_READ_BUDGET, READS_SAVE_EVERY]).toEqual([500_000, 10_000]);
    expect(DAILY_READ_BUDGET).toBeGreaterThan(4 * 110_034); // o primeiro sync de uma conta de 100 mil solves (110.034 registros), quatro vezes
  });

  it('passado o orçamento, o pedido não lê nada: nem a página, nem o lote, que volta todo; no dia seguinte, recomeça do mesmo cursor e nada se perde', async () => {
    const user = 'leituras-fim';
    await sync(user, [session(), solve('a'), solve('b')]);
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET });
    const writes = await json(user, 'writes');
    const rev = await stateOf(user, 'rev');
    const queries = await countRecordQueries(user);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    let res: SyncResponse;
    try {
      res = await sync(user, [solve('c')], { device: 'd2' });
      const logged = out.mock.calls.flat().flatMap((l) => (String(l).startsWith('{') ? [JSON.parse(String(l)) as unknown] : []));
      expect(logged).toContainEqual(expect.objectContaining({ evt: 'sync', user, pushed: 1, deferred: 1, pulled: 0, unread: 1 }));
    } finally {
      out.mockRestore();
    }
    expect(res).toMatchObject({ accepted: 0, rejected: [], changes: [], cursor: 0, more: false, deferred: 1, retryAt: nextUtcDay(T0), readsDeferred: true });
    const quiet = await sync(user, [], { device: 'd2', cursor: 1 }); // só recebendo: o cursor do pedido volta como veio
    expect(quiet).toMatchObject({ changes: [], cursor: 1, more: false, retryAt: nextUtcDay(T0), readsDeferred: true });
    expect(quiet.deferred).toBeUndefined();
    expect(queries.n).toBe(0);
    expect([await json(user, 'writes'), await stateOf(user, 'rev')]).toEqual([writes, rev]);
    // No dia seguinte (UTC), do mesmo cursor: a conta inteira chega, e o solve que esperou entra.
    const next = await sync(user, [solve('c')], { device: 'd2', now: nextUtcDay(T0) });
    expect([next.accepted, next.rejected, next.deferred, next.readsDeferred]).toEqual([1, [], undefined, undefined]);
    expect(next.changes.map((c) => c.id)).toEqual(['s1', 'a', 'b', 'c']);
  });

  it('as linhas lidas contam na memória do objeto e vão para o estado só a cada READS_SAVE_EVERY', async () => {
    const user = 'leituras-conta';
    await seedRecords(user, PULL_PAGE + 100); // sem nenhum pedido antes: o que conta é só o que os pedidos daqui leem
    await setState(user, 'active', { solves: PULL_PAGE + 100, sessions: 0, practice: 0 }); // e com os contadores: sem a contagem inicial
    await setState(user, 'bytes', 1);
    const pull = () => sync(user, [], { device: 'd2' }); // do cursor 0: PULL_PAGE + 1 linhas (a página e a que diz `more`)
    const per = PULL_PAGE + 1;
    const until = Math.ceil(READS_SAVE_EVERY / per);
    for (let i = 1; i < until; i++) await pull();
    expect(await stateOf(user, 'reads')).toBeNull();
    await pull();
    expect(await json(user, 'reads')).toEqual({ day: utcDay(T0), n: until * per });
    await pull();
    expect(await json(user, 'reads')).toEqual({ day: utcDay(T0), n: until * per }); // o resto fica na memória até a próxima vez
    // O que está na memória conta: com o guardado a uma página do teto, mais um pedido passa e o seguinte já não lê.
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - per - 1 });
    expect((await pull()).changes).toHaveLength(PULL_PAGE);
    expect((await pull()).readsDeferred).toBe(true);
  });

  // Revisão final (resíduo, I1): toda leitura conta, também a contagem inicial de uma conta sem os contadores (as do beta, uma vez), que
  // varre a tabela duas vezes (os ativos e os bytes) no primeiro pedido, seja um sync ou uma restauração.
  it('a contagem inicial de uma conta sem os contadores conta as duas varreduras da tabela', async () => {
    const user = 'leituras-contadores';
    const n = 300;
    await seedRecords(user, n); // sem os contadores no estado
    await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - 2 * n });
    const first = await sync(user, [], { cursor: n }); // do cursor da conta: a página não lê nada
    expect([first.changes, first.readsDeferred]).toEqual([[], undefined]);
    expect(await stateOf(user, 'active')).not.toBeNull();
    expect((await sync(user, [], { cursor: n })).readsDeferred).toBe(true);
  });

  it('a cópia do dia e a restauração também contam as linhas que leem', async () => {
    // Uma conta de 10 solves sem nenhum pedido antes, a uma linha do teto de leituras do dia.
    const fresh = async (user: string): Promise<void> => {
      await setState(user, 'userId', user);
      await seedRecords(user, 10);
      await setState(user, 'reads', { day: utcDay(T0), n: DAILY_READ_BUDGET - 1 });
    };
    await fresh('leituras-controle');
    expect((await sync('leituras-controle', [], { device: 'd2' })).readsDeferred).toBeUndefined(); // sozinho, o pedido ainda lê
    await fresh('leituras-copia');
    expect(await stubOf('leituras-copia').snapshot(T0)).toBe(true);
    expect((await sync('leituras-copia', [], { device: 'd2' })).readsDeferred).toBe(true);
    const other = 'leituras-restaura';
    await fresh(other);
    await env.SNAPSHOTS.put(snapshotKey(other, dayOf(T0)), await gzipJson(exportFromRecords([], T0))); // uma cópia vazia: tudo vai para a lixeira
    const restored = await call(`/api/snapshots/${dayOf(T0)}/restore`, postJson({}, { [ACCOUNT_HEADER]: other }), { deps: testDeps({ user: other, now: () => T0 + 1000 }) });
    expect(restored.status).toBe(204);
    expect((await sync(other, [], { device: 'd2' })).readsDeferred).toBe(true);
  });
});

// Revisão final (pino 7): a mesma chave duas vezes no lote de um pedido (um app torto, ou de outra versão). Fica fixado o de hoje: o lote
// grava cada chave uma vez (a última versão que vence), o corte do pedido conta as duas (por cima, como deve), e a cota e o teto de bytes
// enxergam a versão do lote que veio antes.
describe('a mesma chave duas vezes no lote (pino)', () => {
  it('grava uma vez, com a revisão e as linhas de uma gravação', async () => {
    const user = 'repetida-grava';
    await sync(user, [session()]);
    const rev = Number(await stateOf(user, 'rev'));
    const writes = (await json<{ n: number }>(user, 'writes')).n;
    const res = await sync(user, [solve('a', { note: 'um' }), solve('a', { note: 'dois', updatedAt: T0 + 10 })]);
    expect([res.accepted, res.rejected]).toEqual([2, []]);
    expect(Number(await stateOf(user, 'rev'))).toBe(rev + 1);
    expect((await json<{ n: number }>(user, 'writes')).n).toBe(writes + rowsOf(1));
    expect(byId(await sync(user, [], { device: 'd2' })).get('a')!.data).toMatchObject({ note: 'dois' });
  });

  it('o corte do pedido conta as duas: com linhas para uma gravação, a segunda fica para amanhã', async () => {
    const user = 'repetida-corte';
    await setState(user, 'writes', { day: utcDay(T0), n: DAILY_WRITE_BUDGET - rowsOf(1) });
    const res = await sync(user, [solve('a', { note: 'um' }), solve('a', { note: 'dois', updatedAt: T0 + 10 })]);
    expect([res.accepted, res.deferred, res.retryAt]).toEqual([1, 1, nextUtcDay(T0)]);
  });

  it('a cota e o teto de bytes veem a versão do lote que veio antes', async () => {
    const user = 'repetida-cota';
    await sync(user, [session(), solve('a')]);
    await setState(user, 'active', { solves: 99_999, sessions: 1, practice: 0 });
    // A vaga que sobra vai para o novo; a segunda versão dele é uma edição de um ativo, e passa. Outro novo, não.
    const quota = await sync(user, [solve('n', { note: 'um' }), solve('n', { note: 'dois', updatedAt: T0 + 10 }), solve('m')]);
    expect(quota.rejected).toEqual([cota('m')]);
    expect(await json(user, 'active')).toEqual({ solves: 100_000, sessions: 1, practice: 0, duels: 0 });
    // Com folga de 25 bytes: a segunda versão cresce 10 sobre a primeira (não 20 sobre a gravada), e as duas passam.
    const note = (n: number) => 'x'.repeat(n);
    await setState(user, 'bytes', ACCOUNT_BYTES_CAP - 25);
    const cap = await sync(user, [solve('a', { note: note(10), updatedAt: T0 + 20 }), solve('a', { note: note(20), updatedAt: T0 + 30 })]);
    expect(cap.rejected).toEqual([]);
    expect(await json(user, 'bytes')).toBe(ACCOUNT_BYTES_CAP - 25 + 20);
    // A terceira passaria do teto pela soma corrente do lote: volta com a cota, e a segunda fica gravada.
    const over = await sync(user, [solve('a', { note: note(22), updatedAt: T0 + 40 }), solve('a', { note: note(28), updatedAt: T0 + 50 })]);
    expect(over.rejected).toEqual([cota('a')]);
    expect(byId(await sync(user, [], { device: 'd2' })).get('a')!.data).toMatchObject({ note: note(22) });
  });
});
