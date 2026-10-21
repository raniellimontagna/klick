import { describe, expect, it } from 'vitest';
import type { Goal } from '../../src/core/goals';
import { prefToChange, toChange } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import type { Practice, Profile, Session, Solve } from '../../src/core/types';
import { defaultSettings } from '../../src/core/types';
import { defaultSeason } from '../../src/core/season';
import { DB_VERSION, openKlickDb, type StoredPractice, type StoredSession, type StoredSolve } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { restoreBackup } from '../../src/data/safety';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;

async function fresh() {
  const db = await openKlickDb(`stamps-${++n}`);
  return { db, repo: createRepository(db, { now, channel: null }) };
}

const solveIn = (sessionId: string) => ({ sessionId, event: '333' as const, ms: 30_000, penalty: null, at: t, scramble: 'R U' });

describe('editar não mexe no deletionStamp; apagar e restaurar mexem nele e em updatedAt (spec 6.3, regra 2; decisão 10)', () => {
  it('a nota de um solve apagado muda só updatedAt: o deletionStamp e a marca de exclusão ficam', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(solveIn(s.id));
    t += 1000;
    await repo.deleteSolve(a.id);
    const deleted = (await db.get('solves', a.id))!;
    expect(deleted.deletionStamp).toBe(t);
    expect(deleted.updatedAt).toBe(t);
    t += 1000;
    await repo.updateSolve(a.id, { note: 'boa', penalty: '+2' });
    const edited = (await db.get('solves', a.id))!;
    expect(edited).toMatchObject({ note: 'boa', penalty: '+2', updatedAt: t, deletedAt: deleted.deletedAt, deletionStamp: deleted.deletionStamp });
    t += 1000;
    await repo.restoreSolve(a.id);
    expect(await db.get('solves', a.id)).toMatchObject({ deletedAt: null, updatedAt: t, deletionStamp: t });
  });

  it('renomear uma sessão e corrigir uma tentativa mudam só updatedAt', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const p = await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: t });
    const born = { session: (await db.get('sessions', s.id))!.deletionStamp, practice: (await db.get('practice', 'p1'))!.deletionStamp };
    t += 1000;
    await repo.renameSession(s.id, 'Outra');
    await repo.updatePractice(p.id, { ok: false });
    expect(await db.get('sessions', s.id)).toMatchObject({ name: 'Outra', updatedAt: t, deletionStamp: born.session });
    expect(await db.get('practice', 'p1')).toMatchObject({ ok: false, updatedAt: t + 1, deletionStamp: born.practice });
  });

  it('apagar uma sessão leva a data aos solves dela; restaurar devolve com uma data nova', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(solveIn(s.id));
    t += 1000;
    await repo.deleteSession(s.id);
    expect(await db.get('sessions', s.id)).toMatchObject({ deletedAt: t, updatedAt: t, deletionStamp: t });
    expect(await db.get('solves', a.id)).toMatchObject({ deletedAt: t, updatedAt: t, deletionStamp: t });
    t += 1000;
    await repo.restoreSession(s.id);
    expect(await db.get('sessions', s.id)).toMatchObject({ deletedAt: null, deletionStamp: t });
    expect(await db.get('solves', a.id)).toMatchObject({ deletedAt: null, deletionStamp: t });
  });

  it('importar um solve que já existe: o deletionStamp daqui fica se a exclusão não muda; muda para o updatedAt do arquivo se muda', async () => {
    const { db, repo } = await fresh();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(solveIn(s.id));
    const b = await repo.addSolve(solveIn(s.id));
    const stampA = (await db.get('solves', a.id))!.deletionStamp;
    const file = await repo.exportAll();
    const later = t + 50_000;
    await repo.importAll({
      ...file,
      solves: file.solves.map((x) => (x.id === a.id ? { ...x, note: 'do arquivo', updatedAt: later } : { ...x, deletedAt: later, updatedAt: later })),
    });
    expect(await db.get('solves', a.id)).toMatchObject({ note: 'do arquivo', deletionStamp: stampA });
    expect(await db.get('solves', b.id)).toMatchObject({ deletedAt: later, deletionStamp: later });
  });
});

describe('apagar uma tentativa vira marca de exclusão (spec 5.1)', () => {
  it('some da lista e do export, fica no banco com a data, e importar o arquivo antigo não a traz de volta', async () => {
    const { db, repo } = await fresh();
    const kept = await repo.addPractice({ id: 'p1', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: t });
    await repo.addPractice({ id: 'p2', caseId: 'oll2-sune', ms: 2600, ok: true, helped: false, at: t + 1 });
    const before = await repo.exportAll();
    t += 1000;
    await repo.deletePractice('p2');
    expect(await db.get('practice', 'p2')).toMatchObject({ deletedAt: t, updatedAt: t, deletionStamp: t });
    expect(await repo.listPractice()).toEqual([kept]);
    expect((await repo.exportAll()).practice).toEqual([kept]);
    await repo.importAll(before);
    expect(await repo.listPractice()).toEqual([kept]);
    await expect(repo.updatePractice('p2', { ok: false })).rejects.toThrow('p2');
  });
});

describe('as datas que a migração grava são inteiros seguros >= 0 (shape.ts), mesmo de um registro com data quebrada', () => {
  it('uma data com fração vira o inteiro de baixo; uma negativa vira 0; os campos do registro ficam como estavam', async () => {
    const name = `stamps-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    const session: Session = { id: 'neg', name: 'Antes de 1970', event: '333', order: 0, createdAt: -86_400_000, updatedAt: 5, deletedAt: null };
    const solves: Solve[] = [
      { id: 'frac', sessionId: 'neg', event: '333', ms: 30_000, penalty: null, at: 10.5, scramble: 'R', note: '', createdAt: 1_500.75, updatedAt: 2_000, deletedAt: null },
      { id: 'gone', sessionId: 'neg', event: '333', ms: 31_000, penalty: null, at: 11, scramble: 'R', note: '', createdAt: 11, updatedAt: 3_000, deletedAt: 2_999.9 },
    ];
    const practice: Practice[] = [
      { id: 'pf', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: 4_000.25 },
      { id: 'pn', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: -7 },
    ];
    await v2.put('sessions', session as never);
    for (const s of solves) await v2.put('solves', s as never);
    for (const p of practice) await v2.put('practice', p as never);
    v2.close();

    const db = await openKlickDb(name, {}, 3, () => 1_791_500_000_000.9);
    const storedSession = (await db.get('sessions', 'neg')) as StoredSession;
    const storedSolves = (await db.getAll('solves')) as StoredSolve[];
    const storedPractice = (await db.getAll('practice')) as StoredPractice[];
    expect(storedSession.deletionStamp).toBe(0);
    expect(storedSolves.map((s) => [s.id, s.deletionStamp])).toEqual([['frac', 1_500], ['gone', 2_999]]);
    expect(storedPractice.map((p) => [p.id, p.updatedAt, p.deletionStamp])).toEqual([['pf', 4_000, 4_000], ['pn', 0, 0]]);
    // O registro em si não muda: a tela lê o mesmo de antes.
    const repo = createRepository(db, { now, channel: null });
    expect(await repo.listSolves({ includeDeleted: true })).toEqual(solves);
    expect(await repo.listPractice()).toEqual([practice[1], practice[0]]);
    // Com os campos do próprio registro dentro da faixa, o servidor aceita o que a migração gravou. ('gone' tem o próprio deletedAt com
    // fração: esse campo é do registro, e a migração não o reescreve.)
    for (const p of storedPractice) expect(checkChange(toChange('practice', p)), p.id).toMatchObject({ ok: true });
    expect(checkChange(toChange('solves', storedSolves[0]))).toMatchObject({ ok: true });
    expect((await db.getAll('backups'))[0].createdAt).toBe(1_791_500_000_000);
  });

  // Fix round 2: uma data do sync no futuro subiria o relógio de todos os aparelhos até ela, e uma além do maior inteiro seguro o travaria.
  it('uma data no futuro ou além do maior inteiro seguro dá, no máximo, a data da migração', async () => {
    const name = `stamps-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    const year3000 = Date.UTC(3000, 0, 1);
    const session: Session = { id: 'grande', name: 'S', event: '333', order: 0, createdAt: 2 ** 53, updatedAt: 5, deletedAt: null };
    const base = { sessionId: 'grande', event: '333' as const, ms: 30_000, penalty: null, at: 10, scramble: 'R', note: '', updatedAt: 5 };
    const solves: Solve[] = [
      { ...base, id: 'criado-em-1e300', createdAt: 1e300, deletedAt: null },
      { ...base, id: 'apagado-no-ano-3000', createdAt: 1, deletedAt: year3000 },
    ];
    const practice: Practice[] = [{ id: 'treino-no-ano-3000', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: year3000 }];
    await v2.put('sessions', session as never);
    for (const s of solves) await v2.put('solves', s as never);
    for (const p of practice) await v2.put('practice', p as never);
    v2.close();

    const migratedAt = 1_791_500_000_000;
    const db = await openKlickDb(name, {}, 3, () => migratedAt);
    const stamps = [
      ((await db.get('sessions', 'grande')) as StoredSession).deletionStamp,
      ...((await db.getAll('solves')) as StoredSolve[]).map((s) => s.deletionStamp),
      ...((await db.getAll('practice')) as StoredPractice[]).flatMap((p) => [p.updatedAt, p.deletionStamp]),
    ];
    expect(stamps).toEqual([migratedAt, migratedAt, migratedAt, migratedAt, migratedAt]);
    expect(stamps.every((x) => Number.isSafeInteger(x))).toBe(true);
  });

  it('uma migração que falha no meio não deixa nada pela metade: o banco fica na versão 2, intacto', async () => {
    const name = `stamps-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    // Um valor que o IndexedDB guarda e o JSON da cópia não: a migração lança antes de terminar.
    const broken = { id: 'big', sessionId: 's', event: '333', ms: 10n, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1, updatedAt: 1, deletedAt: null };
    await v2.put('solves', broken as never);
    await v2.put('sessions', { id: 's', name: 'S', event: '333', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null } as never);
    v2.close();
    await expect(openKlickDb(name, {}, 3, () => 1_791_500_000_000)).rejects.toMatchObject({ name: 'AbortError' });
    const again = await openKlickDb(name, {}, 2);
    expect(again.version).toBe(2);
    expect([...again.objectStoreNames].sort()).toEqual(['backups', 'meta', 'practice', 'profile', 'sessions', 'solves']);
    expect(await again.getAll('backups')).toEqual([]);
    expect(await again.get('sessions', 's')).toEqual({ id: 's', name: 'S', event: '333', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null });
    expect(await again.get('solves', 'big')).toEqual(broken);
    again.close();
  });

  it('só itens da conta que o servidor aceita: um caso que não existe mais ou uma escolha fora dos algoritmos fica só na cópia "antes da v3"', async () => {
    const name = `stamps-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    const profile: Omit<Profile, 'duelName' | 'goals'> = {
      settings: defaultSettings(), // como a versão 2 gravava, antes do nome dos desafios e das metas
      trail: Array<boolean>(9).fill(false),
      finish: 'fosco',
      onboarded: false,
      currentSessionId: null,
      season: defaultSeason(),
      lessonAt: { 1: 2, 12: 3 } as Profile['lessonAt'],
      algChoice: { 'oll2-h': 1, 'caso-que-saiu': 1, 'oll2-sune': 99 },
      trainOff: ['pll2-t', 'caso-que-saiu'],
    };
    await v2.put('profile', profile as never, 'current');
    v2.close();

    const db = await openKlickDb(name, {}, 3, () => 1_791_500_000_000);
    const prefs = await db.getAll('prefs');
    expect(prefs.map((p) => p.key).sort()).toEqual(['algChoice.oll2-h', 'lessonAt.1', 'trainOff.pll2-t']);
    for (const item of prefs) expect(checkChange(prefToChange(item)), item.key).toMatchObject({ ok: true });
    const copy = JSON.parse((await db.getAll('backups'))[0].payload) as { profile: Profile };
    expect(copy.profile).toMatchObject({ lessonAt: { 1: 2, 12: 3 }, algChoice: { 'caso-que-saiu': 1, 'oll2-sune': 99 }, trainOff: ['pll2-t', 'caso-que-saiu'] });
  });

  it('restaurar a cópia "antes da v3" (que guarda os valores de antes como vieram) não grava item da conta que o servidor recusa', async () => {
    const name = `stamps-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    const profile: Omit<Profile, 'duelName' | 'goals'> = {
      settings: defaultSettings(), // como a versão 2 gravava, antes do nome dos desafios e das metas
      trail: [true, false, false, false, false, false, false, false, false],
      finish: 'fosco',
      onboarded: true,
      currentSessionId: null,
      season: defaultSeason(),
      lessonAt: { 1: 2, 12: 3 } as Profile['lessonAt'],
      algChoice: { 'oll2-h': 1, 'oll2-sune': 99 },
      trainOff: ['pll2-t', 'caso-que-saiu'],
    };
    await v2.put('profile', profile as never, 'current');
    v2.close();
    const db = await openKlickDb(name, {}, DB_VERSION, () => 1_791_500_000_000);
    const repo = createRepository(db, { now, channel: null });
    const copy = (await repo.listBackups()).find((r) => r.label === 'v3')!;
    t += 1000;
    const goal: Goal = { kind: 'single', event: '333', targetMs: 11_000, startMs: null, createdAt: t, reachedAt: null };
    await repo.saveProfile({ trainOff: [], algChoice: {}, lessonAt: {}, goals: { a1: goal } }); // mexe em tudo antes de restaurar
    t += 1000;
    await restoreBackup(repo, copy.id, t);
    const prefs = await db.getAll('prefs');
    for (const item of prefs) expect(checkChange(prefToChange(item)), item.key).toMatchObject({ ok: true });
    const keys = prefs.map((p) => p.key);
    expect(keys).not.toContain('trainOff.caso-que-saiu');
    expect(keys).not.toContain('lessonAt.12');
    expect(prefs.find((p) => p.key === 'algChoice.oll2-sune')?.value ?? 0).toBe(0);
    expect(await repo.getProfile()).toMatchObject({ trainOff: ['pll2-t'], algChoice: { 'oll2-h': 1 }, lessonAt: { 1: 2 }, onboarded: true });
    expect((await repo.getProfile()).goals).toEqual({ a1: goal }); // a cópia é de antes das metas: não as apaga
  });
});
