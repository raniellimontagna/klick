import type { IDBPDatabase } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { seasonOne } from '../../src/core/season';
import { toChange } from '../../src/core/sync/records';
import { SYNC_BATCH, SYNC_PROTOCOL, syncKey, type Change } from '../../src/core/sync/types';
import type { SeasonProgress } from '../../src/core/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, PendingChangesError, type ChangeKind, type ChangeOrigin, type Repository } from '../../src/data/repository';
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
    const req = { v: SYNC_PROTOCOL, deviceId: 'teste', cursor: state.cursor, clock: state.clock, changes: batch.changes };
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
    expect(batch.refused).toBe(1);
    expect(lines).toEqual(['sync: fora da fila, o servidor recusaria solves/torto (datas inválidas)']);
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
});

describe('primeiro login num aparelho com dados (spec 6.5)', () => {
  it('o solve daqui igual a um da conta, com outro id, e a "Sessão 1" vazia de um evento que a conta tem, saem sem subir', async () => {
    const { db, repo } = await fresh();
    const local = await repo.createSession({ event: '333' }); // "Sessão 1", deste aparelho
    const extra = await repo.createSession({ event: '333', name: 'Treino daqui' });
    const twin = await repo.addSolve(ns(extra.id, 9000, t - 99)); // o mesmo csTimer importado antes, com id diferente
    const own = await repo.addSolve(ns(extra.id, 12_000, t - 50));
    await repo.enqueueAll();
    expect((await db.getAllKeys('outbox')).length).toBe(4);
    // A conta inteira chega (pull) antes de subir qualquer coisa.
    await repo.applyRemote([remoteSession('conta-s'), remoteSolve('conta-x', 'conta-s', { ms: 9000, at: t - 99 })], t);
    expect(await repo.dedupeFirstLogin()).toEqual({ solves: 1, sessions: 1 });
    expect((await db.get('solves', twin.id))?.deletedAt).not.toBeNull();
    expect((await db.get('sessions', local.id))?.deletedAt).not.toBeNull();
    expect(((await db.getAllKeys('outbox')) as string[]).sort()).toEqual([`sessions/${extra.id}`, `solves/${own.id}`].sort());
    expect((await repo.listSolves()).map((s) => s.id).sort()).toEqual(['conta-x', own.id].sort());
  });

  it('uma "Sessão 1" com solve na lixeira que vai subir não está vazia: fica', async () => {
    const { db, repo } = await fresh();
    const local = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(local.id, 4321));
    await repo.deleteSolve(x.id);
    await repo.enqueueAll();
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
    await b.repo.saveSyncState({ accountId: 'conta-1', signedIn: true });
    expect(await b.repo.enqueueAll()).toBe(0);
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

  it('o que o servidor recusaria fica fora da fila no primeiro login, contado e no log local', async () => {
    const { db, repo, lines } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    const ok = await repo.addSolve(ns(s.id, 1000));
    await db.put('solves', { ...(await db.get('solves', ok.id))!, id: 'com espaço' });
    await repo.saveSyncState({ accountId: 'conta-1', signedIn: true });
    await db.put('outbox', { store: 'solves', id: 'com espaço', queuedAt: 0 }, 'solves/com espaço'); // entrou antes, por outro caminho
    expect(await repo.enqueueAll()).toBe(1);
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
