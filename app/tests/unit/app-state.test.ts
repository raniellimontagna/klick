import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createBackup } from '../../src/data/safety';
import type { Solve } from '../../src/core/types';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState, type AppDeps } from '../../src/ui/state/app.svelte';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const fakeQueue = () => {
  const c: Record<string, number> = {};
  return createScrambleQueue({ generate: async (ev) => `${ev}-${(c[ev] = (c[ev] ?? 0) + 1)}` });
};

async function setup(storage: Pick<Storage, 'getItem'> | null = null) {
  const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
  const app = new AppState({ repo, queue: fakeQueue(), now, storage, storageManager: null });
  await app.init();
  return { repo, app };
}

describe('estado do app', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  it('cria a primeira sessão de 3×3 e pede um embaralhamento', async () => {
    const { app, repo } = await setup();
    expect(app.sessions.map((s) => [s.name, s.event])).toEqual([['Sessão 1', '333']]);
    expect(app.profile.currentSessionId).toBe(app.sessions[0].id);
    expect(app.scramble).toBe('333-1');
    expect((await repo.getProfile()).currentSessionId).toBe(app.sessions[0].id);
  });

  it('grava o solve com o embaralhamento usado, conta no meta e avança o embaralhamento', async () => {
    const { app, repo } = await setup();
    const s = await app.addSolve({ ms: 61234, penalty: null, at: t });
    expect(s).toMatchObject({ ms: 61234, scramble: '333-1', event: '333' });
    expect((await repo.listSolves()).length).toBe(1);
    expect((await repo.getMeta())).toMatchObject({ solvesSinceBackup: 1, solvesSinceExport: 1 });
    expect(app.scramble).toBe('333-2');
  });

  it('a cada 50 solves faz uma cópia automática', async () => {
    const { app, repo } = await setup();
    for (let i = 0; i < 50; i++) await app.addSolve({ ms: 60000 + i, penalty: null, at: t + i });
    expect((await repo.listBackups()).map((b) => b.reason)).toEqual(['auto50']);
  });

  it('trocar para uma sessão de outro evento muda solves e embaralhamento', async () => {
    const { app } = await setup();
    await app.addSolve({ ms: 60000, penalty: null, at: t });
    await app.createSession('sq1');
    expect(app.event).toBe('sq1');
    expect(app.sessionSolves).toEqual([]);
    expect(app.scramble).toBe('sq1-1');
  });

  it('excluir mostra o aviso e desfazer restaura dentro do prazo', async () => {
    const { app } = await setup();
    const s = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    await app.deleteSolve(s.id);
    expect(app.solves).toEqual([]);
    expect(app.toast?.text).toBeTruthy();
    expect(await app.undoDelete()).toBe(true);
    expect(app.solves.map((x) => x.id)).toEqual([s.id]);
    await app.deleteSolve(s.id);
    t += 7000;
    expect(await app.undoDelete()).toBe(false);
  });

  it('acha dados da v1 neste navegador e oferece uma vez', async () => {
    const v1 = JSON.stringify({ state: { sessions: [{ id: 'v', name: 'S', puzzleType: '3x3', solves: [{ id: 'x', timeMs: 1, penalty: 'NONE', scramble: '', createdAt: '2026-01-01T00:00:00Z' }] }] } });
    const { app } = await setup({ getItem: (k) => (k === 'klick-sessions' ? v1 : null) });
    expect(app.v1Available).toBe(true);
  });

  it('aplica o tema escolhido no elemento raiz', async () => {
    const { app } = await setup();
    await app.updateSettings({ theme: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    await app.updateSettings({ theme: 'system' });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('quando gravar falha, o solve fica na fila e a contagem de pendentes sobe', async () => {
    const { app, repo } = await setup();
    const original = repo.addSolve.bind(repo);
    let fail = true;
    repo.addSolve = async (s) => { if (fail) throw new Error('quota'); return original(s); };
    expect(await app.addSolve({ ms: 60000, penalty: null, at: t })).toBeNull();
    expect(app.savePending).toBe(1);
    fail = false;
  });

  // Acrescentados ao verbatim: as regras 2 e 6 do brief.
  it('um solve gravado de primeira aparece uma vez em solves e conta uma vez', async () => {
    const { app } = await setup();
    const s = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    expect(app.solves.map((x) => x.id)).toEqual([s.id]);
    expect(app.meta?.solvesSinceBackup).toBe(1);
    expect(app.savePending).toBe(0);
  });

  it('sem sessão atual e sem poder gravar uma, o aviso sai e addSolve devolve null', async () => {
    const { app, repo } = await setup();
    app.profile = { ...app.profile, currentSessionId: null };
    repo.saveProfile = async () => { throw new Error('quota'); };
    expect(await app.addSolve({ ms: 60000, penalty: null, at: t })).toBeNull();
    expect(app.toast?.text).toBe(T.data.saveFailed);
    expect(app.savePending).toBe(0);
  });

  it('uma gravação que falha e sai na nova tentativa conta uma vez e aparece uma vez', async () => {
    const { app, repo } = await setup();
    const original = repo.addSolve.bind(repo);
    let fail = true;
    repo.addSolve = async (s) => { if (fail) throw new Error('quota'); return original(s); };
    // Relógio falso já na falha: a fila agenda a nova tentativa com setTimeout, e avançar o relógio a dispara.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve({ ms: 60000, penalty: null, at: t })).toBeNull();
      expect(app.savePending).toBe(1);
      fail = false;
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(app.meta?.solvesSinceBackup).toBe(1));
      expect(app.solves).toHaveLength(1);
      expect(app.savePending).toBe(0);
      expect(await repo.listSolves()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('desfazer depois do prazo de 6 s não restaura', async () => {
    const { app } = await setup();
    const s = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    await app.deleteSolve(s.id);
    t += 6001;
    expect(await app.undoDelete()).toBe(false);
    expect(app.solves).toEqual([]);
  });

  it('um solve novo encerra o desfazer pendente e tira o aviso dele', async () => {
    const { app } = await setup();
    const first = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    await app.deleteSolve(first.id);
    expect(app.toast?.action).toBe(T.toast.undo);
    await app.addSolve({ ms: 61000, penalty: null, at: t + 1 });
    expect(await app.undoDelete()).toBe(false);
    expect(app.solves.map((x) => x.ms)).toEqual([61000]);
    expect(app.toast).toBeNull();
  });

  it('o aviso de desfazer usa o rótulo de toque quando o ponteiro é grosso', async () => {
    const { app } = await setup();
    const s = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)', media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      await app.deleteSolve(s.id);
      expect(app.toast?.action).toBe(T.toast.undoTouch);
    } finally {
      window.matchMedia = original;
    }
  });

  it('uma mudança de outra aba enquanto espera o primeiro embaralhamento aparece', async () => {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queue = createScrambleQueue({ generate: async (ev) => { await gate; return `${ev}-1`; } });
    const app = new AppState({ repo, queue, now, storage: null, storageManager: null });
    const booting = app.init();
    await vi.waitFor(() => expect(app.sessions).toHaveLength(1));
    await repo.createSession({ event: 'sq1' }); // outra aba criou uma sessão enquanto o cubing carrega
    await vi.waitFor(() => expect(app.sessions).toHaveLength(2));
    release();
    await booting;
    expect(app.sessions.map((s) => s.event)).toEqual(['333', 'sq1']);
    await vi.waitFor(() => expect(app.scramble).toBe('333-1'));
  });

  it('init não espera o primeiro embaralhamento: a casca aparece em branco e ele chega depois', async () => {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queue = createScrambleQueue({ generate: async (ev) => { await gate; return `${ev}-1`; } });
    const app = new AppState({ repo, queue, now, storage: null, storageManager: null });
    const started = Date.now();
    await app.init(); // a geração está presa no gate: se init esperasse por ela, este await não voltaria
    expect(Date.now() - started).toBeLessThan(1000);
    expect(app.scramble).toBe('');
    release();
    await vi.waitFor(() => expect(app.scramble).toBe('333-1'));
  });

  it('a primeira falha de gravação anuncia o aviso fixo na região aria-live', async () => {
    const { app, repo } = await setup();
    repo.addSolve = async () => { throw new Error('quota'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      await app.addSolve({ ms: 60000, penalty: null, at: t });
      expect(app.live).toBe('');
      await vi.advanceTimersByTimeAsync(50);
      expect(app.live).toBe(T.data.saveFailed);
    } finally {
      vi.useRealTimers();
    }
  });

  it('um aviso (showToast) também vai para a região aria-live', async () => {
    const { app } = await setup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      app.showToast('Solve excluído');
      await vi.advanceTimersByTimeAsync(50);
      expect(app.live).toBe('Solve excluído');
    } finally {
      vi.useRealTimers();
    }
  });

  it('depois de cada gravação, savePending é o que a fila ainda tem', async () => {
    const { app, repo } = await setup();
    const original = repo.addSolve.bind(repo);
    let calls = 0;
    let releaseB!: () => void;
    // A falha duas vezes (A e B). Na terceira tentativa A grava; B fica em voo na quarta, sem falha.
    repo.addSolve = async (s) => {
      calls++;
      if (calls <= 2) throw new Error('quota');
      if (calls === 3) return original(s);
      await new Promise<void>((resolve) => { releaseB = resolve; });
      return original(s);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve({ ms: 60000, penalty: null, at: t })).toBeNull();
      expect(await app.addSolve({ ms: 61000, penalty: null, at: t + 1 })).toBeNull();
      expect(app.savePending).toBe(2);
      await vi.advanceTimersByTimeAsync(3000); // a nova tentativa: A grava
      await vi.waitFor(() => expect(app.savePending).toBe(1));
      expect(calls).toBe(4); // B já está em voo
      releaseB();
      await vi.waitFor(() => expect(app.solves).toHaveLength(2));
      expect(app.savePending).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('trocar de sessão zera o embaralhamento antes de gravar, então um solve nessa janela não leva o do evento antigo', async () => {
    const { app } = await setup();
    expect(app.scramble).toBe('333-1');
    const switching = app.createSession('sq1');
    expect(app.scramble).toBe('');
    const s = await app.addSolve({ ms: 60000, penalty: null, at: t });
    expect(s?.scramble).toBe('');
    await switching;
    expect(app.scramble).toMatch(/^sq1-\d+$/);
  });

  it('uma falha ao limpar a lixeira na abertura não mostra aviso', async () => {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    repo.purgeTrash = async () => { throw new Error('bloqueado'); };
    const app = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: null });
    await app.init();
    expect(app.toast).toBeNull();
    expect(app.scramble).toBe('333-1');
  });

  it('announce zera a região e põe o texto 50 ms depois', async () => {
    const { app } = await setup();
    vi.useFakeTimers();
    try {
      app.announce('Tempo final: 0:58.42.');
      expect(app.live).toBe('');
      vi.advanceTimersByTime(49);
      expect(app.live).toBe('');
      vi.advanceTimersByTime(1);
      expect(app.live).toBe('Tempo final: 0:58.42.');
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Brief 9b: robustez do estado (regras 1 a 3, 6, 7 e 9). Cada caso usa o próprio banco e o próprio relógio falso.

const freshRepo = async (): Promise<Repository> => createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
const appWith = async (repo: Repository, extra: Partial<AppDeps> = {}): Promise<AppState> => {
  const app = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: null, ...extra });
  await app.init();
  return app;
};
const dbError = (name: string): Error => Object.assign(new Error(name), { name });
const newSolve = (ms: number, at = t) => ({ ms, penalty: null, at });

describe('estado do app: robustez (brief 9b)', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  // Regra 1: o id é de quem grava, e a nova tentativa grava com ele.
  it('falha depois de gravar: a nova tentativa usa o mesmo id e o solve fica uma vez em listSolves() e em app.solves', async () => {
    const repo = await freshRepo();
    const app = await appWith(repo);
    const original = repo.addSolve.bind(repo);
    let firstTry = true;
    repo.addSolve = async (s) => {
      const saved = await original(s);
      if (firstTry) {
        firstTry = false;
        throw new Error('resposta perdida');
      }
      return saved;
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull();
      expect(app.savePending).toBe(1);
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      await vi.waitFor(() => expect(app.solves).toHaveLength(1));
      expect(await repo.listSolves()).toHaveLength(1);
      expect(app.meta?.solvesSinceBackup).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Regra 2: reabrir o banco quando a conexão morreu.
  it('InvalidStateError: reabre uma vez, troca o repositório e a fila grava no novo', async () => {
    const broken = await freshRepo();
    const healthy = await freshRepo();
    const reopen = vi.fn(async () => healthy);
    const app = await appWith(broken, { reopen });
    broken.addSolve = async () => { throw dbError('InvalidStateError'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull();
      await vi.waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      await vi.waitFor(() => expect(app.solves).toHaveLength(1));
      expect(await healthy.listSolves()).toHaveLength(1);
      expect(reopen).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('UnknownError e TransactionInactiveError também reabrem o banco', async () => {
    for (const name of ['UnknownError', 'TransactionInactiveError']) {
      const broken = await freshRepo();
      const reopen = vi.fn(async () => broken);
      const app = await appWith(broken, { reopen });
      broken.addSolve = async () => { throw dbError(name); };
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        expect(await app.addSolve(newSolve(60000))).toBeNull();
        await vi.waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
      } finally {
        vi.useRealTimers();
      }
    }
  });

  it('reopen que falha: o repositório antigo segue, a fila tenta de novo nele e o aviso continua até gravar', async () => {
    const repo = await freshRepo();
    const reopen = vi.fn(async () => { throw new Error('sem banco'); });
    const app = await appWith(repo, { reopen });
    const original = repo.addSolve.bind(repo);
    let failOnce = true;
    repo.addSolve = async (s) => {
      if (failOnce) {
        failOnce = false;
        throw dbError('UnknownError');
      }
      return original(s);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull();
      await vi.waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
      expect(app.savePending).toBe(1);
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      await vi.waitFor(() => expect(app.solves).toHaveLength(1));
      expect(await repo.listSolves()).toHaveLength(1);
      expect(reopen).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('uma reabertura em andamento é reaproveitada: a segunda falha não abre outra conexão', async () => {
    const broken = await freshRepo();
    const healthy = await freshRepo();
    let finishOpen!: () => void;
    const gate = new Promise<void>((resolve) => { finishOpen = resolve; });
    const reopen = vi.fn(async () => {
      await gate;
      return healthy;
    });
    const app = await appWith(broken, { reopen });
    broken.addSolve = async () => { throw dbError('InvalidStateError'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull();
      await vi.waitFor(() => expect(reopen).toHaveBeenCalledTimes(1));
      await vi.advanceTimersByTimeAsync(3000); // a nova tentativa falha de novo, enquanto a reabertura ainda não terminou
      expect(app.savePending).toBe(1);
      expect(reopen).toHaveBeenCalledTimes(1);
      finishOpen();
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      await vi.waitFor(() => expect(app.solves).toHaveLength(1));
      expect(await healthy.listSolves()).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('erro que não é de conexão (cota cheia) não reabre o banco', async () => {
    const repo = await freshRepo();
    const reopen = vi.fn(async () => repo);
    const app = await appWith(repo, { reopen });
    repo.addSolve = async () => { throw dbError('QuotaExceededError'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull();
      expect(app.savePending).toBe(1);
      expect(reopen).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Regra 3: vigia de gravação em voo.
  it('uma gravação presa por mais de 5 s liga saveStalled, anuncia o aviso e pede a reabertura; ao gravar, volta a false', async () => {
    const repo = await freshRepo();
    const healthy = await freshRepo();
    const reopen = vi.fn(async () => healthy);
    const app = await appWith(repo, { reopen });
    const original = repo.addSolve.bind(repo);
    let release!: () => void;
    // A escrita começa já (como uma gravação travada, que já está dentro da transação): só a resposta é segurada.
    repo.addSolve = (s) => {
      const write = original(s);
      return new Promise<Solve>((resolve, reject) => {
        release = () => void write.then(resolve, reject);
      });
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      void app.addSolve(newSolve(60000));
      await vi.advanceTimersByTimeAsync(4999);
      expect(app.saveStalled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(app.saveStalled).toBe(true);
      expect(reopen).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(app.live).toBe(T.data.saveFailed);
      release();
      await vi.waitFor(() => expect(app.saveStalled).toBe(false));
      expect(app.savePending).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  // Regra 6: exportação de emergência.
  it('exportData inclui o solve que ainda não foi gravado, com o id que ele receberia', async () => {
    const { app, repo } = await setup();
    repo.addSolve = async () => { throw new Error('quota'); };
    expect(await app.addSolve(newSolve(60000))).toBeNull();
    const data = await app.exportData();
    expect(data).toMatchObject({ format: 'klick', version: 1 });
    expect(data.solves).toHaveLength(1);
    expect(data.solves[0]).toMatchObject({ ms: 60000, scramble: '333-1', event: '333', note: '', createdAt: t, updatedAt: t, deletedAt: null });
    expect(data.solves[0].id).toMatch(/^[0-9a-z]{17}$/);
  });

  it('exportData não duplica o solve que o banco já tem, quando a gravação só pareceu falhar', async () => {
    const { app, repo } = await setup();
    const original = repo.addSolve.bind(repo);
    repo.addSolve = async (s) => {
      await original(s);
      throw new Error('resposta perdida');
    };
    expect(await app.addSolve(newSolve(60000))).toBeNull();
    const data = await app.exportData();
    expect(data.solves.map((x) => x.ms)).toEqual([60000]);
    expect((await repo.listSolves()).map((x) => x.id)).toEqual([data.solves[0].id]);
  });

  it('com o banco quebrado em exportAll, exportData devolve os solves da memória, o pendente e o perfil da memória', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(61000));
    repo.addSolve = async () => { throw new Error('quota'); };
    await app.addSolve(newSolve(62000, t + 1));
    repo.exportAll = async () => { throw new Error('banco quebrado'); };
    const data = await app.exportData();
    expect(data.solves.map((x) => x.ms)).toEqual([61000, 62000]);
    expect(data.sessions.map((x) => x.id)).toEqual(app.sessions.map((x) => x.id));
    expect(data.profile).toEqual(app.profile);
  });

  it('com o banco travado (exportAll não responde), exportData desiste em 5 s e devolve o da memória', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(61000));
    repo.addSolve = async () => { throw new Error('quota'); };
    await app.addSolve(newSolve(62000, t + 1));
    repo.exportAll = () => new Promise<never>(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const exporting = app.exportData();
      await vi.advanceTimersByTimeAsync(4999);
      let done = false;
      void exporting.then(() => { done = true; });
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const data = await exporting;
      expect(data.solves.map((x) => x.ms)).toEqual([61000, 62000]);
    } finally {
      vi.useRealTimers();
    }
  });

  // Regra 7: restaurar cópia pelo estado.
  it('restoreFromBackup com solve que não foi gravado recusa com aviso, devolve false e não mexe no banco', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(61000));
    const backup = await createBackup(repo, 'manual', t);
    repo.addSolve = async () => { throw new Error('quota'); };
    await app.addSolve(newSolve(62000, t + 1));
    expect(app.savePending).toBe(1);
    expect(await app.restoreFromBackup(backup.id)).toBe(false);
    expect(app.toast?.text).toBe(T.data.restoreBlocked);
    expect((await repo.listSolves()).map((x) => x.ms)).toEqual([61000]);
    expect(app.savePending).toBe(1);
  });

  it('restoreFromBackup sem pendentes restaura a cópia, recarrega o estado e devolve true', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    await app.addSolve(newSolve(61000, t + 1));
    expect(app.solves).toHaveLength(2);
    expect(await app.restoreFromBackup(backup.id)).toBe(true);
    expect(app.solves.map((x) => x.ms)).toEqual([60000]);
    expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000]);
  });

  it('restoreFromBackup propaga o erro de restoreBackup (cópia que não existe)', async () => {
    const { app } = await setup();
    await expect(app.restoreFromBackup('nao-existe')).rejects.toThrow('Cópia não encontrada');
  });

  // Regra 9: sobras da revisão da 9a.
  it('apagar a sessão atual zera o embaralhamento antes de gravar, como trocar de sessão', async () => {
    const { app } = await setup();
    expect(app.scramble).toBe('333-1');
    const deleting = app.deleteSession(app.currentSession!.id);
    expect(app.scramble).toBe('');
    await deleting;
    expect(app.scramble).toMatch(/^333-\d+$/);
  });

  it('apagar uma sessão que não é a atual não mexe no embaralhamento', async () => {
    const { app } = await setup();
    await app.createSession('sq1');
    expect(app.scramble).toMatch(/^sq1-\d+$/);
    const other = app.sessions.find((s) => s.event === '333')!;
    await app.deleteSession(other.id);
    expect(app.scramble).toMatch(/^sq1-\d+$/);
  });

  it('a cópia do dia roda em segundo plano: uma cópia lenta não segura o fim do init', async () => {
    const repo = await freshRepo();
    const first = await appWith(repo);
    await first.addSolve(newSolve(60000)); // solvesSinceBackup = 1 e nenhuma cópia hoje: o próximo init pede a cópia do dia
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const saveBackup = repo.saveBackup.bind(repo);
    let started = 0;
    repo.saveBackup = async (record) => {
      started++;
      await gate;
      return saveBackup(record);
    };
    const second = await appWith(repo); // se o init esperasse a cópia, este await não voltaria
    expect(second.scramble).toBe('333-1');
    await vi.waitFor(() => expect(started).toBe(1));
    expect(await repo.listBackups()).toEqual([]);
    release();
    await vi.waitFor(async () => expect(await repo.listBackups()).toHaveLength(1));
    expect((await repo.listBackups())[0].reason).toBe('daily');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Fix round 1 (brief 9b, revisão): fechar a conexão trocada, prazo de gravação, aviso por tentativa, restauração protegida e a
// exportação que lê a fila depois da espera.

describe('estado do app: fix round 1 (brief 9b)', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  // Item 2 (M-1): a conexão antiga é fechada depois da troca; a nova fica aberta.
  it('depois de reabrir, o repositório antigo é fechado e o novo fica aberto', async () => {
    const broken = await freshRepo();
    const healthy = await freshRepo();
    const realClose = broken.close.bind(broken);
    const closeOld = vi.fn(() => realClose());
    broken.close = closeOld;
    const closeNew = vi.spyOn(healthy, 'close');
    const app = await appWith(broken, { reopen: async () => healthy });
    broken.addSolve = async () => { throw dbError('InvalidStateError'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull();
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      expect(closeOld).toHaveBeenCalledTimes(1);
      expect(closeNew).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  // Item 3 (I-1): uma gravação que não responde desiste em 8 s; a fila reabre e grava o mesmo id no repositório novo, junto
  // com o solve que chegou depois da pausa.
  it('gravação sem resposta: em 8 s a tentativa falha com TimeoutError, e a fila grava o mesmo id no repositório novo, junto com o solve seguinte', async () => {
    const broken = await freshRepo();
    // Os repositórios novos abrem antes dos timers falsos: abrir um banco com o relógio parado não termina.
    const replacements = [await freshRepo(), await freshRepo()];
    const opened: Repository[] = [];
    const reopen = vi.fn(async () => {
      const next = replacements[opened.length];
      opened.push(next);
      return next;
    });
    const app = await appWith(broken, { reopen });
    const hung: string[] = [];
    broken.addSolve = (s) => {
      hung.push(s.id!);
      return new Promise<Solve>(() => {});
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const first = app.addSolve(newSolve(60000));
      await vi.advanceTimersByTimeAsync(5000); // a pausa: aviso e primeira reabertura
      expect(app.saveStalled).toBe(true);
      const second = app.addSolve(newSolve(61000, t + 1)); // entra na fila atrás da tentativa presa
      await vi.advanceTimersByTimeAsync(3000); // 8 s: a tentativa desiste (TimeoutError) e a fila reabre de novo
      await vi.waitFor(() => expect(opened).toHaveLength(2));
      expect(await first).toBeNull();
      expect(await second).toBeNull();
      await vi.advanceTimersByTimeAsync(3000); // a nova tentativa grava os dois, no repositório atual
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      await vi.waitFor(() => expect(app.solves).toHaveLength(2));
      const saved = await opened[opened.length - 1].listSolves();
      expect(saved.map((x) => x.id)).toContain(hung[0]);
      expect(saved.map((x) => x.ms)).toEqual([60000, 61000]);
    } finally {
      vi.useRealTimers();
    }
  });

  // Item 4 (M-4): só a tentativa mais recente mexe no aviso. Uma anterior que termina tarde não apaga o aviso de uma presa.
  it('uma tentativa anterior que termina tarde não apaga o aviso de uma tentativa mais nova que está presa', async () => {
    const repo = await freshRepo();
    const app = await appWith(repo);
    const lateAnswers: Array<() => void> = [];
    repo.addSolve = (s) =>
      new Promise<Solve>((resolve) => {
        lateAnswers.push(() => resolve(s as unknown as Solve));
      });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const first = app.addSolve(newSolve(60000));
      await vi.advanceTimersByTimeAsync(5000); // a primeira tentativa está presa
      expect(app.saveStalled).toBe(true);
      await vi.advanceTimersByTimeAsync(3000); // 8 s: ela desiste
      expect(await first).toBeNull();
      await vi.advanceTimersByTimeAsync(3000); // 11 s: a nova tentativa começa
      await vi.advanceTimersByTimeAsync(5000); // 16 s: a nova também está presa
      expect(app.saveStalled).toBe(true);
      lateAnswers[0](); // a primeira responde só agora
      await vi.advanceTimersByTimeAsync(0);
      expect(app.saveStalled).toBe(true);
      expect(app.savePending).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Item 5 (I-3): uma escrita presa durante a restauração não trava a chamada: em 8 s ela recusa com o aviso.
  it('uma escrita presa durante a restauração não trava a chamada: em 8 s ela recusa com o aviso', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    repo.addSolve = () => new Promise<Solve>(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const adding = app.addSolve(newSolve(61000, t + 1));
      await vi.advanceTimersByTimeAsync(0); // a escrita entra na fila antes da restauração
      const restoring = app.restoreFromBackup(backup.id); // espera o flush: a escrita está presa
      await vi.advanceTimersByTimeAsync(8000);
      expect(await restoring).toBe(false);
      expect(app.toast?.text).toBe(T.data.restoreBlocked);
      expect(await adding).toBeNull();
      expect(app.savePending).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  // Item 6 (I-4): uma gravação que chega durante a restauração cai depois do replaceAll, e sobrevive.
  it('uma gravação que chega durante a restauração cai depois do replaceAll e sobrevive', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    let inside = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const replaceAll = repo.replaceAll.bind(repo);
    repo.replaceAll = async (data) => {
      inside = true;
      await gate;
      return replaceAll(data);
    };
    const restoring = app.restoreFromBackup(backup.id);
    await vi.waitFor(() => expect(inside).toBe(true));
    const adding = app.addSolve(newSolve(63000, t + 2)); // chega com a restauração no meio do replaceAll
    await new Promise((resolve) => setTimeout(resolve, 20)); // tempo de sobra para a gravação já estar na fila (ou no banco)
    release();
    expect(await restoring).toBe(true);
    expect(await adding).not.toBeNull();
    expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000, 63000]);
  });

  // Item 7 (M-2): a fila é lida depois da espera do banco; um solve enfileirado enquanto ele responde sai no export.
  it('exportData inclui o solve enfileirado enquanto o banco responde', async () => {
    const { app, repo } = await setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const exportAll = repo.exportAll.bind(repo);
    repo.exportAll = async () => {
      await gate;
      return exportAll();
    };
    const exporting = app.exportData();
    repo.addSolve = async () => { throw new Error('quota'); };
    expect(await app.addSolve(newSolve(62000, t + 1))).toBeNull();
    release();
    const data = await exporting;
    expect(data.solves.map((x) => x.ms)).toEqual([62000]);
  });

  it('com o banco quebrado, exportData também inclui o solve enfileirado durante a espera', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(61000));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    repo.exportAll = async () => {
      await gate;
      throw new Error('banco quebrado');
    };
    const exporting = app.exportData();
    repo.addSolve = async () => { throw new Error('quota'); };
    expect(await app.addSolve(newSolve(62000, t + 1))).toBeNull();
    release();
    const data = await exporting;
    expect(data.solves.map((x) => x.ms)).toEqual([61000, 62000]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Fix round 2 (brief 9b, revisão): prazo da restauração, uma restauração por vez, a troca espera a reabertura em curso, e a
// reabertura tem prazo. Sem sleeps reais: o relógio é falso, ou a espera é por um portão controlado.

describe('estado do app: fix round 2 (brief 9b)', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  // N1: a restauração inteira tem prazo de 30 s. Se a leitura da cópia não responde, a chamada sai com aviso e as gravações andam.
  it('uma restauração que não termina em 30 s devolve false com o aviso de prazo, e uma gravação que chegou durante ela segue', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    repo.getBackup = () => new Promise<never>(() => {}); // o banco não responde à leitura da cópia
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const restoring = app.restoreFromBackup(backup.id);
      await vi.advanceTimersByTimeAsync(0); // a troca está presa na leitura
      const adding = app.addSolve(newSolve(61000, t + 1)); // espera o portão da troca
      await vi.advanceTimersByTimeAsync(29_999);
      expect(app.toast).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      expect(await restoring).toBe(false);
      expect(app.toast?.text).toBe(T.data.restoreTimeout);
      expect(await adding).not.toBeNull(); // o portão abriu: a gravação entrou e foi gravada
      expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000, 61000]);
    } finally {
      vi.useRealTimers();
    }
  });

  // N4: uma restauração já em curso; a segunda sai com false sem mexer no portão (a gravação que espera continua esperando).
  it('uma segunda restauração enquanto outra corre sai com false e não mexe no portão', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    let inside = false;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const replaceAll = repo.replaceAll.bind(repo);
    repo.replaceAll = async (data) => {
      inside = true;
      await gate;
      return replaceAll(data);
    };
    const first = app.restoreFromBackup(backup.id);
    await vi.waitFor(() => expect(inside).toBe(true));
    expect(await app.restoreFromBackup(backup.id)).toBe(false);
    const adding = app.addSolve(newSolve(63000, t + 2)); // o portão da primeira segue fechado para ela
    await vi.waitFor(() => expect(app.unsaved).toBe(true)); // a gravação já entrou na fila
    expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000]);
    release();
    expect(await first).toBe(true);
    expect(await adding).not.toBeNull();
    expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000, 63000]);
  });

  // N2: uma reabertura em curso: a restauração espera por ela e lê o repositório que ela devolveu.
  it('uma restauração espera a reabertura em curso e usa o repositório que ela devolveu', async () => {
    const broken = await freshRepo();
    const healthy = await freshRepo();
    const session = await healthy.createSession({ event: '333' });
    await healthy.addSolve({ sessionId: session.id, event: '333', ms: 59000, penalty: null, at: t, scramble: "R U R'" });
    const backup = await createBackup(healthy, 'manual', t); // a cópia existe só no repositório novo
    let openHealthy!: () => void;
    const gate = new Promise<void>((resolve) => {
      openHealthy = resolve;
    });
    const app = await appWith(broken, { reopen: async () => { await gate; return healthy; } });
    let failedOnce = false;
    const original = broken.addSolve.bind(broken);
    broken.addSolve = async (s) => {
      if (!failedOnce) {
        failedOnce = true;
        throw dbError('InvalidStateError');
      }
      return original(s);
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull(); // a falha abre a reabertura (presa no portão)
      const restoring = app.restoreFromBackup(backup.id);
      let settled = false;
      void restoring.then(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(3000); // a nova tentativa grava no repositório antigo, que ainda está aberto
      await vi.waitFor(() => expect(app.savePending).toBe(0));
      expect(settled).toBe(false); // a restauração ainda espera a reabertura
      openHealthy();
      expect(await restoring).toBe(true);
      // Se a troca tivesse usado o repositório antigo, a cópia não existiria nele e a chamada teria falhado.
      expect((await healthy.listSolves()).map((x) => x.ms)).toEqual([59000]);
    } finally {
      vi.useRealTimers();
    }
  });

  // Reabertura com prazo (item 5): uma reabertura que não responde é desistida em 8 s; a próxima falha pede outra.
  it('uma reabertura que não responde em 8 s é desistida: o repositório atual segue e a próxima falha pede outra', async () => {
    const broken = await freshRepo();
    const reopen = vi.fn(() => new Promise<Repository>(() => {})); // nunca responde
    const app = await appWith(broken, { reopen });
    broken.addSolve = async () => { throw dbError('InvalidStateError'); };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      expect(await app.addSolve(newSolve(60000))).toBeNull(); // falha 1: a reabertura 1 começa e fica presa
      expect(reopen).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(8000); // a reabertura 1 é desistida; as tentativas da fila seguem no repositório atual
      expect(reopen).toHaveBeenCalledTimes(1);
      expect(app.savePending).toBe(1);
      await vi.advanceTimersByTimeAsync(1000); // a próxima falha (9 s) pede outra reabertura
      expect(reopen).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
