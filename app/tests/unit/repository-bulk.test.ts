// O lote do histórico (plano do histórico inteiro, Task 2): mover, excluir, restaurar e juntar, cada um numa transação, com a fila do
// sync na ordem certa. Mover e juntar só entre sessões do mesmo evento: o sync não recusaria outro evento, o repositório recusa.
import type { IDBPDatabase } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, type ChangeKind, type Repository } from '../../src/data/repository';
import { createSyncEngine } from '../../src/sync/engine';
import { FakeServer } from './sync-fakes';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number, event: '333' | '222' = '333') => ({ sessionId, event, ms, penalty: null, at: t + ms, scramble: "R U R'" });

async function fresh(account: string | null = 'conta-1'): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`bulk-${++n}`);
  const repo = createRepository(db, { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, email: 'a@b.c', signedIn: true });
  return { db, repo };
}
const keys = async (db: IDBPDatabase<KlickDB>): Promise<string[]> => ((await db.getAllKeys('outbox')) as string[]).sort();
// Todos os registros de solves e sessões, como estão gravados (para ver que nada mudou).
const snapshot = async (db: IDBPDatabase<KlickDB>) => ({ solves: await db.getAll('solves'), sessions: await db.getAll('sessions') });
// Os avisos que o repositório deu, com os ids dos solves.
function heard(repo: Repository): string[] {
  const out: string[] = [];
  repo.onChange((kind: ChangeKind, _origin, ids) => out.push(ids ? `${kind}:${[...ids].sort().join(',')}` : kind));
  return out;
}

describe('lote no repositório', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  it('mover leva os solves para outra sessão do mesmo evento, com uma data só', async () => {
    const { db, repo } = await fresh();
    const a = await repo.createSession({ event: '333', name: 'A' });
    const b = await repo.createSession({ event: '333', name: 'B' });
    const a1 = await repo.addSolve(ns(a.id, 1000));
    const a2 = await repo.addSolve(ns(a.id, 2000));
    const a3 = await repo.addSolve(ns(a.id, 3000));
    const b1 = await repo.addSolve(ns(b.id, 4000));
    await repo.deleteSolve(a3.id); // na lixeira: fica de fora
    const before = await snapshot(db);
    await db.clear('outbox');
    const told = heard(repo);
    t += 1000;

    const moved = await repo.moveSolves([a1.id, a2.id, b1.id, a3.id, 'nada', a1.id], b.id);

    expect(moved).toEqual([{ id: a1.id, from: a.id }, { id: a2.id, from: a.id }]); // b1 já estava lá; a3 na lixeira; 'nada' não existe
    const [s1, s2, s3, s4] = await Promise.all([a1, a2, a3, b1].map((s) => db.get('solves', s.id)));
    expect([s1!.sessionId, s2!.sessionId]).toEqual([b.id, b.id]);
    expect(s1!.updatedAt).toBeGreaterThanOrEqual(t);
    expect(s2!.updatedAt).toBe(s1!.updatedAt); // um `at` para o lote inteiro
    const old = (id: string) => before.solves.find((s) => s.id === id)!;
    expect([s1!.deletionStamp, s2!.deletionStamp]).toEqual([old(a1.id).deletionStamp, old(a2.id).deletionStamp]); // a exclusão não muda
    expect([s1!.deletedAt, s2!.deletedAt]).toEqual([null, null]);
    expect(s3).toEqual(old(a3.id));
    expect(s4).toEqual(old(b1.id));
    expect(await keys(db)).toEqual([`solves/${a1.id}`, `solves/${a2.id}`].sort());
    expect(told).toEqual([`solves:${[a1.id, a2.id].sort().join(',')}`]);
    expect((await repo.listSolves({ sessionId: b.id })).map((s) => s.id)).toEqual([a1.id, a2.id, b1.id]);

    // Nada para mover: nada grava nem avisa.
    const clock = (await repo.getSyncState()).clock;
    expect(await repo.moveSolves([a1.id, b1.id], b.id)).toEqual([]);
    expect((await repo.getSyncState()).clock).toBe(clock);
    expect(told).toHaveLength(1);
  });

  // Review Focus 1: o sync aceitaria um solve de 3×3 numa sessão de 2×2 (checkChange só olha se há sessionId); quem recusa é o repositório.
  it('mover para outro evento ou para uma sessão na lixeira recusa sem gravar nada', async () => {
    const { db, repo } = await fresh();
    const a = await repo.createSession({ event: '333', name: 'A' });
    const b = await repo.createSession({ event: '333', name: 'B' });
    const c = await repo.createSession({ event: '222', name: 'C' });
    const a1 = await repo.addSolve(ns(a.id, 1000));
    const c1 = await repo.addSolve(ns(c.id, 2000, '222'));
    const gone = await repo.createSession({ event: '333', name: 'Na lixeira' });
    await repo.deleteSession(gone.id);
    await db.clear('outbox');
    const before = await snapshot(db);
    const clock = (await repo.getSyncState()).clock;
    const told = heard(repo);
    t += 1000;

    await expect(repo.moveSolves([a1.id], c.id)).rejects.toThrow('move-event');
    await expect(repo.moveSolves([a1.id, c1.id], b.id)).rejects.toThrow('move-event'); // um só de outro evento recusa o lote inteiro
    await expect(repo.moveSolves([a1.id], gone.id)).rejects.toThrow('move-session');
    await expect(repo.moveSolves([a1.id], 'nada')).rejects.toThrow('move-session');

    expect(await snapshot(db)).toEqual(before);
    expect(await keys(db)).toEqual([]);
    expect((await repo.getSyncState()).clock).toBe(clock);
    expect(told).toEqual([]);
  });

  it('excluir e restaurar em lote, restaurar revive a sessão', async () => {
    const { db, repo } = await fresh();
    const a = await repo.createSession({ event: '333', name: 'A' });
    const a1 = await repo.addSolve(ns(a.id, 1000));
    const a2 = await repo.addSolve(ns(a.id, 2000));
    const a3 = await repo.addSolve(ns(a.id, 3000));
    await db.clear('outbox');
    const told = heard(repo);
    t += 1000;

    expect(await repo.deleteSolves([a1.id, a2.id, 'nada', a1.id])).toEqual([a1.id, a2.id]);
    const [d1, d2] = await Promise.all([db.get('solves', a1.id), db.get('solves', a2.id)]);
    expect(d1!.deletedAt).not.toBeNull();
    expect([d1!.updatedAt, d1!.deletionStamp, d2!.deletedAt, d2!.updatedAt, d2!.deletionStamp]).toEqual(Array(5).fill(d1!.deletedAt)); // um `at` só
    expect((await repo.listSolves()).map((s) => s.id)).toEqual([a3.id]);
    expect(await keys(db)).toEqual([`solves/${a1.id}`, `solves/${a2.id}`].sort());
    expect(told).toEqual([`solves:${[a1.id, a2.id].sort().join(',')}`]);
    expect(await repo.deleteSolves([a1.id])).toEqual([]); // já na lixeira: nada muda
    expect(told).toHaveLength(1);

    // A sessão vai para a lixeira com o a3 (outra aba). Restaurar o lote devolve os dois e o registro da sessão, e só ele: o a3 fica.
    await repo.deleteSession(a.id);
    await db.clear('outbox');
    told.length = 0;
    t += 1000;
    expect(await repo.restoreSolves([a1.id, a2.id, 'nada'])).toEqual([a1.id, a2.id]);
    const [r1, r2, session] = await Promise.all([db.get('solves', a1.id), db.get('solves', a2.id), db.get('sessions', a.id)]);
    expect([r1!.deletedAt, r2!.deletedAt, session!.deletedAt]).toEqual([null, null, null]);
    expect([r2!.updatedAt, r2!.deletionStamp, session!.updatedAt, session!.deletionStamp]).toEqual(Array(4).fill(r1!.updatedAt));
    expect((await repo.listSolves()).map((s) => s.id)).toEqual([a1.id, a2.id]);
    expect((await repo.listTrash()).solves.map((s) => s.id)).toEqual([a3.id]);
    expect(await keys(db)).toEqual([`sessions/${a.id}`, `solves/${a1.id}`, `solves/${a2.id}`].sort());
    // Na fila, a sessão sobe antes dos solves dela (a mesma data, e a chave a põe na frente).
    expect((await db.getAllFromIndex('outbox', 'byQueued'))[0]).toMatchObject({ store: 'sessions', id: a.id });
    expect(told).toEqual([`solves:${[a1.id, a2.id].sort().join(',')}`, 'sessions']);
    expect(await repo.restoreSolves([a1.id])).toEqual([]); // já ativo
  });

  // Review Focus 2: a exclusão da sessão juntada sobe depois de todas as mudanças de sessão dos solves. Antes deles, a cascata dela (no
  // servidor, ou num aparelho que ainda não viu a mudança) apagaria um solve que ainda está nela.
  it('juntar move os solves, exclui a sessão de origem e a fila põe a exclusão depois das mudanças', async () => {
    const { db, repo } = await fresh();
    const from = await repo.createSession({ event: '333', name: 'Antiga' });
    const to = await repo.createSession({ event: '333', name: 'Principal' });
    const f1 = await repo.addSolve(ns(from.id, 1000));
    const f2 = await repo.addSolve(ns(from.id, 2000));
    const f3 = await repo.addSolve(ns(from.id, 3000));
    const t1 = await repo.addSolve(ns(to.id, 4000));
    await repo.deleteSolve(f3.id); // já na lixeira: fica com a sessão de origem, na lixeira
    const trashed = await db.get('solves', f3.id);
    await repo.confirmSent((await repo.outboxBatch(500)).sent);
    expect(await repo.outboxCount()).toBe(0);
    const told = heard(repo);
    t += 1000;

    expect(await repo.mergeSessions(from.id, to.id)).toBe(2);

    expect((await repo.listSessions()).map((s) => s.id)).toEqual([to.id]);
    expect((await repo.listSolves({ sessionId: to.id })).map((s) => s.id)).toEqual([f1.id, f2.id, t1.id]);
    expect(await db.get('solves', f3.id)).toEqual(trashed);
    const [m1, m2] = await Promise.all([db.get('solves', f1.id), db.get('solves', f2.id)]);
    expect(m2!.updatedAt).toBe(m1!.updatedAt);
    expect((await db.get('sessions', from.id))!.deletedAt).toBeGreaterThanOrEqual(m1!.updatedAt);
    expect(told).toEqual(['sessions', `solves:${[f1.id, f2.id].sort().join(',')}`]);

    // A fila, um por lote, como o motor a manda quando o servidor lê pouco por pedido: os solves antes, a sessão por último.
    const order: string[] = [];
    for (;;) {
      const batch = await repo.outboxBatch(1);
      if (batch.sent.length === 0) break;
      order.push(...batch.sent.map((e) => `${e.store}/${e.id}`));
      await repo.confirmSent(batch.sent);
    }
    expect(order.slice(0, 2).sort()).toEqual([`solves/${f1.id}`, `solves/${f2.id}`].sort());
    expect(order.slice(2)).toEqual([`sessions/${from.id}`]);
  });

  // O mesmo, de ponta a ponta: o servidor lê uma mudança por pedido e o outro aparelho baixa uma por página. Com a exclusão antes, a
  // cascata dela apagaria f1 e f2 lá (no empate da exclusão, excluído vence), e eles sumiriam dos dois aparelhos.
  it('juntar com o sync em pedidos de uma mudança: o servidor e o outro aparelho ficam com os solves na sessão de destino', async () => {
    const server = new FakeServer(1, { perRequest: 1 });
    server.now = t;
    const engine = (repo: Repository) =>
      createSyncEngine({
        repo: () => repo,
        api: { sync: async (req) => structuredClone(server.sync(structuredClone(req))) },
        now,
        backup: async () => undefined,
        onStatus: () => undefined,
        sleep: async () => undefined,
        log: () => undefined,
      });
    const phone = (await fresh()).repo;
    const desktop = (await fresh()).repo;
    const from = await phone.createSession({ event: '333', name: 'Antiga' });
    const to = await phone.createSession({ event: '333', name: 'Principal' });
    const f1 = await phone.addSolve(ns(from.id, 1000));
    const f2 = await phone.addSolve(ns(from.id, 2000));
    await engine(phone).run();
    await engine(desktop).run();
    expect((await desktop.listSolves({ sessionId: from.id })).map((s) => s.id)).toEqual([f1.id, f2.id]);
    t += 10;
    server.now = t;

    await phone.mergeSessions(from.id, to.id);
    expect(await engine(phone).run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(await engine(desktop).run()).toMatchObject({ phase: 'idle', pending: 0 });

    for (const id of [f1.id, f2.id]) {
      const stored = server.records.get(`solves/${id}`)!;
      expect([stored.deletedAt, (stored.data as { sessionId: string }).sessionId]).toEqual([null, to.id]);
    }
    expect(server.records.get(`sessions/${from.id}`)!.deletedAt).not.toBeNull();
    expect((await desktop.listSolves()).map((s) => [s.id, s.sessionId])).toEqual([[f1.id, to.id], [f2.id, to.id]]);
    expect((await desktop.listSessions()).map((s) => s.id)).toEqual([to.id]);
  });

  // Decisão 3: a sessão que a cota guarda (só neste aparelho) não está no servidor, e não há cascata lá. A exclusão dela vai como em
  // deleteSession: na frente, com a mesma data (atrás dos solves, outboxBatch os guardaria de novo).
  it('juntar uma sessão que a cota guarda põe a exclusão dela na frente, como excluir a sessão', async () => {
    const { db, repo } = await fresh();
    const to = await repo.createSession({ event: '333', name: 'Principal' });
    const from = await repo.createSession({ event: '333', name: 'Só aqui' });
    const f1 = await repo.addSolve(ns(from.id, 1000));
    const batch = await repo.outboxBatch(500);
    await repo.confirmSent(batch.sent, batch.sent.filter((e) => e.id === from.id || e.id === f1.id)); // a conta recusou a sessão e o solve
    expect(await repo.heldCount()).toBe(2);
    t += 1000;

    expect(await repo.mergeSessions(from.id, to.id)).toBe(1);

    const order = (await db.getAllFromIndex('outbox', 'byQueued')).map((e) => `${e.store}/${e.id}`);
    expect(order).toEqual([`sessions/${from.id}`, `solves/${f1.id}`]);
  });

  it('juntar sessões de eventos diferentes recusa', async () => {
    const { db, repo } = await fresh();
    const a = await repo.createSession({ event: '333', name: 'A' });
    const b = await repo.createSession({ event: '333', name: 'B' });
    const c = await repo.createSession({ event: '222', name: 'C' });
    const gone = await repo.createSession({ event: '333', name: 'Na lixeira' });
    await repo.addSolve(ns(a.id, 1000));
    await repo.addSolve(ns(c.id, 2000, '222'));
    await repo.deleteSession(gone.id);
    await db.clear('outbox');
    const before = await snapshot(db);
    const told = heard(repo);
    t += 1000;

    await expect(repo.mergeSessions(a.id, c.id)).rejects.toThrow('merge-event');
    await expect(repo.mergeSessions(c.id, a.id)).rejects.toThrow('merge-event');
    await expect(repo.mergeSessions(a.id, gone.id)).rejects.toThrow('merge-session');
    await expect(repo.mergeSessions(gone.id, a.id)).rejects.toThrow('merge-session');
    await expect(repo.mergeSessions(a.id, 'nada')).rejects.toThrow('merge-session');
    await expect(repo.mergeSessions(a.id, a.id)).rejects.toThrow('merge-session'); // juntar com ela mesma a mandaria inteira para a lixeira

    expect(await snapshot(db)).toEqual(before);
    expect(await keys(db)).toEqual([]);
    expect(told).toEqual([]);
    expect((await repo.listSessions()).map((s) => s.id).sort()).toEqual([a.id, b.id, c.id].sort());
  });
});
