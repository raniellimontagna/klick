import type { IDBPDatabase } from 'idb';
import { describe, expect, it } from 'vitest';
import { prefToChange, toChange, type RecordStore } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import type { Change } from '../../src/core/sync/types';
import { openKlickDb, type KlickDB } from '../../src/data/db';
import { createRepository, LocalOnlyError, type ChangeKind, type ChannelLike, type Repository } from '../../src/data/repository';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const DAY = 86_400_000;
const ns = (sessionId: string, ms: number) => ({ sessionId, event: '333' as const, ms, penalty: null, at: t, scramble: "R U R'" });

async function fresh(account: string | null = 'conta-1'): Promise<{ db: IDBPDatabase<KlickDB>; repo: Repository }> {
  const db = await openKlickDb(`outbox-${++n}`);
  const repo = createRepository(db, { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, signedIn: true });
  return { db, repo };
}
const keys = async (db: IDBPDatabase<KlickDB>): Promise<string[]> => ((await db.getAllKeys('outbox')) as string[]).sort();

// O registro atual de cada entrada da fila, como o motor vai mandar (spec 6.1).
async function pendingChanges(db: IDBPDatabase<KlickDB>): Promise<Change[]> {
  const out: Change[] = [];
  for (const e of await db.getAll('outbox')) {
    if (e.store === 'prefs') out.push(prefToChange((await db.get('prefs', e.id))!));
    else out.push(toChange(e.store as RecordStore, (await db.get(e.store, e.id))!));
  }
  return out;
}

describe('fila de saída (spec 5.3)', () => {
  it('sem conta, nenhuma gravação entra na fila', async () => {
    const { db, repo } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    expect(await keys(db)).toEqual([]);
  });

  it('com conta, cada registro gravado entra uma vez, na mesma transação, com a data da gravação', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.updateSolve(a.id, { note: 'um' });
    await repo.updateSolve(a.id, { note: 'dois' }); // várias edições do mesmo registro viram uma entrada só
    const p = await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.updatePractice(p.id, { ok: false });
    await repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false], settings: { theme: 'dark' } });
    expect(await keys(db)).toEqual([`practice/p1`, 'prefs/trail.0', `sessions/${s.id}`, `solves/${a.id}`]);
    const solveEntry = await db.get('outbox', `solves/${a.id}`);
    expect(solveEntry).toEqual({ store: 'solves', id: a.id, queuedAt: (await db.get('solves', a.id))!.updatedAt });
  });

  it('uma importação entra na fila toda com a mesma data, a da gravação, mesmo com o relógio ainda em zero', async () => {
    const donor = await fresh(null);
    const s = await donor.repo.createSession({ event: '333' });
    await donor.repo.addSolve(ns(s.id, 1000));
    await donor.repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await donor.repo.saveProfile({ trail: [true, false, false, false, false, false, false, false, false] });
    const file = await donor.repo.exportAll();

    const { db, repo } = await fresh();
    expect((await repo.getSyncState()).clock).toBe(0);
    t += 5000;
    await repo.importAll(file);
    const entries = await db.getAll('outbox');
    expect(entries.map((e) => `${e.store}/${e.id}`).sort()).toEqual(['practice/p1', 'prefs/trail.0', `sessions/${s.id}`, `solves/${file.solves[0].id}`]);
    // Todas na mesma data: a do relógio nesta gravação (a mesma que a pref ganhou), e não a de antes, que era zero.
    const stamp = (await db.get('prefs', 'trail.0'))!.updatedAt;
    expect(stamp).toBeGreaterThan(0);
    expect(entries.map((e) => e.queuedAt)).toEqual(entries.map(() => stamp));
    expect((await repo.getSyncState()).clock).toBe(stamp);
  });

  it('a fila sai na ordem em que foi enchida (índice byQueued)', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    t += 1000;
    const a = await repo.addSolve(ns(s.id, 1000));
    t += 1000;
    const b = await repo.addSolve(ns(s.id, 2000));
    const order = (await db.getAllFromIndex('outbox', 'byQueued')).map((e) => `${e.store}/${e.id}`);
    expect(order).toEqual([`sessions/${s.id}`, `solves/${a.id}`, `solves/${b.id}`]);
  });

  it('excluir a sessão põe na fila a sessão e os solves que saíram junto; restaurar também', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    await db.clear('outbox');
    await repo.deleteSession(s.id);
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${a.id}`, `solves/${b.id}`].sort());
    await db.clear('outbox');
    await repo.restoreSession(s.id);
    expect(await keys(db)).toEqual([`sessions/${s.id}`, `solves/${a.id}`, `solves/${b.id}`].sort());
  });

  it('apagar uma tentativa do treino vira marca de exclusão, fora da lista e do export, e entra na fila', async () => {
    const { db, repo } = await fresh();
    const p = await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.deletePractice(p.id);
    expect(await repo.listPractice()).toEqual([]);
    expect((await repo.exportAll()).practice).toEqual([]);
    expect(await db.get('practice', 'p1')).toMatchObject({ deletedAt: expect.any(Number), deletionStamp: expect.any(Number) });
    expect(await keys(db)).toEqual(['practice/p1']);
    await expect(repo.updatePractice('p1', { ok: false })).rejects.toThrow('p1');
  });

  it('toda mudança que o app põe na fila tem a forma que o servidor aceita (spec 6.6)', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333oh', name: 'Uma mão' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    await repo.updateSolve(a.id, { penalty: 'DNF', note: 'escorregou' });
    await repo.deleteSolve(b.id);
    await repo.renameSession(s.id, 'Só a direita');
    await repo.addPractice({ id: 'p1', caseId: 'f2l-03', ms: 3000, ok: false, helped: true, at: t });
    await repo.deletePractice('p1');
    await repo.saveProfile({
      trail: [true, true, false, false, false, false, false, false, false], finish: 'fosco', onboarded: true, lessonAt: { 4: 2 },
      algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-t'], settings: { inspection: false, dailyGoal: 40 },
    });
    await repo.saveProfile({ lessonAt: {} });
    const changes = await pendingChanges(db);
    expect(changes.length).toBeGreaterThan(8);
    for (const c of changes) expect(checkChange(c), `${c.store}/${c.id}`).toEqual({ ok: true, change: c });
  });

  it('o estado do sync: padrão antes de entrar; salvar avisa "sync"; o relógio nunca desce', async () => {
    const { repo } = await fresh(null);
    expect(await repo.getSyncState()).toEqual({
      accountId: null, email: null, signedIn: false, firstSync: false, firstSyncDefaults: [], cursor: 0, lastSyncAt: null, clock: 0, passkey: false,
      refusedBuild: null, pushAfter: null, copiesPaused: null,
    });
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    await repo.saveSyncState({ accountId: 'u', email: 'a@b.c', clock: 500 });
    await repo.saveSyncState({ clock: 100, cursor: 7 });
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'u', email: 'a@b.c', clock: 500, cursor: 7 });
    expect(heard).toEqual(['sync', 'sync']);
  });

  it('um relógio que não é inteiro seguro >= 0 é ignorado, e o relógio gravado continua valendo para as datas', async () => {
    const { db, repo } = await fresh();
    await repo.saveSyncState({ clock: 500 });
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -1, 1.5, Number.MAX_SAFE_INTEGER + 2]) {
      const state = await repo.saveSyncState({ clock: bad, cursor: 3 });
      expect(state.clock, String(bad)).toBe(500);
      expect(state.cursor).toBe(3); // o resto do patch vale
    }
    expect((await repo.getSyncState()).clock).toBe(500);
    await repo.createSession({ event: '333' });
    const [session] = await db.getAll('sessions');
    expect(Number.isSafeInteger(session.updatedAt)).toBe(true);
    expect((await repo.getSyncState()).clock).toBe(session.updatedAt);
    const empty = await fresh(null);
    expect((await empty.repo.saveSyncState({ clock: Number.NaN })).clock).toBe(0);
    expect((await empty.repo.saveSyncState({ clock: 0 })).clock).toBe(0);
    expect((await empty.repo.saveSyncState({ clock: 7 })).clock).toBe(7);
  });

  it('o aviso "sync" chega à outra aba, e uma chave ausente no patch não apaga o que está gravado', async () => {
    const members: ChannelLike[] = [];
    const make = (): ChannelLike => {
      const ch: ChannelLike = {
        onmessage: null,
        postMessage(data) {
          for (const m of members) if (m !== ch) m.onmessage?.({ data });
        },
      };
      members.push(ch);
      return ch;
    };
    const name = `outbox-${++n}`;
    const tabA = createRepository(await openKlickDb(name), { now, channel: make() });
    const tabB = createRepository(await openKlickDb(name), { now, channel: make() });
    const heard: string[] = [];
    tabB.onChange((k, origin) => heard.push(`${k}:${origin}`));
    await tabA.saveSyncState({ accountId: 'u', email: 'a@b.c' });
    await tabA.saveSyncState({ email: undefined, cursor: 3 }); // undefined não apaga
    expect(heard).toEqual(['sync:remote', 'sync:remote']);
    expect(await tabB.getSyncState()).toMatchObject({ accountId: 'u', email: 'a@b.c', cursor: 3 });
  });
});

describe('lixeira com sync (spec 5.5)', () => {
  it('só some de vez, depois dos 30 dias, o que não espera na fila', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    await repo.deleteSolve(a.id);
    await repo.deleteSolve(b.id);
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.deletePractice('p1');
    await db.delete('outbox', `solves/${a.id}`); // o servidor confirmou a exclusão de a; a de b ainda espera
    await db.delete('outbox', 'practice/p1');
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(1);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([b.id]);
    expect(await db.get('practice', 'p1')).toBeUndefined();
  });

  it('a marca de exclusão do treino que ainda espera na fila fica; sem contar, some depois; o treino vivo nunca sai', async () => {
    const { db, repo } = await fresh();
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.addPractice({ id: 'p2', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: t });
    await repo.deletePractice('p1');
    await db.clear('outbox'); // p2 já subiu; a exclusão de p1 não
    await db.put('outbox', { store: 'practice', id: 'p1', queuedAt: t }, 'practice/p1');
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect(await db.get('practice', 'p1')).toMatchObject({ deletedAt: expect.any(Number) }); // espera o servidor
    expect(await db.get('practice', 'p2')).toMatchObject({ deletedAt: null });
    await db.delete('outbox', 'practice/p1'); // o servidor confirmou
    expect(await repo.purgeTrash(30 * DAY)).toBe(0); // as marcas do treino saem sem entrar na conta
    expect(await db.get('practice', 'p1')).toBeUndefined();
    expect(await db.get('practice', 'p2')).toBeDefined();
  });

  it('a marca de exclusão do treino mais nova que 30 dias fica, mesmo fora da fila', async () => {
    const { db, repo } = await fresh();
    await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2000, ok: true, helped: false, at: t });
    await repo.deletePractice('p1');
    await db.clear('outbox');
    t += 29 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect(await db.get('practice', 'p1')).toMatchObject({ deletedAt: expect.any(Number) });
  });

  it('a sessão excluída que espera na fila fica, com os solves que saíram junto', async () => {
    const { repo, db } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.deleteSession(s.id); // a sessão e o solve entram na fila
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect(await db.get('sessions', s.id)).toBeDefined();
    expect(await db.get('solves', a.id)).toBeDefined();
  });

  it('a sessão confirmada e vencida fica até o último solve dela sair; os dois saem quando o solve é confirmado', async () => {
    const { repo, db } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.deleteSession(s.id);
    await db.delete('outbox', `sessions/${s.id}`); // a sessão subiu primeiro; o solve dela ainda espera (um lote a menos, uma rodada que falhou)
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect(await db.get('sessions', s.id)).toBeDefined();
    expect(await db.get('solves', a.id)).toBeDefined();
    await db.delete('outbox', `solves/${a.id}`); // o servidor confirmou o solve
    expect(await repo.purgeTrash(30 * DAY)).toBe(2);
    expect(await db.get('sessions', s.id)).toBeUndefined();
    expect(await db.get('solves', a.id)).toBeUndefined();
  });

  it('restaurar o solve que a sessão vencida poupou devolve a sessão (solve ativo => sessão ativa)', async () => {
    const { repo, db } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.deleteSession(s.id);
    await db.delete('outbox', `sessions/${s.id}`);
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    await repo.restoreSolve(a.id);
    expect((await repo.listSessions()).map((x) => x.id)).toEqual([s.id]);
    expect((await repo.listSolves({ sessionId: s.id })).map((x) => x.id)).toEqual([a.id]);
    expect(await repo.listTrash()).toEqual({ sessions: [], solves: [] });
  });

  it('a sessão vencida fica enquanto um solve dela ainda não venceu, ou está ativo, mesmo fora da fila', async () => {
    const { repo, db } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const young = await repo.addSolve(ns(s.id, 1000));
    const live = await repo.addSolve(ns(s.id, 2000));
    await repo.deleteSession(s.id);
    await db.clear('outbox');
    t += 31 * DAY;
    // Um solve excluído há um dia (mais novo que a sessão) e um ativo (dado fora do invariante): nenhum dos dois pode ficar sem sessão.
    await db.put('solves', { ...(await db.get('solves', young.id))!, deletedAt: t - DAY });
    await db.put('solves', { ...(await db.get('solves', live.id))!, deletedAt: null });
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect(await db.get('sessions', s.id)).toBeDefined();
    await db.put('solves', { ...(await db.get('solves', live.id))!, deletedAt: t - 40 * DAY });
    t += 30 * DAY; // o excluído há um dia também vence
    expect(await repo.purgeTrash(30 * DAY)).toBe(3);
    expect(await db.get('sessions', s.id)).toBeUndefined();
    expect(await db.getAllKeys('solves')).toEqual([]);
  });

  it('sem conta, a lixeira esvazia como antes', async () => {
    const { repo } = await fresh(null);
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    await repo.deleteSolve(a.id);
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(1);
  });
});

describe('só neste aparelho: os recusados pela cota (endurecimento, decisão 4)', () => {
  // Uma sessão com três solves, e a fila inteira num lote, como o motor a manda.
  async function sent() {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000));
    const b = await repo.addSolve(ns(s.id, 2000));
    const c = await repo.addSolve(ns(s.id, 3000));
    const batch = await repo.outboxBatch(500);
    const only = (...ids: string[]) => batch.sent.filter((e) => ids.includes(e.id)); // as entradas que a conta recusou pela cota
    return { db, repo, s, a, b, c, batch, only };
  }

  it('confirmSent guarda os recusados pela cota fora da fila e avisa sync', async () => {
    const { db, repo, a, b, c, batch, only } = await sent();
    const heard: ChangeKind[] = [];
    repo.onChange((k) => {
      if (k === 'sync') heard.push(k);
    });
    await repo.confirmSent(batch.sent, only(c.id));
    expect(await keys(db)).toEqual([]);
    expect(await repo.heldCount()).toBe(1);
    expect(await db.get('meta', 'held')).toEqual([`solves/${c.id}`]);
    expect(heard).toEqual(['sync']);
    expect(await db.get('solves', c.id)).toMatchObject({ deletedAt: null }); // nada some do aparelho
    // Sem nenhum guardado e sem mexer na lista, nada é avisado.
    t += 10;
    await repo.updateSolve(a.id, { note: 'um' });
    await repo.confirmSent((await repo.outboxBatch(500)).sent);
    expect(heard).toEqual(['sync']);
    // Mais um recusado entra na lista; um guardado que a conta aceitou (editado aqui, subiu de novo) sai dela.
    t += 10;
    await repo.updateSolve(b.id, { note: 'dois' });
    await repo.updateSolve(c.id, { note: 'três' });
    const again = await repo.outboxBatch(500);
    await repo.confirmSent(again.sent, again.sent.filter((e) => e.id === b.id));
    expect(await db.get('meta', 'held')).toEqual([`solves/${b.id}`]);
    expect(heard).toEqual(['sync', 'sync']);
  });

  it('um recusado gravado de novo durante o pedido fica na fila', async () => {
    const { db, repo, c, batch, only } = await sent();
    t += 10;
    await repo.updateSolve(c.id, { note: 'durante o pedido' });
    await repo.confirmSent(batch.sent, only(c.id));
    expect(await keys(db)).toEqual([`solves/${c.id}`]); // o que subiu já é velho: a versão nova sobe no próximo lote
    expect(await repo.heldCount()).toBe(0);
  });

  it('localOnlyCount soma os guardados, e apagar os dados recusa', async () => {
    const { db, repo, s, c, batch, only } = await sent();
    expect(await repo.localOnlyCount()).toBe(0);
    await repo.confirmSent(batch.sent, only(c.id, s.id));
    expect(await keys(db)).toEqual([]);
    expect(await repo.localOnlyCount()).toBe(2);
    const refused = await repo.wipeData().catch((err: unknown) => err);
    expect(refused).toBeInstanceOf(LocalOnlyError);
    expect((refused as LocalOnlyError).count).toBe(2);
    expect(await repo.listSolves()).toHaveLength(3); // nada foi apagado
    expect(await repo.heldCount()).toBe(2);
  });

  it('requeueHeld põe de volta na fila só o que existe e esvazia a lista', async () => {
    const { db, repo, s, c, batch, only } = await sent();
    await repo.confirmSent(batch.sent, only(c.id, s.id));
    await db.put('meta', [...((await db.get('meta', 'held')) as string[]), 'solves/sumiu'], 'held'); // uma chave sem registro
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    t += 10;
    expect(await repo.requeueHeld()).toBe(2);
    // A sessão vem antes dos solves dela (a mesma data na fila): ela sobe primeiro.
    expect((await db.getAllFromIndex('outbox', 'byQueued')).map((e) => `${e.store}/${e.id}`)).toEqual([`sessions/${s.id}`, `solves/${c.id}`]);
    expect(await repo.heldCount()).toBe(0);
    expect(await db.get('meta', 'held')).toBeUndefined();
    expect(heard).toEqual(['sync']);
    expect(await repo.requeueHeld()).toBe(0); // a lista vazia: nada muda
  });

  it('beginFirstSync e forgetAccount esvaziam a lista', async () => {
    const { db, repo, c, batch, only } = await sent();
    await repo.confirmSent(batch.sent, only(c.id));
    await repo.saveSyncState({ pushAfter: t + 1000, copiesPaused: 'space' });
    // A mesma conta: o primeiro login dela já começou, e nada muda.
    expect(await repo.beginFirstSync({ accountId: 'conta-1', email: 'a@b.c' })).toBe(0);
    expect(await repo.heldCount()).toBe(1);
    // Outra conta: tudo daqui entra na fila (o guardado também, e a conta nova decide), a lista e o que era da conta de antes saem.
    await repo.beginFirstSync({ accountId: 'conta-2', email: 'a@b.c' });
    expect(await repo.heldCount()).toBe(0);
    expect(await keys(db)).toContain(`solves/${c.id}`);
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-2', pushAfter: null, copiesPaused: null });
    await repo.confirmSent((await repo.outboxBatch(500)).sent, [{ store: 'solves', id: c.id, queuedAt: (await db.get('outbox', `solves/${c.id}`))!.queuedAt }]);
    expect(await repo.heldCount()).toBe(1);
    await repo.forgetAccount();
    expect(await repo.heldCount()).toBe(0);
    expect(await db.get('solves', c.id)).toMatchObject({ deletedAt: null });
  });

  // Decisão (a) do controlador: a mesma resposta pode trazer a chave recusada pela cota e uma escrita dela (apagada pela cascata do servidor).
  it('um lote do servidor com uma chave guardada junta pela regra de sempre; apagada nos dois lados, sai da lista', async () => {
    const { db, repo, b, c, batch, only } = await sent();
    await repo.confirmSent(batch.sent, only(b.id, c.id));
    const bChange = toChange('solves', (await db.get('solves', b.id))!);
    const cChange = toChange('solves', (await db.get('solves', c.id))!);
    t += 100;
    const deleted = { ...bChange, deletedAt: t, deletionStamp: t }; // a cascata: só a exclusão muda
    const older = { ...cChange, data: { ...(cChange.data as object), note: 'velha' }, updatedAt: cChange.updatedAt - 5 }; // uma versão velha
    await repo.applyRemote([deleted, older], t);
    expect(await db.get('solves', b.id)).toMatchObject({ deletedAt: t }); // juntada, não pulada
    expect(await db.get('solves', c.id)).toMatchObject({ deletedAt: null, note: '' }); // a daqui é mais nova e vence
    expect(await db.get('meta', 'held')).toEqual([`solves/${c.id}`]);
  });

  // Decisão (d): a exclusão recusada no teto de bytes fica guardada; a edição que chega de outro aparelho não a tira da lista, senão a exclusão
  // nunca chegaria à conta.
  it('a exclusão guardada junta a edição de outro aparelho e continua na lista', async () => {
    const { db, repo, c } = await sent();
    await repo.confirmSent((await repo.outboxBatch(500)).sent);
    const before = toChange('solves', (await db.get('solves', c.id))!); // como a conta o tem: ativo
    t += 10;
    await repo.deleteSolve(c.id);
    const batch = await repo.outboxBatch(500);
    await repo.confirmSent(batch.sent, batch.sent);
    t += 10;
    const edited = { ...before, data: { ...(before.data as object), note: 'de lá' }, updatedAt: t };
    await repo.applyRemote([edited], t);
    expect(await db.get('solves', c.id)).toMatchObject({ note: 'de lá', deletedAt: expect.any(Number) });
    expect(await repo.heldCount()).toBe(1);
  });

  it('a lixeira não apaga de vez a exclusão que só está neste aparelho', async () => {
    const { db, repo, c } = await sent();
    await repo.confirmSent((await repo.outboxBatch(500)).sent);
    await repo.deleteSolve(c.id);
    const batch = await repo.outboxBatch(500);
    await repo.confirmSent(batch.sent, batch.sent);
    t += 31 * DAY;
    expect(await repo.purgeTrash(30 * DAY)).toBe(0);
    expect(await db.get('solves', c.id)).toMatchObject({ deletedAt: expect.any(Number) });
  });

  // Decisão (b): um solve gravado depois numa sessão guardada não sobe sem ela (ficaria órfão nos outros aparelhos): vai para a lista junto.
  it('um solve gravado numa sessão guardada vai para a lista com ela; com a sessão antes no lote, sobe com ela', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const first = await repo.outboxBatch(500);
    await repo.confirmSent(first.sent, first.sent);
    t += 10;
    const x = await repo.addSolve(ns(s.id, 1000));
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    const batch = await repo.outboxBatch(500);
    expect(batch).toMatchObject({ changes: [], sent: [], held: 1 });
    expect(await keys(db)).toEqual([]);
    expect(await db.get('meta', 'held')).toEqual([`sessions/${s.id}`, `solves/${x.id}`]);
    expect(heard).toEqual(['sync']);
    // Enviar de novo: a sessão vem antes no lote, e o solve sobe com ela.
    t += 10;
    await repo.requeueHeld();
    const again = await repo.outboxBatch(500);
    expect(again.changes.map((c) => `${c.store}/${c.id}`)).toEqual([`sessions/${s.id}`, `solves/${x.id}`]);
    expect(again.held).toBe(0);
  });
});
