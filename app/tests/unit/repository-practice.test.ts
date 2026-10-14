import { describe, expect, it } from 'vitest';
import type { Practice, Profile } from '../../src/core/types';
import { DB_VERSION, openKlickDb } from '../../src/data/db';
import { createRepository, type ChangeKind, type Repository } from '../../src/data/repository';

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
