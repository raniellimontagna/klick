import { beforeEach, describe, expect, it } from 'vitest';
import { type Goal, GOAL_MAX } from '../../src/core/goals';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;

async function setup() {
  const repo = createRepository(await openKlickDb(`goals-app-${++n}`), { now, channel: null });
  const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), now, storage: null, storageManager: null });
  await app.init();
  return { repo, app };
}

const goal = (o: Partial<Goal> = {}): Goal => ({ kind: 'single', event: '333', targetMs: 11_000, startMs: null, createdAt: 1, reachedAt: null, ...o });
const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `a${i}`);
const many = (count: number): Record<string, Goal> => Object.fromEntries(ids(count).map((id) => [id, goal({ createdAt: 10 + Number(id.slice(1)) })]));

describe('metas no AppState', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  it('saveGoal cria com id de 2 caracteres, startMs do melhor e nasce alcançada sem comemorar', async () => {
    const { app, repo } = await setup();
    await app.addSolve({ ms: 14_000, penalty: null, at: 100 });
    await app.addSolve({ ms: 9_000, penalty: null, at: 200 });
    await app.addSolve({ ms: 12_000, penalty: null, at: 300 });
    // O melhor do 333 é 9 s; o primeiro solve abaixo de 13 s foi o de 9 s (at 200), então a meta já nasce cumprida, com essa data.
    expect(await app.saveGoal({ kind: 'single', event: '333', targetMs: 13_000 })).toBe(true);
    const [[id, saved]] = Object.entries(app.profile.goals);
    expect(id).toMatch(/^[0-9a-z]{2}$/);
    expect(saved).toEqual({ kind: 'single', event: '333', targetMs: 13_000, startMs: 9_000, createdAt: t, reachedAt: 200 });
    expect((await repo.getProfile()).goals).toEqual({ [id!]: saved });
    // Uma meta ainda por cumprir nasce sem data.
    expect(await app.saveGoal({ kind: 'single', event: '333', targetMs: 8_000 })).toBe(true);
    const fresh = Object.values(app.profile.goals).find((g) => g.targetMs === 8_000)!;
    expect(fresh).toMatchObject({ startMs: 9_000, reachedAt: null });
  });

  it('com 6 vivas (ou 7 do sync) saveGoal recusa criar e edita', async () => {
    for (const count of [GOAL_MAX, GOAL_MAX + 1]) {
      const { app, repo } = await setup();
      await repo.saveProfile({ goals: many(count) });
      await app.reload();
      expect(Object.keys(app.profile.goals)).toHaveLength(count);
      expect(await app.saveGoal({ kind: 'ao5', event: '333', targetMs: 15_000 })).toBe(false);
      expect(Object.keys((await repo.getProfile()).goals)).toHaveLength(count);
      // Editar uma que existe segue valendo, mesmo com o limite estourado.
      t += 1000;
      expect(await app.saveGoal({ id: 'a0', kind: 'ao5', event: '333', targetMs: 15_000 })).toBe(true);
      expect((await repo.getProfile()).goals.a0).toMatchObject({ kind: 'ao5', targetMs: 15_000, createdAt: 10 });
    }
  });

  it('saveGoal de uma meta que já não existe (apagada em outro aparelho) recusa sem gravar', async () => {
    const { app, repo } = await setup();
    expect(await app.saveGoal({ id: 'zz', kind: 'single', event: '333', targetMs: 11_000 })).toBe(false);
    expect((await repo.getProfile()).goals).toEqual({});
  });

  it('deleteGoal tira a meta', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { ab: goal(), cd: goal({ targetMs: 12_000 }) } });
    await app.reload();
    expect(await app.deleteGoal('ab')).toBe(true);
    expect(Object.keys(app.profile.goals)).toEqual(['cd']);
    expect(Object.keys((await repo.getProfile()).goals)).toEqual(['cd']);
  });

  it('markGoalsReached não troca uma data já gravada, ignora metas que sumiram e não grava sem mudança', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { ab: goal(), cd: goal({ reachedAt: 50 }) } });
    await app.reload();
    expect(await app.markGoalsReached([{ id: 'ab', at: 500 }, { id: 'cd', at: 900 }, { id: 'zz', at: 1 }])).toBe(true);
    const goals = (await repo.getProfile()).goals;
    expect(goals.ab!.reachedAt).toBe(500);
    expect(goals.cd!.reachedAt).toBe(50);
    expect(goals.zz).toBeUndefined();
    // Sem nada a mudar, nem chega ao repositório.
    let writes = 0;
    const save = repo.saveProfile.bind(repo);
    repo.saveProfile = (p) => {
      writes += 1;
      return save(p);
    };
    expect(await app.markGoalsReached([{ id: 'ab', at: 999 }, { id: 'zz', at: 2 }])).toBe(true);
    expect(await app.markGoalsReached([])).toBe(true);
    expect(writes).toBe(0);
    expect((await repo.getProfile()).goals.ab!.reachedAt).toBe(500);
  });
});
