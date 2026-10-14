import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type ChannelLike, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;

async function setup(repo?: Repository) {
  const r = repo ?? createRepository(await openKlickDb(`trail-app-${++n}`), { now, channel: null });
  const app = new AppState({ repo: r, queue: createScrambleQueue({ generate: async () => 'R U' }), now, storage: null, storageManager: null });
  await app.init();
  return { repo: r, app };
}
const attempt = (o: Partial<{ caseId: string; ms: number; ok: boolean; helped: boolean; at: number }> = {}) => ({
  caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: (t += 1000), ...o,
});

function bus() {
  const members: ChannelLike[] = [];
  return {
    make(): ChannelLike {
      const ch: ChannelLike = {
        onmessage: null,
        postMessage(data) {
          for (const m of members) if (m !== ch) m.onmessage?.({ data });
        },
      };
      members.push(ch);
      return ch;
    },
  };
}

describe('treino no AppState (spec 7 e 9)', () => {
  beforeEach(() => {
    t = 1_791_500_000_000;
  });

  it('a abertura lê o treino gravado, em ordem de tempo', async () => {
    const repo = createRepository(await openKlickDb(`trail-app-${++n}`), { now, channel: null });
    const late = await repo.addPractice({ id: 'b', ...attempt({ at: 20 }) });
    const early = await repo.addPractice({ id: 'a', ...attempt({ at: 10 }) });
    const { app } = await setup(repo);
    expect(app.practice).toEqual([early, late]);
  });

  it('uma tentativa grava no treino e fica fora dos solves, das sessões e das contas de exportar', async () => {
    const { app, repo } = await setup();
    const sessions = app.sessions;
    const exportCount = app.meta?.solvesSinceExport;
    const saved = await app.addPractice(attempt());
    expect(saved).not.toBeNull();
    expect(app.practice).toEqual([saved]);
    expect(await repo.listPractice()).toEqual([saved]);
    expect(app.solves).toEqual([]);
    expect(await repo.listSolves()).toEqual([]);
    expect(app.sessions).toEqual(sessions);
    expect((await repo.getMeta()).solvesSinceExport).toBe(exportCount);
  });

  it('um dia só de treino marca a cópia do dia (contador em 1); com solves contados, o contador não muda', async () => {
    const { app, repo } = await setup();
    await app.addPractice(attempt());
    await vi.waitFor(async () => expect((await repo.getMeta()).solvesSinceBackup).toBe(1));
    await app.addPractice(attempt());
    await new Promise((r) => setTimeout(r, 20));
    expect((await repo.getMeta()).solvesSinceBackup).toBe(1);
  });

  it('uma tentativa que não grava mostra o aviso e devolve null; o treino na memória não muda', async () => {
    const { app, repo } = await setup();
    repo.addPractice = async () => {
      throw new Error('quota');
    };
    expect(await app.addPractice(attempt())).toBeNull();
    expect(app.practice).toEqual([]);
    expect(app.toast?.text).toBe(T.data.changeFailed);
  });

  it('corrigir a última: trocar acerto por erro e apagar, na memória e no banco', async () => {
    const { app, repo } = await setup();
    const a = (await app.addPractice(attempt()))!;
    expect(await app.setPracticeOk(a.id, false)).toBe(true);
    expect(app.practice[0].ok).toBe(false);
    expect((await repo.listPractice())[0].ok).toBe(false);
    expect(await app.deletePractice(a.id)).toBe(true);
    expect(app.practice).toEqual([]);
    expect(await repo.listPractice()).toEqual([]);
  });

  it('o treino gravado em outra aba chega aqui', async () => {
    const name = `trail-app-${++n}`;
    const b = bus();
    const { app: a } = await setup(createRepository(await openKlickDb(name), { now, channel: b.make() }));
    const { app: other } = await setup(createRepository(await openKlickDb(name), { now, channel: b.make() }));
    const saved = await a.addPractice(attempt());
    await vi.waitFor(() => expect(other.practice).toEqual([saved]));
  });

  it('a exportação de emergência (banco quebrado) leva o treino da memória', async () => {
    const { app, repo } = await setup();
    const saved = await app.addPractice(attempt());
    repo.exportAll = async () => {
      throw new Error('banco quebrado');
    };
    expect((await app.exportData()).practice).toEqual([saved]);
  });
});

describe('trilha no AppState (spec 6.2, 8.2 e 8.4)', () => {
  it('marcar etapas grava e pisca a face lateral só quando alguma etapa nova acende', async () => {
    const { app, repo } = await setup();
    expect(await app.setTrail([0], true)).toBe(true);
    expect(app.trailFlashes).toBe(1);
    await app.setTrail([0], true); // já marcada: sem piscada
    await app.setTrail([0], false); // desfazer: sem piscada
    expect(app.trailFlashes).toBe(1);
    await app.setTrail([2, 3, 4], true); // várias de uma vez: uma piscada
    expect(app.trailFlashes).toBe(2);
    expect((await repo.getProfile()).trail.slice(0, 5)).toEqual([false, false, true, true, true]);
  });

  it('dois toques seguidos em etapas diferentes não se perdem (a fila lê o perfil depois da gravação anterior)', async () => {
    const { app, repo } = await setup();
    await Promise.all([app.setTrail([0], true), app.setTrail([1], true), app.setAlgChoice('oll2-h', 1), app.setCaseOff('pll2-z', true)]);
    const p = await repo.getProfile();
    expect(p.trail.slice(0, 2)).toEqual([true, true]);
    expect(p.algChoice).toEqual({ 'oll2-h': 1 });
    expect(p.trainOff).toEqual(['pll2-z']);
  });

  it('um perfil que não grava: aviso, false, e a memória volta ao gravado', async () => {
    const { app, repo } = await setup();
    repo.saveProfile = async () => {
      throw new Error('quota');
    };
    expect(await app.setTrail([0], true)).toBe(false);
    expect(app.toast?.text).toBe(T.data.changeFailed);
    expect(app.profile.trail[0]).toBe(false);
    expect(app.trailFlashes).toBe(0);
  });

  it('concluir a aula marca a etapa e zera o passo guardado; concluída de novo, só zera', async () => {
    const { app, repo } = await setup();
    await app.setLessonAt(0, 4);
    await app.setLessonAt(1, 2);
    expect((await repo.getProfile()).lessonAt).toEqual({ 0: 4, 1: 2 });
    await app.completeLesson(0);
    expect(app.profile.trail[0]).toBe(true);
    expect(app.profile.lessonAt).toEqual({ 1: 2 });
    expect(app.trailFlashes).toBe(1);
    await app.setLessonAt(0, 1);
    await app.completeLesson(0);
    expect((await repo.getProfile()).lessonAt).toEqual({ 1: 2 });
    expect(app.trailFlashes).toBe(1);
  });

  it('a escolha de algoritmo padrão (0) não fica guardada; tirar e devolver um caso do sorteio', async () => {
    const { app, repo } = await setup();
    await app.setAlgChoice('oll2-h', 1);
    await app.setAlgChoice('oll2-h', 0);
    expect((await repo.getProfile()).algChoice).toEqual({});
    await app.setCaseOff('oll2-pi', true);
    await app.setCaseOff('oll2-pi', true);
    expect(app.profile.trainOff).toEqual(['oll2-pi']);
    await app.setCaseOff('oll2-pi', false);
    expect((await repo.getProfile()).trainOff).toEqual([]);
  });

  it('o aviso de marcar o que já sabe: some ao marcar uma etapa ou ao dispensar (que fica no meta)', async () => {
    const first = await setup();
    expect(first.app.trailPromptShown).toBe(true);
    await first.app.setTrail([5], true);
    expect(first.app.trailPromptShown).toBe(false);
    const second = await setup();
    await second.app.dismissTrailPrompt();
    expect(second.app.trailPromptShown).toBe(false);
    expect((await second.repo.getMeta()).trailPromptDismissed).toBe(true);
  });

  it('openTrail abre a aba Trilha na vista pedida', async () => {
    const { app } = await setup();
    app.openTrail({ kind: 'lesson', step: 0 });
    expect(app.tab).toBe('trilha');
    expect(app.trailView).toEqual({ kind: 'lesson', step: 0 });
    app.openTrail();
    expect(app.trailView).toEqual({ kind: 'home' });
  });
});
