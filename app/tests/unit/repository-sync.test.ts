import type { IDBPDatabase } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { seasonOne } from '../../src/core/season';
import { toChange } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import { MAX_STAMP, SYNC_BATCH, SYNC_PROTOCOL, syncKey, type Change } from '../../src/core/sync/types';
import type { SeasonProgress } from '../../src/core/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { AccountChangedError, createRepository, createSyncClock, PendingChangesError, type ChangeKind, type ChangeOrigin, type Repository } from '../../src/data/repository';
import { FakeServer } from './sync-fakes';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number, at = t) => ({ sessionId, event: '333' as const, ms, penalty: null, at, scramble: "R U R'" });

async function fresh(account: string | null = 'conta-1'): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository; lines: string[] }> {
  const db = await openKlickDb(`sync-repo-${++n}`);
  const lines: string[] = [];
  const repo = createRepository(db, { now, channel: null, log: (line) => lines.push(line) });
  if (account) await repo.saveSyncState({ accountId: account, signedIn: true });
  return { db, repo, lines };
}
const keys = async (db: IDBPDatabase<KlickDB>): Promise<string[]> => ((await db.getAllKeys('outbox')) as string[]).sort();

// Um solve como chega do servidor (o envelope da spec 6.1).
const remoteSolve = (id: string, sessionId: string, o: Partial<Change> & { note?: string; ms?: number; at?: number } = {}): Change => ({
  store: 'solves',
  id,
  data: { sessionId, event: '333', ms: o.ms ?? 9000, penalty: null, at: o.at ?? t, scramble: "R U R'", note: o.note ?? '', createdAt: t },
  updatedAt: o.updatedAt ?? t,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? t,
});
const remoteSession = (id: string, o: Partial<Change> & { name?: string } = {}): Change => ({
  store: 'sessions',
  id,
  data: { name: o.name ?? 'Da conta', event: '333', order: 0, createdAt: t },
  updatedAt: o.updatedAt ?? t,
  deletedAt: o.deletedAt ?? null,
  deletionStamp: o.deletionStamp ?? t,
});

// Uma rodada do motor, à mão (como o da Task 12): sobe a fila (no primeiro login, nada), confirma o que subiu antes de juntar a volta, junta
// e guarda o cursor; repete enquanto há fila ou `more`. A volta é clonada, como se viesse em JSON.
async function syncRound(repo: Repository, server: FakeServer, push = true): Promise<void> {
  for (let guard = 0; guard < 50; guard++) {
    const state = await repo.getSyncState();
    const batch = push ? await repo.outboxBatch(SYNC_BATCH) : { changes: [], sent: [] };
    const req = { v: SYNC_PROTOCOL, account: 'conta-1', deviceId: 'teste', cursor: state.cursor, clock: state.clock, changes: batch.changes };
    const res = structuredClone(server.sync(structuredClone(req)));
    await repo.confirmSent(batch.sent);
    await repo.applyRemote(res.changes, res.serverTime);
    await repo.saveSyncState({ cursor: res.cursor });
    if (!res.more && (!push || (await repo.outboxCount()) === 0)) return;
  }
  throw new Error('a rodada não terminou');
}

describe('a fila no envio (spec 5.3 e 6.1)', () => {
  it('o lote sai da mais antiga para a mais nova, com o registro atual; só sai da fila o que não mudou durante o pedido', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    t += 10;
    const a = await repo.addSolve(ns(s.id, 1000));
    const batch = await repo.outboxBatch(500);
    expect(batch.changes.map((c) => `${c.store}/${c.id}`)).toEqual([`sessions/${s.id}`, `solves/${a.id}`]);
    expect(batch.changes[1]).toEqual(toChange('solves', (await db.get('solves', a.id))!));
    t += 10;
    await repo.updateSolve(a.id, { note: 'durante o pedido' }); // volta à fila com outra data enquanto o pedido estava fora
    await repo.confirmSent(batch.sent);
    expect(await db.getAllKeys('outbox')).toEqual([`solves/${a.id}`]);
    expect(await repo.outboxCount()).toBe(1);
    expect((await repo.outboxBatch(1)).changes).toHaveLength(1);
  });

  it('o que o servidor recusaria não sobe: sai da fila e vai para o log local, só com store, id e motivo (spec 6.6)', async () => {
    const { db, repo, lines } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const ok = await repo.addSolve(ns(s.id, 1000));
    // Um registro de antes da v3 com a própria data torta, e uma entrada cujo registro não existe mais.
    await db.put('solves', { ...(await db.get('solves', ok.id))!, id: 'torto', updatedAt: 1.5 });
    await db.put('outbox', { store: 'solves', id: 'torto', queuedAt: 0 }, 'solves/torto');
    await db.put('outbox', { store: 'solves', id: 'sumiu', queuedAt: 0 }, 'solves/sumiu');
    const batch = await repo.outboxBatch(500);
    expect(batch.changes.map((c) => syncKey(c.store, c.id))).toEqual([`sessions/${s.id}`, `solves/${ok.id}`]);
    expect(batch.sent.map((e) => syncKey(e.store, e.id))).toEqual([`sessions/${s.id}`, `solves/${ok.id}`]);
    expect([batch.refused, batch.missing]).toEqual([1, 1]);
    expect(lines).toEqual([
      'sync: fora da fila, o registro não existe mais: solves/sumiu',
      'sync: fora da fila, o servidor recusaria solves/torto (datas inválidas)',
    ]);
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${ok.id}`].sort());
    expect(await db.get('solves', 'torto')).toBeDefined(); // o registro fica no aparelho; só não sobe
  });
});

describe('juntar um lote do servidor (spec 6.1 e 6.3)', () => {
  it('o mais novo vence de cada lado; o relógio sobe com o servidor; a tela relê como mudança de fora', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const mine = await repo.addSolve(ns(s.id, 1000));
    await repo.updateSolve(mine.id, { note: 'daqui, mais nova' });
    const heard: [ChangeKind, ChangeOrigin][] = [];
    repo.onChange((k, o) => heard.push([k, o]));
    const result = await repo.applyRemote(
      [remoteSolve(mine.id, s.id, { note: 'velha', updatedAt: t - 5000 }), remoteSolve('novo', s.id, { updatedAt: t + 50 })],
      t + 3_600_000,
    );
    expect(result).toEqual({ applied: 1, rejected: 0 });
    expect((await db.get('solves', mine.id))?.note).toBe('daqui, mais nova');
    expect((await db.get('solves', 'novo'))?.ms).toBe(9000);
    expect((await repo.getSyncState()).clock).toBe(t + 3_600_000);
    expect(heard).toEqual([['solves', 'remote']]);
    expect(await db.getAllKeys('outbox')).not.toContain('solves/novo'); // o que veio do servidor não volta para lá
  });

  it('a exclusão que chega vence a edição daqui (D5), e a cascata da sessão entra na fila', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(s.id, 1000));
    t += 100;
    await repo.updateSolve(x.id, { note: 'edição offline' });
    await db.clear('outbox'); // a edição já subiu: o que entrar na fila agora é da cascata
    const gone = t - 50; // a sessão foi apagada no outro aparelho antes desta edição
    await repo.applyRemote([remoteSession(s.id, { deletedAt: gone, deletionStamp: gone, updatedAt: gone, name: 'Sessão 1' })], t);
    expect((await db.get('sessions', s.id))?.deletedAt).toBe(gone);
    expect(await db.get('solves', x.id)).toMatchObject({ deletedAt: gone, note: 'edição offline' });
    expect(await keys(db)).toEqual([`solves/${x.id}`]); // só o que a cascata mudou aqui; a sessão veio de lá
  });

  it('os solves de uma sessão só são lidos quando a cascata os pede (uma sessão excluída), não a cada lote', async () => {
    const { repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.addSolve(ns(s.id, 2000));
    const read: string[] = [];
    const real = IDBIndex.prototype.getAll;
    const spy = vi.spyOn(IDBIndex.prototype, 'getAll').mockImplementation(function (this: IDBIndex, ...args: Parameters<IDBIndex['getAll']>) {
      if (this.name === 'bySession') read.push(String((args[0] as IDBKeyRange).lower[0]));
      return real.apply(this, args);
    });
    try {
      t += 100;
      await repo.applyRemote([remoteSolve(a.id, s.id, { note: 'de lá', updatedAt: t })], t);
      expect(read).toEqual([]); // sessão ativa: a cascata não age, e os solves dela nem são lidos
      t += 100;
      expect(await repo.countRemoteDeletions([remoteSession(s.id, { deletedAt: t, deletionStamp: t, updatedAt: t })])).toBe(2);
      await repo.applyRemote([remoteSession(s.id, { deletedAt: t, deletionStamp: t, updatedAt: t })], t);
      expect(read).toEqual([s.id, s.id]); // uma leitura em cada: a sessão excluída pediu os solves dela
    } finally {
      spy.mockRestore();
    }
    expect(await repo.listSolves()).toEqual([]);
  });

  it('conta os solves ativos que o lote apagaria, sem gravar nada', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    const later = t + 1000;
    const batch = [a, b].map((x) => remoteSolve(x.id, s.id, { deletedAt: later, deletionStamp: later, updatedAt: later }));
    expect(await repo.countRemoteDeletions(batch)).toBe(2);
    expect((await db.get('solves', a.id))?.deletedAt).toBeNull();
  });

  it('a temporada do servidor é adotada, a não ser que a daqui ainda espere na fila (spec 6.4)', async () => {
    const { db, repo } = await fresh();
    const theirs: SeasonProgress = { current: { ...seasonOne(), n: 2 }, past: [{ n: 1, startedAt: 0, endedAt: t, solves: 1000, startAo12: null, endAo12: null }] };
    const change: Change = { store: 'prefs', id: 'season', data: theirs, updatedAt: t - 10, deletedAt: null, deletionStamp: t - 10 };
    await repo.applyRemote([change], t);
    expect((await repo.getProfile()).season.past).toHaveLength(1);
    await repo.advanceSeason(2, { n: 2, startedAt: t, endedAt: t + 1, solves: 50, startAo12: null, endAo12: null }, { ...seasonOne(), n: 3 });
    await repo.applyRemote([{ ...change, updatedAt: t + 99, deletionStamp: t + 99 }], t + 100);
    expect((await repo.getProfile()).season.past).toHaveLength(2); // a daqui sobe primeiro; o servidor decide
    await db.clear('outbox');
    await repo.applyRemote([{ ...change, updatedAt: t + 200, deletionStamp: t + 200 }], t + 200);
    expect((await repo.getProfile()).season.past).toHaveLength(1);
  });

  it('uma mudança torta é ignorada e contada, e as datas dela não sobem o relógio', async () => {
    const { repo } = await fresh();
    const clock = (await repo.getSyncState()).clock;
    const huge = Number.MAX_SAFE_INTEGER;
    expect(
      await repo.applyRemote([{ store: 'solves', id: 'x', data: {}, updatedAt: huge, deletedAt: null, deletionStamp: huge }, null], Number.NaN),
    ).toEqual({ applied: 0, rejected: 2 });
    expect((await repo.getSyncState()).clock).toBe(clock);
  });

  it('o relógio sobe também até a data de uma mudança que passa da hora do servidor', async () => {
    const { repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    await repo.applyRemote([remoteSolve('adiante', s.id, { updatedAt: t + 5000, deletionStamp: t + 4000 })], t);
    expect((await repo.getSyncState()).clock).toBe(t + 5000);
  });

  it('uma data acima do teto (MAX_STAMP) é recusada e não prende o relógio; uma no teto entra, sem subir o relógio até ela', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const clock = (await repo.getSyncState()).clock;
    const near = Number.MAX_SAFE_INTEGER - 1;
    expect(await repo.applyRemote([remoteSolve('longe', s.id, { updatedAt: near, deletionStamp: near })], near)).toEqual({ applied: 0, rejected: 1 });
    expect(await db.get('solves', 'longe')).toBeUndefined();
    expect(await repo.applyRemote([remoteSolve('no-teto', s.id, { updatedAt: MAX_STAMP, deletionStamp: MAX_STAMP })], MAX_STAMP)).toEqual({
      applied: 1,
      rejected: 0,
    });
    expect((await repo.getSyncState()).clock).toBe(clock); // no teto, o stamp seguinte (clock + 1) já seria recusado
    await repo.saveSyncState({ clock: near }); // o motor guarda a hora do servidor por aqui: o mesmo teto
    await repo.saveSyncState({ clock: MAX_STAMP });
    expect((await repo.getSyncState()).clock).toBe(clock);
    const x = await repo.addSolve(ns(s.id, 1000));
    expect(checkChange(toChange('solves', (await db.get('solves', x.id))!)).ok).toBe(true);
  });
});

describe('o lote de outra conta (Task 13: a conferência dentro da transação)', () => {
  it('com a conta da rodada diferente da gravada, nada entra: nem registro, nem relógio, nem aviso', async () => {
    const { repo } = await fresh('conta-2');
    const s = await repo.createSession({ event: '333' });
    const clock = (await repo.getSyncState()).clock;
    const seen: ChangeKind[] = [];
    repo.onChange((kind) => seen.push(kind));
    await expect(repo.applyRemote([remoteSolve('de-la', s.id, { updatedAt: t + 5000 })], t + 9000, 'conta-1')).rejects.toBeInstanceOf(AccountChangedError);
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([]);
    expect((await repo.getSyncState()).clock).toBe(clock);
    expect(seen).toEqual([]);
    expect(await repo.applyRemote([remoteSolve('de-la', s.id, { updatedAt: t + 5000 })], t + 9000, 'conta-2')).toEqual({ applied: 1, rejected: 0 });
  });

  it('o cursor e a hora do sync vão na mesma transação que junta o lote, e saem num aviso "sync"; com a conta errada, não mudam', async () => {
    const { repo } = await fresh('conta-1');
    const seen: ChangeKind[] = [];
    repo.onChange((kind) => seen.push(kind));
    await repo.applyRemote([remoteSession('da-conta')], t + 9000, 'conta-1', { cursor: 7, lastSyncAt: t });
    expect(await repo.getSyncState()).toMatchObject({ cursor: 7, lastSyncAt: t, clock: t + 9000 });
    expect(seen).toEqual(['sessions', 'sync']);
    await expect(repo.applyRemote([], t + 9999, 'conta-2', { cursor: 99, lastSyncAt: t + 1 })).rejects.toBeInstanceOf(AccountChangedError);
    expect(await repo.getSyncState()).toMatchObject({ cursor: 7, lastSyncAt: t, clock: t + 9000 });
  });

  it('sem conta gravada (os dados foram apagados), o lote da rodada também não entra', async () => {
    const { repo } = await fresh(null);
    await expect(repo.applyRemote([remoteSession('da-conta')], t, 'conta-1')).rejects.toBeInstanceOf(AccountChangedError);
    expect(await repo.listSessions({ includeDeleted: true })).toEqual([]);
  });
});

describe('o relógio de uma escrita (spec 5.4)', () => {
  it('stamp() é o mesmo até o relógio subir; depois de raise, o próximo sai depois dele', () => {
    const clock = createSyncClock(10, () => 5);
    expect([clock.stamp(), clock.stamp()]).toEqual([11, 11]);
    clock.raise(100);
    expect([clock.stamp(), clock.value()]).toEqual([101, 101]);
    clock.raise(50); // abaixo: nada muda
    expect(clock.stamp()).toBe(101);
  });

  it('raise ignora o que não é inteiro seguro >= 0 e o que chega ao teto: todo stamp que sai continua uma data aceita', () => {
    expect(MAX_STAMP).toBe(Number.MAX_SAFE_INTEGER - 2 ** 32);
    const clock = createSyncClock(10, () => 5);
    for (const bad of [Number.NaN, -1, 1.5, 1e300, Number.MAX_SAFE_INTEGER, MAX_STAMP + 1, MAX_STAMP]) clock.raise(bad);
    expect(clock.value()).toBe(10);
    clock.raise(MAX_STAMP - 1);
    expect(clock.value()).toBe(MAX_STAMP - 1);
    expect(clock.stamp()).toBe(MAX_STAMP);
  });
});

describe('primeiro login num aparelho com dados (spec 6.5)', () => {
  it('o solve daqui igual a um da conta, com outro id, e a "Sessão 1" vazia de um evento que a conta tem, saem sem subir', async () => {
    const { db, repo } = await fresh(null);
    const local = await repo.createSession({ event: '333' }); // "Sessão 1", deste aparelho
    const extra = await repo.createSession({ event: '333', name: 'Treino daqui' });
    const twin = await repo.addSolve(ns(extra.id, 9000, t - 99)); // o mesmo csTimer importado antes, com id diferente
    const own = await repo.addSolve(ns(extra.id, 12_000, t - 50));
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    expect((await db.getAllKeys('outbox')).length).toBe(4);
    // A conta inteira chega (pull) antes de subir qualquer coisa.
    await repo.applyRemote([remoteSession('conta-s'), remoteSolve('conta-x', 'conta-s', { ms: 9000, at: t - 99 })], t);
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 1, sessions: 1 });
    expect((await db.get('solves', twin.id))?.deletedAt).not.toBeNull();
    expect((await db.get('sessions', local.id))?.deletedAt).not.toBeNull();
    expect(((await db.getAllKeys('outbox')) as string[]).sort()).toEqual([`sessions/${extra.id}`, `solves/${own.id}`].sort());
    expect((await repo.listSolves()).map((s) => s.id).sort()).toEqual(['conta-x', own.id].sort());
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 0, sessions: 0 }); // de novo (o app fechou antes de firstSync sair): nada
  });

  it('a nota do solve repetido vai para o da conta, como edição que sobe', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333', name: 'Daqui' });
    const notes: [string, string][] = [
      ['', 'daqui'], // vazia lá: fica a daqui
      ['de lá', 'daqui'], // diferentes: as duas
      ['igual', 'igual'], // iguais: nada muda
      ['só lá', ''], // vazia aqui: nada muda
    ];
    for (const [i, [, mine]] of notes.entries()) {
      const x = await repo.addSolve(ns(s.id, 1000 + i, t - 100));
      if (mine) await repo.updateSolve(x.id, { note: mine });
    }
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    await repo.applyRemote(
      [remoteSession('conta-s'), ...notes.map(([theirs], i) => remoteSolve(`conta-${i}`, 'conta-s', { ms: 1000 + i, at: t - 100, note: theirs }))],
      t,
    );
    t += 10;
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 4, sessions: 0 });
    const after = await Promise.all(notes.map((_, i) => db.get('solves', `conta-${i}`)));
    expect(after.map((x) => x?.note)).toEqual(['daqui', 'de lá / daqui', 'igual', 'só lá']);
    expect(after.map((x) => x?.updatedAt)).toEqual([t, t, t - 10, t - 10]); // a edição tem a data do relógio
    expect(await keys(db)).toEqual([`sessions/${s.id}`, 'solves/conta-0', 'solves/conta-1'].sort());
  });

  it('a nota que, junta, passaria do tamanho que o servidor aceita não vai: o solve da conta fica, e a daqui fica na lixeira', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333', name: 'Daqui' });
    const mine = 'a'.repeat(9000);
    const theirs = 'b'.repeat(9000);
    const x = await repo.addSolve(ns(s.id, 1000, t - 100));
    await repo.updateSolve(x.id, { note: mine });
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    await repo.applyRemote([remoteSession('conta-s'), remoteSolve('conta-x', 'conta-s', { ms: 1000, at: t - 100, note: theirs })], t);
    const before = await db.get('solves', 'conta-x');
    t += 10;
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 1, sessions: 0 });
    expect(await db.get('solves', 'conta-x')).toEqual(before);
    expect(await db.get('solves', x.id)).toMatchObject({ note: mine, deletedAt: t });
    expect(await keys(db)).toEqual([`sessions/${s.id}`]);
  });

  it('desliga firstSync na mesma transação: se ela falha, nada muda; depois dela, rodar de novo não faz nada', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333', name: 'Daqui' });
    const x = await repo.addSolve(ns(s.id, 9000, t - 99));
    await repo.updateSolve(x.id, { note: 'daqui' });
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    // A conta tem o mesmo solve duas vezes: depois da nota levada, o primeiro está na fila e seria "gêmeo" do segundo numa nova rodada.
    await repo.applyRemote(
      [remoteSession('conta-s'), remoteSolve('conta-a', 'conta-s', { ms: 9000, at: t - 99 }), remoteSolve('conta-b', 'conta-s', { ms: 9000, at: t - 99 })],
      t,
    );
    // O app morre bem na gravação que desliga firstSync: a deduplicação inteira volta junto (nada pela metade para uma nova rodada).
    const real = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'meta' && (args[0] as { firstSync?: unknown } | null)?.firstSync === false) throw new DOMException('morreu', 'AbortError');
      return real.apply(this, args);
    });
    try {
      await expect(repo.dedupeFirstLogin()).rejects.toThrow('morreu');
    } finally {
      spy.mockRestore();
    }
    expect((await repo.getSyncState()).firstSync).toBe(true);
    expect((await db.get('solves', x.id))?.deletedAt).toBeNull();
    expect((await db.get('solves', 'conta-a'))?.note).toBe('');
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${x.id}`].sort());

    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 1, sessions: 0 });
    expect((await repo.getSyncState()).firstSync).toBe(false);
    expect((await db.get('solves', 'conta-a'))?.note).toBe('daqui');
    const queue = await keys(db);
    expect(queue).toEqual([`sessions/${s.id}`, 'solves/conta-a'].sort());
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 0, sessions: 0 });
    expect([(await db.get('solves', 'conta-a'))?.deletedAt, (await db.get('solves', 'conta-b'))?.deletedAt]).toEqual([null, null]);
    expect(await keys(db)).toEqual(queue);
  });

  it('o registro daqui que o servidor recusaria não é da conta: não tira da fila o gêmeo válido nem a "Sessão 1"', async () => {
    const { db, repo } = await fresh(null);
    const empty = await repo.createSession({ event: '333' }); // "Sessão 1", vazia
    const other = await repo.createSession({ event: '333', name: 'Treino' });
    const v = await repo.addSolve(ns(other.id, 9000, t - 99));
    // Gravados por outro caminho (de antes da v3, tortos): ficam fora da fila no primeiro login, e não são da conta.
    await db.put('solves', { ...(await db.get('solves', v.id))!, id: 'com espaço' });
    await db.put('sessions', { ...(await db.get('sessions', other.id))!, id: 'torta', name: 'Velha', updatedAt: 1.5 });
    expect(await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).toBe(2);
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 0, sessions: 0 });
    expect((await db.get('solves', v.id))?.deletedAt).toBeNull();
    expect((await db.get('sessions', empty.id))?.deletedAt).toBeNull();
    expect(await keys(db)).toEqual([`sessions/${empty.id}`, `sessions/${other.id}`, `solves/${v.id}`].sort());
  });

  it('o gêmeo da conta que está na lixeira dela não leva o solve daqui', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333', name: 'Daqui' });
    const v = await repo.addSolve(ns(s.id, 9000, t - 99));
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    await repo.applyRemote([remoteSession('conta-s'), remoteSolve('conta-x', 'conta-s', { ms: 9000, at: t - 99, deletedAt: t, deletionStamp: t })], t);
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 0, sessions: 0 });
    expect((await db.get('solves', v.id))?.deletedAt).toBeNull();
    expect(await keys(db)).toContain(`solves/${v.id}`);
  });

  it('uma "Sessão 1" com solve na lixeira que vai subir não está vazia: fica', async () => {
    const { db, repo } = await fresh(null);
    const local = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(local.id, 4321));
    await repo.deleteSolve(x.id);
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    await repo.applyRemote([remoteSession('conta-s')], t);
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 0, sessions: 0 });
    expect((await db.get('sessions', local.id))?.deletedAt).toBeNull();
  });

  it('a sessão padrão (`default-<evento>`) nunca sai: o id é o mesmo em todo aparelho, e o sync a junta (pré-voo C1)', async () => {
    const server = new FakeServer();
    server.now = t;
    // O aparelho da conta: a sessão padrão (vazia) e outra do 3x3, com um solve.
    const a = await fresh();
    await a.repo.createSession({ event: '333', id: 'default-333' });
    const treino = await a.repo.createSession({ event: '333', name: 'Treino' });
    await a.repo.addSolve(ns(treino.id, 9000));
    await syncRound(a.repo, server);
    // Um aparelho com dados de antes da conta, com a "Sessão 1" padrão dele, vazia.
    const b = await fresh(null);
    await b.repo.createSession({ event: '333', id: 'default-333' });
    const daqui = await b.repo.createSession({ event: '333', name: 'Do B' });
    await b.repo.addSolve(ns(daqui.id, 12_000, t - 10));
    expect(await b.repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).toBe(0);
    await syncRound(b.repo, server, false); // a conta inteira chega antes de subir qualquer coisa
    expect(await b.repo.dedupeFirstLogin()).toEqual({ solves: 0, sessions: 0 });
    await syncRound(b.repo, server);
    await syncRound(a.repo, server);
    const seen = async (repo: Repository) => ({ sessions: await repo.listSessions(), solves: await repo.listSolves() });
    expect(await seen(b.repo)).toEqual(await seen(a.repo));
    expect((await a.repo.listSessions()).map((s) => s.id).sort()).toEqual(['default-333', treino.id, daqui.id].sort()); // as ativas
    expect(server.active().has('sessions/default-333')).toBe(true);
    expect(await b.repo.outboxCount()).toBe(0);
  });

  it('o começo do primeiro login grava o estado da conta e põe tudo na fila na mesma transação: ou os dois, ou nenhum', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.addSolve(ns(s.id, 2000));
    await repo.saveSyncState({ cursor: 7 });
    // O app morre no meio (aqui, a cota acaba na segunda entrada da fila): nem a fila nem o estado ficam pela metade.
    const real = IDBObjectStore.prototype.put;
    let puts = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'outbox' && ++puts === 2) throw new DOMException('sem espaço', 'QuotaExceededError');
      return real.apply(this, args);
    });
    try {
      await expect(repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).rejects.toThrow('sem espaço');
    } finally {
      spy.mockRestore();
    }
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, email: null, signedIn: false, firstSync: false, cursor: 7 });
    expect(await keys(db)).toEqual([]);
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    expect(await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).toBe(0);
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-1', email: 'a@b.c', signedIn: true, firstSync: true, cursor: 0, lastSyncAt: null });
    expect(await keys(db)).toHaveLength(3);
    expect(heard).toEqual(['sync']);
  });

  it('o começo do primeiro login não se repete para a mesma conta: o cursor e a fila ficam; outra conta começa de novo', async () => {
    const server = new FakeServer();
    server.now = t;
    const a = await fresh();
    const sa = await a.repo.createSession({ event: '333', name: 'Da conta' });
    await a.repo.addSolve(ns(sa.id, 9000));
    await syncRound(a.repo, server);
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333', name: 'Daqui' });
    await repo.addSolve(ns(s.id, 7000));
    await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' });
    await syncRound(repo, server, false);
    await repo.dedupeFirstLogin();
    await syncRound(repo, server);
    const state = await repo.getSyncState();
    expect(state.cursor).toBeGreaterThan(0);
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    expect(await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).toBe(0);
    expect(await repo.getSyncState()).toEqual(state);
    expect(await keys(db)).toEqual([]); // o que veio da conta não volta para a fila como se fosse daqui
    expect(heard).toEqual([]);
    expect(await repo.beginFirstSync({ accountId: 'conta-2', email: 'b@c.d' })).toBe(0);
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-2', email: 'b@c.d', firstSync: true, cursor: 0 });
    expect(await keys(db)).toHaveLength(4); // as duas sessões e os dois solves
  });

  it('o que o servidor recusaria fica fora da fila no primeiro login, contado e no log local', async () => {
    const { db, repo, lines } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    const ok = await repo.addSolve(ns(s.id, 1000));
    await db.put('solves', { ...(await db.get('solves', ok.id))!, id: 'com espaço' });
    await db.put('outbox', { store: 'solves', id: 'com espaço', queuedAt: 0 }, 'solves/com espaço'); // entrou antes, por outro caminho
    expect(await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).toBe(1);
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${ok.id}`].sort());
    expect(lines).toEqual(['sync: fora da fila, o servidor recusaria solves/com espaço (id inválido)']);
  });
});

describe('apagar os dados deste aparelho (spec 7.6 e 7.7)', () => {
  it('recusa enquanto há mudanças esperando para subir (decisão 12), e nada sai', async () => {
    const { repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.saveBackup({ id: 'b', createdAt: t, reason: 'manual', solveCount: 1, encoding: 'json', payload: '{}' });
    await expect(repo.wipeData()).rejects.toBeInstanceOf(PendingChangesError);
    expect(await repo.listSolves()).toHaveLength(1);
    expect(await repo.listBackups()).toHaveLength(1);
    expect(await repo.outboxCount()).toBe(2);
    expect((await repo.getSyncState()).accountId).toBe('conta-1');
  });

  it('limpa dados, fila e cópias; ficam os ajustes do aparelho e o relógio', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ settings: { theme: 'dark' }, trail: [true, false, false, false, false, false, false, false, false], currentSessionId: s.id });
    await repo.saveBackup({ id: 'b', createdAt: t, reason: 'manual', solveCount: 1, encoding: 'json', payload: '{}' });
    await repo.confirmSent((await repo.outboxBatch(SYNC_BATCH)).sent); // tudo já está na conta
    const clock = (await repo.getSyncState()).clock;
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    await repo.wipeData();
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([]);
    expect(await repo.listSessions({ includeDeleted: true })).toEqual([]);
    expect(await repo.listBackups()).toEqual([]);
    expect(await db.getAllKeys('outbox')).toEqual([]);
    const p = await repo.getProfile();
    expect([p.settings.theme, p.trail[0], p.currentSessionId]).toEqual(['dark', false, null]);
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, signedIn: false, cursor: 0, clock });
    expect(heard).toEqual(['all', 'sync']);
  });
});
