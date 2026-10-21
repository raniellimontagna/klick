import { beforeEach, describe, expect, it } from 'vitest';
import { type Goal, GOAL_MAX } from '../../src/core/goals';
import { openKlickDb } from '../../src/data/db';
import type { Change } from '../../src/core/sync/types';
import { createRepository, type Repository } from '../../src/data/repository';
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
const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `a0${i}`);
const many = (count: number): Record<string, Goal> => Object.fromEntries(ids(count).map((id) => [id, goal({ createdAt: 10 + Number(id.slice(2)) })]));

describe('metas no AppState', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  it('saveGoal cria com id de 3 caracteres, startMs do melhor e nasce alcançada sem comemorar', async () => {
    const { app, repo } = await setup();
    await app.addSolve({ ms: 14_000, penalty: null, at: 100 });
    await app.addSolve({ ms: 9_000, penalty: null, at: 200 });
    await app.addSolve({ ms: 12_000, penalty: null, at: 300 });
    // O melhor do 333 é 9 s; o primeiro solve abaixo de 13 s foi o de 9 s (at 200), então a meta já nasce cumprida, com essa data.
    expect(await app.saveGoal({ kind: 'single', event: '333', targetMs: 13_000 })).toBe(true);
    const [[id, saved]] = Object.entries(app.profile.goals);
    expect(id).toMatch(/^[0-9a-z]{3}$/);
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
      expect(await app.saveGoal({ id: 'a00', kind: 'ao5', event: '333', targetMs: 15_000 })).toBe(true);
      expect((await repo.getProfile()).goals.a00).toMatchObject({ kind: 'ao5', targetMs: 15_000, createdAt: 10 });
    }
  });

  it('saveGoal de uma meta que já não existe (apagada em outro aparelho) recusa sem gravar', async () => {
    const { app, repo } = await setup();
    expect(await app.saveGoal({ id: 'zzz', kind: 'single', event: '333', targetMs: 11_000 })).toBe(false);
    expect((await repo.getProfile()).goals).toEqual({});
  });

  it('deleteGoal tira a meta', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { ab1: goal(), cd1: goal({ targetMs: 12_000 }) } });
    await app.reload();
    expect(await app.deleteGoal('ab1')).toBe(true);
    expect(Object.keys(app.profile.goals)).toEqual(['cd1']);
    expect(Object.keys((await repo.getProfile()).goals)).toEqual(['cd1']);
  });

  it('markGoalsReached não troca uma data já gravada, ignora metas que sumiram e não grava sem mudança', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { ab1: goal(), cd1: goal({ reachedAt: 50 }) } });
    await app.reload();
    expect(await app.markGoalsReached([{ id: 'ab1', at: 500 }, { id: 'cd1', at: 900 }, { id: 'zzz', at: 1 }])).toBe(true);
    const goals = (await repo.getProfile()).goals;
    expect(goals.ab1!.reachedAt).toBe(500);
    expect(goals.cd1!.reachedAt).toBe(50);
    expect(goals.zzz).toBeUndefined();
    // Sem nada a mudar, não grava (o perfil não muda nem avisa); sem marca, nem chega ao repositório.
    let writes = 0;
    let calls = 0;
    repo.onChange((kind) => {
      if (kind === 'profile') writes += 1;
    });
    const save = repo.saveProfile.bind(repo);
    repo.saveProfile = (p) => {
      calls += 1;
      return save(p);
    };
    expect(await app.markGoalsReached([{ id: 'ab1', at: 999 }, { id: 'zzz', at: 2 }])).toBe(true);
    expect(writes).toBe(0);
    expect(await app.markGoalsReached([])).toBe(true);
    expect(calls).toBe(1);
    expect((await repo.getProfile()).goals.ab1!.reachedAt).toBe(500);
  });
});

// Tempos e datas fracionários (um solve importado) não deixam a meta fora do formato: o perfil gravaria o padrão (null) por cima dela.
describe('metas com valores fracionários', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  it('um solve de 12345.5 ms: saveGoal grava, e a meta continua depois de reler o repositório', async () => {
    const { app, repo } = await setup();
    await app.addSolve({ ms: 12_345.5, penalty: null, at: 200.5 });
    expect(await app.saveGoal({ kind: 'single', event: '333', targetMs: 13_000 })).toBe(true);
    await app.reload();
    expect(Object.values(app.profile.goals)).toEqual([{ kind: 'single', event: '333', targetMs: 13_000, startMs: 12_346, createdAt: t, reachedAt: 201 }]);
    expect((await repo.getProfile()).goals).toEqual(app.profile.goals);
  });

  it('markGoalsReached com at 100.5 não apaga a meta', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { ab1: goal() } });
    await app.reload();
    expect(await app.markGoalsReached([{ id: 'ab1', at: 100.5 }])).toBe(true);
    expect((await repo.getProfile()).goals).toEqual({ ab1: goal({ reachedAt: 101 }) });
  });
});

// Um lote do sync que grava uma meta entre a leitura do perfil e a gravação daqui (antes de a memória se refazer) não é desfeito: as três
// operações trabalham pela vaga sobre as metas gravadas, dentro da transação, e a memória fica com o perfil que a transação devolve.
describe('metas com um lote do sync no meio', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  const theirs = goal({ kind: 'ao5', event: '222', targetMs: 4_000, createdAt: 7 });
  const lote = (): Change[] => [{ store: 'prefs', id: 'goal.yyy', data: theirs, updatedAt: t, deletedAt: null, deletionStamp: t }];
  // O lote do sync (o applyRemote de verdade) grava goal.yyy logo antes da transação da operação: a memória ainda não tem a meta.
  function landsFirst(repo: Repository): void {
    const save = repo.saveProfile.bind(repo);
    repo.saveProfile = async (patch) => {
      await repo.applyRemote(lote(), t);
      repo.saveProfile = save;
      return save(patch);
    };
  }
  async function withMine() {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { xxx: goal({ createdAt: 3 }) } });
    await app.reload();
    expect(Object.keys(app.profile.goals)).toEqual(['xxx']);
    t += 1000;
    landsFirst(repo);
    return { app, repo };
  }
  const stored = async (repo: Repository) => (await repo.getProfile()).goals;

  it('saveGoal (editar e criar) não apaga a meta que chegou', async () => {
    const { app, repo } = await withMine();
    expect(await app.saveGoal({ id: 'xxx', kind: 'single', event: '333', targetMs: 10_000 })).toBe(true);
    expect((await stored(repo)).yyy).toEqual(theirs);
    expect(app.profile.goals.yyy).toEqual(theirs);
    expect((await stored(repo)).xxx).toMatchObject({ targetMs: 10_000, createdAt: 3 });
    landsFirst(repo);
    expect(await app.saveGoal({ kind: 'ao12', event: '333', targetMs: 20_000 })).toBe(true);
    expect(Object.keys(await stored(repo))).toHaveLength(3);
    expect((await stored(repo)).yyy).toEqual(theirs);
  });

  it('deleteGoal não apaga a meta que chegou', async () => {
    const { app, repo } = await withMine();
    expect(await app.deleteGoal('xxx')).toBe(true);
    expect(await stored(repo)).toEqual({ yyy: theirs });
    expect(app.profile.goals).toEqual({ yyy: theirs });
  });

  it('markGoalsReached não apaga a meta que chegou', async () => {
    const { app, repo } = await withMine();
    expect(await app.markGoalsReached([{ id: 'xxx', at: 500 }])).toBe(true);
    expect(await stored(repo)).toEqual({ xxx: goal({ createdAt: 3, reachedAt: 500 }), yyy: theirs });
    expect(app.profile.goals.yyy).toEqual(theirs);
  });

  it('o teto conta as metas gravadas: com a sexta chegando pelo sync, criar recusa', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: many(GOAL_MAX - 1) });
    await app.reload();
    t += 1000;
    landsFirst(repo);
    expect(await app.saveGoal({ kind: 'single', event: '333', targetMs: 9_000 })).toBe(false);
    expect(Object.keys(await stored(repo))).toHaveLength(GOAL_MAX);
    expect(Object.keys(app.profile.goals)).toHaveLength(GOAL_MAX);
  });

  it('editar uma meta apagada pelo sync recusa sem gravar', async () => {
    const { app, repo } = await setup();
    await repo.saveProfile({ goals: { xxx: goal() } });
    await app.reload();
    t += 1000;
    const save = repo.saveProfile.bind(repo);
    repo.saveProfile = async (patch) => {
      await repo.applyRemote([{ store: 'prefs', id: 'goal.xxx', data: null, updatedAt: t, deletedAt: null, deletionStamp: t }], t);
      repo.saveProfile = save;
      return save(patch);
    };
    expect(await app.saveGoal({ id: 'xxx', kind: 'single', event: '333', targetMs: 10_000 })).toBe(false);
    expect(await stored(repo)).toEqual({});
    expect(app.profile.goals).toEqual({});
  });
});
