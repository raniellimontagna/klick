import { describe, expect, it } from 'vitest';
import type { SeasonState, Session, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type KlickExport, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

const DAY = 86400000;
const END = new Date(2026, 9, 13, 12).getTime();
let n = 0;

const session: Session = { id: 'hs', name: 'Histórico', event: '333', order: 0, createdAt: END - 20 * DAY, updatedAt: END - 20 * DAY, deletedAt: null };

// 1.000 solves de 3×3 de 50 s, 100 por dia nos 10 dias antes de END: fecham os 9 marcos da T1.
function t1History(): Solve[] {
  return Array.from({ length: 1000 }, (_, i) => {
    const at = END - (10 - Math.floor(i / 100)) * DAY + (i % 100) * 60000;
    return { id: `h${i}`, sessionId: 'hs', event: '333', ms: 50000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null };
  });
}
const file = (solves: Solve[]): KlickExport => ({ format: 'klick', version: 1, exportedAt: END, sessions: [session], solves, profile: null });
const repoNamed = async (name = `season-${++n}`): Promise<Repository> => createRepository(await openKlickDb(name), { channel: null });
const make = (repo: Repository, now: () => number = () => END + 5000): AppState =>
  new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null, now });

// Uma T2 de teste em que qualquer solve de 3×3 depois do início fecha os 9 marcos.
const easyT2 = (startedAt: number): SeasonState => ({
  n: 2,
  startedAt,
  marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })),
  basis: { single: 50000, ao5: 50000, ao12: 50000 },
});
// Variantes da T2: nove marcos de um solve abaixo de 30 s (um DNF não é um solve), e nove marcos de dois solves.
const strictT2 = (startedAt: number): SeasonState => ({
  ...easyT2(startedAt),
  marks: Array.from({ length: 9 }, () => ({ kind: 'single' as const, target: 30000 })),
});
const pairT2 = (startedAt: number): SeasonState => ({
  ...easyT2(startedAt),
  marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 2 })),
});
const rec1 = { n: 1, startedAt: END - 10 * DAY, endedAt: END - DAY, solves: 1000, startAo12: null, endAo12: 50000 };

describe('temporada no AppState', () => {
  it('quem já tem os 9 marcos da T1 abre na T2, com a T1 no histórico', async () => {
    const repo = await repoNamed();
    await repo.importAll(file(t1History()));
    const a = make(repo);
    await a.init();
    const { season } = a.profile;
    expect(season.current.n).toBe(2);
    expect(season.current.startedAt).toBe(END + 5000);
    expect(season.current.basis).toEqual({ single: 50000, ao5: 50000, ao12: 50000 });
    expect(season.current.marks[2]).toEqual({ kind: 'ao5', target: 48000 });
    expect(season.past).toEqual([{ n: 1, startedAt: END - 10 * DAY, endedAt: END - DAY + 99 * 60000, solves: 1000, startAo12: null, endAo12: 50000 }]);
    expect((await repo.getProfile()).season).toEqual(season);
    expect(a.seasonStatus().some((m) => m.achieved)).toBe(false);
  });

  it('um solve que fecha a temporada vira para a seguinte; apagar o solve não desfaz a virada', async () => {
    const repo = await repoNamed();
    await repo.saveProfile({ season: { current: easyT2(END), past: [rec1] } });
    const a = make(repo, () => END + 2000);
    await a.init();
    expect(a.profile.season.current.n).toBe(2);
    const solve = await a.addSolve({ ms: 20000, penalty: null, at: END + 1000 });
    await a.reload(); // a conferência que o solve pôs na fila roda antes desta leitura (mesma fila)
    expect(a.profile.season.current.n).toBe(3);
    expect(a.profile.season.past.map((r) => r.n)).toEqual([1, 2]);
    expect(a.profile.season.past[1]).toMatchObject({ n: 2, startedAt: END, endedAt: END + 1000, solves: 1, startAo12: 50000 });
    await a.deleteSolve(solve!.id);
    await a.checkSeason();
    expect(a.profile.season.current.n).toBe(3);
    expect((await repo.getProfile()).season.past).toHaveLength(2);
    expect(a.seasonStatus().some((m) => m.achieved)).toBe(false);
  });

  it('desfazer a exclusão do solve que fechou a temporada não a reabre, e o solve de volta não conta na seguinte', async () => {
    const repo = await repoNamed();
    await repo.saveProfile({ season: { current: easyT2(END), past: [rec1] } });
    const a = make(repo, () => END + 2000);
    await a.init();
    const solve = await a.addSolve({ ms: 20000, penalty: null, at: END + 1000 });
    await a.reload();
    expect(a.profile.season.current.n).toBe(3);
    await a.deleteSolve(solve!.id);
    expect(await a.undoDelete()).toBe(true);
    expect(a.solves.some((s) => s.id === solve!.id)).toBe(true); // o solve voltou
    expect(a.profile.season.current.n).toBe(3);
    expect((await repo.getProfile()).season.past).toHaveLength(2);
    expect(a.seasonStatus().some((m) => m.achieved)).toBe(false); // o solve é anterior ao início da T3
  });

  it('desfazer a exclusão que devolve o último marco vira a temporada', async () => {
    const repo = await repoNamed();
    await repo.saveProfile({ season: { current: pairT2(END), past: [rec1] } });
    const a = make(repo, () => END + 2000);
    await a.init();
    const first = await a.addSolve({ ms: 20000, penalty: null, at: END + 1000 });
    await a.deleteSolve(first!.id); // com ele fora, o outro solve (gravado direto no banco) é o único da temporada
    await repo.addSolve({ sessionId: a.activeSession!.id, event: '333', ms: 20000, penalty: null, at: END + 1500, scramble: '' });
    await a.reload();
    expect(a.profile.season.current.n).toBe(2);
    expect(await a.undoDelete()).toBe(true);
    expect(a.profile.season.current.n).toBe(3);
  });

  it('tirar o DNF de um solve vira a temporada, sem conferência explícita', async () => {
    const repo = await repoNamed();
    await repo.saveProfile({ season: { current: strictT2(END), past: [rec1] } });
    const a = make(repo, () => END + 2000);
    await a.init();
    const solve = await a.addSolve({ ms: 20000, penalty: 'DNF', at: END + 1000 });
    await a.reload();
    expect(a.profile.season.current.n).toBe(2); // um DNF não é um solve abaixo de 30 s
    await a.setPenalty(solve!.id, null);
    await a.reload(); // a conferência que a penalidade pôs na fila roda antes desta leitura
    expect(a.profile.season.current.n).toBe(3);
  });

  it('duas abas no mesmo banco viram a temporada uma vez só', async () => {
    const name = `season-${++n}`;
    const repo1 = await repoNamed(name);
    await repo1.importAll(file(t1History()));
    const repo2 = await repoNamed(name);
    const a = make(repo1, () => END + 5000);
    const b = make(repo2, () => END + 7000);
    await Promise.all([a.init(), b.init()]);
    const saved = (await repo1.getProfile()).season;
    expect(saved.past).toHaveLength(1);
    expect(a.profile.season).toEqual(saved);
    expect(b.profile.season).toEqual(saved);
  });

  it('a virada que falha avisa, não muda a temporada e entra na conferência seguinte', async () => {
    const repo = await repoNamed();
    await repo.importAll(file(t1History()));
    const advance = repo.advanceSeason.bind(repo);
    let fail = true;
    repo.advanceSeason = async (...args) => {
      if (fail) {
        fail = false;
        throw new Error('quota');
      }
      return advance(...args);
    };
    const a = make(repo);
    await a.init();
    expect(a.toast?.text).toBe(T.data.changeFailed);
    expect(a.profile.season.current.n).toBe(1);
    await a.checkSeason();
    expect(a.profile.season.current.n).toBe(2);
  });

  it('um solve de um evento que este app não conhece não impede a abertura, e a temporada não o conta', async () => {
    const name = `season-${++n}`;
    const repo = await repoNamed(name);
    await repo.importAll(file(t1History()));
    // Gravado direto no banco, sem a validação do repositório: um solve de "fto" de uma versão mais nova, depois de voltar a esta.
    const db = await openKlickDb(name);
    const at = END - 10 * DAY + 50 * 60000 + 1;
    await db.put('solves', { id: 'alien', sessionId: 'hs', event: 'fto', ms: 1000, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null } as unknown as Solve);
    db.close();
    const a = make(repo);
    await a.init();
    expect(a.solves.some((s) => s.id === 'alien')).toBe(true);
    expect(a.profile.season.current.n).toBe(2);
    expect(a.profile.season.current.basis).toEqual({ single: 50000, ao5: 50000, ao12: 50000 });
    expect(a.profile.season.past[0].solves).toBe(1000);
  });

  it('uma falha na conta da temporada não impede a abertura (a conferência seguinte tenta de novo)', async () => {
    const repo = await repoNamed();
    await repo.importAll(file(t1History()));
    const a = make(repo);
    const count = a.seasonStatus.bind(a);
    let fail = true;
    a.seasonStatus = (...args) => {
      if (fail) throw new Error('bug');
      return count(...args);
    };
    await a.init();
    expect(a.profile.season.current.n).toBe(1);
    expect(a.toast).toBeNull(); // uma falha de código, não do banco: sem aviso
    fail = false;
    await a.checkSeason();
    expect(a.profile.season.current.n).toBe(2);
  });

  it('importar um arquivo que completa a T1 vira a temporada no fim da importação', async () => {
    const repo = await repoNamed();
    const a = make(repo);
    await a.init();
    expect(a.profile.season.current.n).toBe(1);
    await a.importKlick(file(t1History()));
    expect(a.profile.season.current.n).toBe(2);
  });
});
