import { describe, expect, it } from 'vitest';
import type { Practice, Profile } from '../../src/core/types';
import { DB_VERSION, openKlickDb } from '../../src/data/db';
import { createRepository, type ChangeKind, type KlickExport, type Repository } from '../../src/data/repository';
import { createBackup, restoreBackup } from '../../src/data/safety';
import { parseKlickJson, toKlickJson } from '../../src/data/transfer';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const name = () => `practice-${++n}`;
async function fresh(): Promise<Repository> {
  return createRepository(await openKlickDb(name()), { now, channel: null });
}
let seq = 0;
const pr = (o: Partial<Practice> = {}): Practice => ({
  id: `p${String(++seq).padStart(4, '0')}`, caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: (t += 1000), ...o,
});

describe('banco versão 2: a migração cria o treino e não mexe no resto (spec 9.1)', () => {
  it('um banco da versão 1 com solves, sessão, perfil e meta abre na 2 com tudo igual e o treino vazio', async () => {
    const db = name();
    const v1 = createRepository(await openKlickDb(db, {}, 1), { now, channel: null });
    const session = await v1.createSession({ event: '333' });
    const solve = await v1.addSolve({ sessionId: session.id, event: '333', ms: 61_000, penalty: null, at: t, scramble: "R U R'" });
    await v1.saveProfile({ trail: [true, true, false, false, false, false, false, false, false], finish: 'fosco', currentSessionId: session.id });
    const meta = await v1.saveMeta({ solvesSinceBackup: 7 });
    v1.close();

    const handle = await openKlickDb(db);
    expect(handle.version).toBe(DB_VERSION);
    expect([...handle.objectStoreNames].sort()).toEqual(['backups', 'meta', 'practice', 'profile', 'sessions', 'solves']);
    const v2 = createRepository(handle, { now, channel: null });
    expect(await v2.listSolves()).toEqual([solve]);
    expect(await v2.listSessions()).toEqual([session]);
    const profile = await v2.getProfile();
    expect(profile.trail.slice(0, 3)).toEqual([true, true, false]);
    expect(profile.currentSessionId).toBe(session.id);
    expect((await v2.getMeta()).solvesSinceBackup).toBe(meta.solvesSinceBackup);
    expect(await v2.listPractice()).toEqual([]);
    v2.close();
  });

  it('perfil e meta gravados antes do treino leem os padrões novos: {}, {}, [] e o aviso não dispensado', async () => {
    const db = await openKlickDb(name());
    const old = { settings: (await createRepository(db, { channel: null }).getProfile()).settings, trail: Array<boolean>(9).fill(false), finish: 'fosco', onboarded: true, currentSessionId: null };
    await db.put('profile', old as unknown as Profile, 'current');
    const repo = createRepository(db, { now, channel: null });
    const p = await repo.getProfile();
    expect([p.lessonAt, p.algChoice, p.trainOff]).toEqual([{}, {}, []]);
    expect((await repo.getMeta()).trailPromptDismissed).toBe(false);
  });
});

describe('tentativas do treino no repositório', () => {
  it('grava e lista em ordem de tempo, também por caso', async () => {
    const repo = await fresh();
    const late = pr({ at: 5_000 });
    const early = pr({ at: 1_000, caseId: 'pll2-t' });
    const mid = pr({ at: 3_000 });
    for (const x of [late, early, mid]) await repo.addPractice(x);
    expect(await repo.listPractice()).toEqual([early, mid, late]);
    expect(await repo.listPractice({ caseId: 'oll2-sune' })).toEqual([mid, late]);
    expect(await repo.listPractice({ caseId: 'oll2-h' })).toEqual([]);
  });

  it('gravar de novo com o mesmo id não duplica e devolve a gravada', async () => {
    const repo = await fresh();
    const a = pr();
    await repo.addPractice(a);
    expect(await repo.addPractice({ ...a, ms: 1 })).toEqual(a);
    expect(await repo.listPractice()).toEqual([a]);
  });

  it('corrigir troca acerto e erro; apagar tira; uma tentativa que não existe falha', async () => {
    const repo = await fresh();
    const a = await repo.addPractice(pr());
    expect(await repo.updatePractice(a.id, { ok: false })).toEqual({ ...a, ok: false });
    expect((await repo.listPractice())[0].ok).toBe(false);
    await repo.deletePractice(a.id);
    expect(await repo.listPractice()).toEqual([]);
    await expect(repo.updatePractice('nada', { ok: true })).rejects.toThrow('nada');
  });

  it('cada escrita avisa "practice", uma vez; a repetida não avisa', async () => {
    const repo = await fresh();
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    const a = await repo.addPractice(pr());
    await repo.addPractice(a);
    await repo.updatePractice(a.id, { ok: false });
    await repo.deletePractice(a.id);
    expect(heard).toEqual(['practice', 'practice', 'practice']);
  });

  it('o treino não toca nos solves, nas sessões nem no perfil', async () => {
    const repo = await fresh();
    const session = await repo.createSession({ event: '333' });
    await repo.addSolve({ sessionId: session.id, event: '333', ms: 30_000, penalty: null, at: t, scramble: 'R' });
    const before = { solves: await repo.listSolves(), sessions: await repo.listSessions(), profile: await repo.getProfile() };
    const a = await repo.addPractice(pr());
    await repo.updatePractice(a.id, { ok: false });
    expect({ solves: await repo.listSolves(), sessions: await repo.listSessions(), profile: await repo.getProfile() }).toEqual(before);
  });
});

describe('o treino no arquivo e nas cópias (spec 9.3)', () => {
  const withoutPractice = (data: KlickExport): KlickExport => {
    const { practice: _, ...rest } = data;
    return rest;
  };

  it('exportar leva o treino em ordem de tempo; importar num aparelho vazio traz igual; importar de novo não duplica', async () => {
    const source = await fresh();
    const a = await source.addPractice(pr({ at: 9_000 }));
    const b = await source.addPractice(pr({ at: 2_000, caseId: 'f2l-07', ok: false }));
    const data = parseKlickJson(toKlickJson(await source.exportAll()));
    expect(data.practice).toEqual([b, a]);
    const target = await fresh();
    await target.importAll(data);
    await target.importAll(data);
    expect(await target.listPractice()).toEqual([b, a]);
  });

  it('importar junta pelo id: o daqui fica como está, o novo do arquivo entra, e avisa', async () => {
    const repo = await fresh();
    const mine = await repo.addPractice(pr({ ok: true }));
    const theirs = pr({ caseId: 'pll2-h' });
    const heard: ChangeKind[] = [];
    repo.onChange((k) => heard.push(k));
    const file = await repo.exportAll();
    await repo.importAll({ ...file, practice: [{ ...mine, ok: false }, theirs] });
    expect(await repo.listPractice()).toEqual([mine, theirs]);
    expect(heard).toEqual(['all']);
  });

  it('arquivo antigo, sem treino: entra normalmente e o treino daqui continua', async () => {
    const repo = await fresh();
    const mine = await repo.addPractice(pr());
    const old = withoutPractice(await (await fresh()).exportAll());
    await repo.importAll(parseKlickJson(toKlickJson(old)));
    expect(await repo.listPractice()).toEqual([mine]);
  });

  it('restaurar troca o treino pelo da cópia; uma cópia de antes do treino não apaga o daqui', async () => {
    const repo = await fresh();
    const kept = await repo.addPractice(pr());
    const snapshot = await repo.exportAll();
    await repo.addPractice(pr({ caseId: 'oll2-t' }));
    await repo.replaceAll(snapshot);
    expect(await repo.listPractice()).toEqual([kept]);
    await repo.replaceAll({ ...snapshot, practice: [] });
    expect(await repo.listPractice()).toEqual([]);
    const later = await repo.addPractice(pr());
    await repo.replaceAll(withoutPractice(snapshot));
    expect(await repo.listPractice()).toEqual([later]);
  });

  it('restaurar uma cópia de antes do treino mantém a escolha de algoritmos, os casos fora e o passo das aulas daqui', async () => {
    const repo = await fresh();
    await repo.saveProfile({ finish: 'fosco' });
    const old = withoutPractice(await repo.exportAll());
    const { lessonAt: _l, algChoice: _a, trainOff: _o, ...oldProfile } = old.profile!;
    await repo.saveProfile({ algChoice: { 'oll2-h': 1 }, trainOff: ['pll2-z'], lessonAt: { 0: 3 } });
    await repo.replaceAll({ ...old, profile: oldProfile });
    const p = await repo.getProfile();
    expect([p.algChoice, p.trainOff, p.lessonAt]).toEqual([{ 'oll2-h': 1 }, ['pll2-z'], { 0: 3 }]);
  });

  it('importar o perfil: a escolha de algoritmo junta caso a caso (vale a do arquivo); os casos fora são os do arquivo', async () => {
    const repo = await fresh();
    await repo.saveProfile({ algChoice: { 'oll2-h': 1, 'f2l-03': 2 }, trainOff: ['oll2-pi'] });
    const file = await repo.exportAll();
    await repo.importAll({ ...file, profile: { algChoice: { 'f2l-03': 1 }, trainOff: ['pll2-t'] } });
    const p = await repo.getProfile();
    expect(p.algChoice).toEqual({ 'oll2-h': 1, 'f2l-03': 1 });
    expect(p.trainOff).toEqual(['pll2-t']);
  });

  it('a cópia de segurança leva o treino, e restaurá-la o traz de volta', async () => {
    const repo = await fresh();
    const a = await repo.addPractice(pr());
    const backup = await createBackup(repo, 'manual', t);
    await repo.deletePractice(a.id);
    await repo.addPractice(pr({ caseId: 'pll2-ua' }));
    t += 1000;
    await restoreBackup(repo, backup.id, t);
    expect(await repo.listPractice()).toEqual([a]);
  });
});
