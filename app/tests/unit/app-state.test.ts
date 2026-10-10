import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { parseCsTimer } from '../../src/data/transfer';
import { summaryLines } from '../../src/ui/import-flow';
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
    // A cópia roda em segundo plano (parte B): o addSolve do 50º volta antes dela, então espera-se por ela.
    await vi.waitFor(async () => expect((await repo.listBackups()).map((b) => b.reason)).toEqual(['auto50']));
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

  // Um solve nunca se perde: sem sessão e sem poder criar uma, ele vai para a fila, com o aviso, e sai no export.
  it('sem sessão e sem poder criar uma, o solve fica na fila com o aviso e sai no export', async () => {
    const { app, repo } = await setup();
    app.sessions = [];
    app.profile = { ...app.profile, currentSessionId: null };
    repo.createSession = async () => { throw new Error('quota'); };
    repo.saveProfile = async () => { throw new Error('quota'); };
    repo.addSolve = async () => { throw new Error('quota'); };
    expect(await app.addSolve({ ms: 60000, penalty: null, at: t })).toBeNull();
    expect(app.toast?.text).toBe(T.data.saveFailed);
    expect(app.savePending).toBe(1);
    expect((await app.exportData()).solves.map((x) => x.ms)).toEqual([60000]);
  });

  // O próximo embaralhamento não segura o solve: o gerador pode ficar pendurado sem travar a reação.
  it('addSolve não espera o próximo embaralhamento', async () => {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    const queue = createScrambleQueue({ generate: () => new Promise<string>(() => {}) });
    const app = new AppState({ repo, queue, now, storage: null, storageManager: null });
    await app.init();
    const solve = await app.addSolve({ ms: 60000, penalty: null, at: t });
    expect(solve).not.toBeNull();
    expect(app.solves).toHaveLength(1);
    expect(app.scramble).toBe('');
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

  // N1 (round 3, a): a restauração inteira tem prazo de 30 s. Se a leitura da cópia não responde, a chamada sai com false e o aviso
  // acende; o portão segue fechado, então a gravação de durante a troca fica na memória, sem ser gravada.
  it('uma restauração que não termina em 30 s devolve false com o aviso; o portão segue fechado e a gravação de durante ela fica na memória', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    repo.getBackup = () => new Promise<never>(() => {}); // o banco não responde à leitura da cópia
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const restoring = app.restoreFromBackup(backup.id);
      await vi.advanceTimersByTimeAsync(0); // a troca está presa na leitura
      void app.addSolve(newSolve(61000, t + 1)); // espera o portão, que não abre enquanto a troca não acaba
      await vi.advanceTimersByTimeAsync(29_999);
      expect(app.toast).toBeNull();
      expect(app.saveStalled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await restoring).toBe(false);
      expect(app.toast?.text).toBe(T.data.restoreTimeout);
      expect(app.saveStalled).toBe(true);
      expect(app.unsaved).toBe(true);
      expect(await app.restoreFromBackup(backup.id)).toBe(false); // portão fechado: a segunda chamada sai com false
      expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000]); // a gravação de durante a troca ainda não foi feita
      expect((await app.exportData()).solves.map((x) => x.ms)).toEqual([60000, 61000]); // mas ela está no export
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

// ---------------------------------------------------------------------------------------------------------------------
// Fix round 3: o portão da restauração só abre quando a troca termina de verdade, mesmo depois do prazo. Só a troca que acendeu
// o aviso o apaga. Sem sleeps reais: o relógio é falso e a leitura da cópia é um portão controlado.

describe('estado do app: fix round 3 (brief 9b)', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  // Leitura da cópia presa até o teste liberá-la. Devolve a função que libera.
  const holdRead = (repo: Repository): (() => void) => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getBackup = repo.getBackup.bind(repo);
    repo.getBackup = async (id) => {
      await gate;
      return getBackup(id);
    };
    return () => release();
  };

  // (b) A troca termina depois do prazo: o portão abre, a gravação que esperava cai depois do replaceAll e sobrevive, e o aviso sai.
  it('uma troca que termina depois do prazo abre o portão: a gravação de durante ela cai depois do replaceAll e sobrevive, e o aviso sai', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(59000));
    const backup = await createBackup(repo, 'manual', t); // a cópia tem só o 59000
    await app.addSolve(newSolve(60000, t + 1));
    const openRead = holdRead(repo);
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const restoring = app.restoreFromBackup(backup.id);
      await vi.advanceTimersByTimeAsync(0);
      const adding = app.addSolve(newSolve(61000, t + 2)); // espera o portão
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await restoring).toBe(false);
      expect(app.saveStalled).toBe(true);
      openRead(); // a leitura volta: a troca termina depois do prazo
      expect(await adding).not.toBeNull(); // o portão abriu e a gravação entrou, depois do replaceAll
      expect(app.saveStalled).toBe(false);
      expect((await repo.listSolves()).map((x) => x.ms)).toEqual([59000, 61000]);
    } finally {
      vi.useRealTimers();
    }
  });

  // (c) Só a troca que acendeu o aviso o apaga: um aviso de outra tentativa não é limpo quando a troca termina.
  it('um aviso de gravação presa que não é da troca não é limpo quando a troca termina', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    const openRead = holdRead(repo);
    let reloaded = false;
    const reloadBefore = app.reload.bind(app);
    app.reload = async () => {
      await reloadBefore();
      reloaded = true;
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const restoring = app.restoreFromBackup(backup.id);
      await vi.advanceTimersByTimeAsync(1000);
      app.saveStalled = true; // uma gravação presa de outra tentativa acende o aviso enquanto a troca corre
      await vi.advanceTimersByTimeAsync(29_000); // 30 s: a troca passa do prazo; o aviso é de outra tentativa
      expect(await restoring).toBe(false);
      openRead();
      await vi.waitFor(() => expect(reloaded).toBe(true)); // a troca leu, trocou e recarregou
      await vi.advanceTimersByTimeAsync(0); // o portão abre (fim da troca)
      expect(app.saveStalled).toBe(true); // a troca não apaga um aviso que não é dela
    } finally {
      vi.useRealTimers();
    }
  });

  // (d) Uma troca que falha depois do prazo abre o portão sem mexer nos dados: o aviso não fica para sempre.
  it('uma troca que falha depois do prazo abre o portão sem mexer nos dados', async () => {
    const { app, repo } = await setup();
    await app.addSolve(newSolve(60000));
    const backup = await createBackup(repo, 'manual', t);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    repo.getBackup = async () => {
      await gate;
      return undefined; // a cópia "some": a troca termina com erro
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const restoring = app.restoreFromBackup(backup.id);
      await vi.advanceTimersByTimeAsync(0);
      const adding = app.addSolve(newSolve(61000, t + 1));
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await restoring).toBe(false);
      release();
      expect(await adding).not.toBeNull(); // o portão abriu depois do erro
      expect((await repo.listSolves()).map((x) => x.ms)).toEqual([60000, 61000]);
    } finally {
      vi.useRealTimers();
    }
  });
});

// Arquivo do Klick num aparelho novo: os ajustes, o progresso e a sessão de lá vêm junto (decisão de 10/10).
describe('estado do app: importar o Klick traz os ajustes', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  async function otherDevice() {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    const theirs = await repo.createSession({ event: '444' });
    await repo.addSolve({ sessionId: theirs.id, event: '444', ms: 90000, penalty: null, at: t, scramble: 'R' });
    await repo.saveProfile({ settings: { theme: 'dark', holdMs: 550 }, currentSessionId: theirs.id, onboarded: true });
    return { theirs, data: await repo.exportAll() };
  }

  it('aplica os ajustes, troca para a sessão do arquivo e pede o embaralhamento do evento dela', async () => {
    const { app } = await setup();
    const { theirs, data } = await otherDevice();
    const summary = await app.importKlick(data);
    expect(app.profile.settings).toMatchObject({ theme: 'dark', holdMs: 550 });
    expect(app.currentSession?.id).toBe(theirs.id);
    expect(app.event).toBe('444');
    await vi.waitFor(() => expect(app.scramble).toBe('444-1'));
    expect(summaryLines(summary!)).toContain(T.importDialog.settingsApplied);
  });

  it('arquivo sem perfil não diz que trouxe ajustes', async () => {
    const { app } = await setup();
    const { data } = await otherDevice();
    const summary = await app.importKlick({ ...data, profile: null });
    expect(summaryLines(summary!)).not.toContain(T.importDialog.settingsApplied);
  });
});

// Importação grande não pode perder solve em silêncio (final review, C1): ids únicos, e o que não entrar aparece no resumo.
describe('estado do app: importação sem perda', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  // Um csTimer de n solves numa sessão só, com segundos distintos (o dedupe do csTimer é ms + segundo).
  const csTimerText = (n: number): string =>
    JSON.stringify({
      session1: Array.from({ length: n }, (_, i) => [[0, 60_000 + i], 'R U', '', 1_791_000_000 + i]),
      properties: { sessionData: JSON.stringify({ 1: { name: 'Grande', opt: {} } }) },
    });

  it('importar um csTimer de 5000 solves no mesmo milissegundo grava os 5000, com ids únicos', async () => {
    const { app, repo } = await setup();
    // Pior caso: o sufixo aleatório repete. Só o contador do newId separa os ids.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    let summary;
    try {
      summary = await app.importCsTimer(parseCsTimer(csTimerText(5000)), {});
    } finally {
      random.mockRestore();
    }
    expect(summary).toMatchObject({ solves: 5000, existing: 0, missed: 0 });
    const stored = await repo.listSolves();
    expect(stored).toHaveLength(5000);
    expect(new Set(stored.map((s) => s.id)).size).toBe(5000);
  });

  it('um solve que o repositório deixa de fora (id repetido) conta em missed e o resumo diz quantos não entraram', async () => {
    const { app, repo } = await setup();
    const importAll = repo.importAll.bind(repo);
    vi.spyOn(repo, 'importAll').mockImplementationOnce((data) =>
      importAll({ ...data, solves: [...data.solves, { ...data.solves[0] }] }),
    );
    const summary = await app.importCsTimer(parseCsTimer(csTimerText(5)), {});
    expect(summary).toMatchObject({ solves: 5, existing: 0, missed: 1 });
    expect(summaryLines(summary!)).toContain(T.importDialog.missed(1));
  });

  it('a versão anterior com um solve de fora (id repetido) também conta em missed', async () => {
    const v1 = JSON.stringify({ state: { sessions: [{ id: 'v', name: 'S', puzzleType: '3x3', solves: [
      { id: 'x1', timeMs: 1000, penalty: 'NONE', scramble: 'R', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'x2', timeMs: 2000, penalty: 'NONE', scramble: 'U', createdAt: '2026-01-01T00:01:00Z' },
    ] }] } });
    const { app, repo } = await setup({ getItem: (k) => (k === 'klick-sessions' ? v1 : null) });
    const importAll = repo.importAll.bind(repo);
    vi.spyOn(repo, 'importAll').mockImplementationOnce((data) =>
      importAll({ ...data, solves: [...data.solves, { ...data.solves[0] }] }),
    );
    expect(await app.importV1()).toMatchObject({ solves: 2, missed: 1 });
  });
});

// Sessão que outra aba exclui, evento que muda depois de um reload, pasta com permissão vencida e textos próprios de falha
// (final review, Minor 2, I2 e Minor 8).
describe('estado do app: sessão de outra aba, pasta e textos de falha', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  it('a sessão atual que outra aba excluiu recebe o próximo solve (é revivida), e não a primeira de outro evento', async () => {
    const { app, repo } = await setup();
    await app.createSession('sq1');
    const sq1 = app.currentSession!;
    await repo.deleteSession(sq1.id); // outra aba
    await app.reload();
    const solve = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    expect(solve).toMatchObject({ sessionId: sq1.id, event: 'sq1' });
    expect((await repo.listSessions()).map((s) => s.id)).toContain(sq1.id);
    // A memória acompanha: a sessão revivida volta para a lista e segue como a atual.
    await vi.waitFor(() => expect(app.sessions.map((s) => s.id)).toContain(sq1.id));
    expect(app.currentSession?.id).toBe(sq1.id);
  });

  it('desfazer a exclusão de um solve cuja sessão foi para a lixeira traz a sessão de volta também na memória', async () => {
    const { app, repo } = await setup();
    await app.createSession('sq1');
    const sq1 = app.currentSession!;
    const solve = (await app.addSolve({ ms: 60000, penalty: null, at: t }))!;
    await app.deleteSolve(solve.id);
    await repo.deleteSession(sq1.id); // outra aba excluiu a sessão
    await app.reload();
    expect(app.sessions.map((s) => s.id)).not.toContain(sq1.id);
    expect(await app.undoDelete()).toBe(true);
    await vi.waitFor(() => expect(app.sessions.map((s) => s.id)).toContain(sq1.id));
  });

  it('depois de um reload que troca o evento (outra aba mudou a sessão), o embaralhamento passa a ser do evento novo', async () => {
    const { app, repo } = await setup();
    const first = app.currentSession!;
    await app.createSession('sq1');
    expect(app.event).toBe('sq1');
    await repo.saveProfile({ currentSessionId: first.id }); // outra aba voltou para a 3×3
    await app.reload();
    expect(app.event).toBe('333');
    await vi.waitFor(() => expect(app.scramble).toMatch(/^333-/));
  });

  // Uma pasta de teste: a permissão que o navegador informa e a que ele concede quando pedido; os arquivos gravados ficam em `files`.
  type Perm = 'granted' | 'denied' | 'prompt';
  function fakeFolder(permission: Perm, granted: Perm = 'granted') {
    const files = new Map<string, string>();
    const state = { permission };
    const handle = {
      queryPermission: vi.fn(async () => state.permission),
      requestPermission: vi.fn(async () => {
        state.permission = granted;
        return granted;
      }),
      getFileHandle: async (name: string) => ({
        createWritable: async () => {
          let text = '';
          return {
            write: async (d: string) => {
              text = d;
            },
            close: async () => {
              files.set(name, text);
            },
          };
        },
      }),
    };
    return { handle, files };
  }
  // Um handle de pasta não se guarda no IndexedDB (tem funções, e o clone estrutural recusa): o repositório devolve o de teste.
  function holdFolder(repo: Repository, handle: unknown): void {
    repo.getFolderHandle = async () => handle as never;
    repo.saveFolderHandle = async () => {};
  }
  // Escolhe a pasta pelo seletor (o do navegador, simulado) e grava a primeira cópia nela.
  async function chooseFolder(app: AppState, repo: Repository, handle: unknown): Promise<boolean> {
    holdFolder(repo, handle);
    Object.defineProperty(globalThis, 'showDirectoryPicker', { value: async () => handle, configurable: true, writable: true });
    try {
      return await app.chooseBackupFolder();
    } finally {
      delete (globalThis as { showDirectoryPicker?: unknown }).showDirectoryPicker;
    }
  }

  it('uma cópia na pasta que o navegador não deixa gravar marca a permissão vencida, em vez de pular em silêncio', async () => {
    const { app, repo } = await setup();
    const { handle, files } = fakeFolder('prompt');
    await chooseFolder(app, repo, handle);
    expect(app.folderNeedsPermission).toBe(true);
    expect(files.size).toBe(0);
  });

  it('"Permitir de novo", num clique, grava a cópia devida e tira o aviso', async () => {
    const { app, repo } = await setup();
    const { handle, files } = fakeFolder('prompt', 'granted');
    await chooseFolder(app, repo, handle);
    expect(await app.reauthorizeFolder()).toBe(true);
    expect(handle.requestPermission).toHaveBeenCalledTimes(1);
    expect(files.size).toBe(1);
    expect(app.folderNeedsPermission).toBe(false);
    expect((await repo.getMeta()).lastFolderSaveAt).not.toBeNull();
  });

  it('se o navegador nega de novo, o aviso fica e a pessoa vê que nada mudou', async () => {
    const { app, repo } = await setup();
    const { handle, files } = fakeFolder('prompt', 'denied');
    await chooseFolder(app, repo, handle);
    expect(await app.reauthorizeFolder()).toBe(false);
    expect(files.size).toBe(0);
    expect(app.folderNeedsPermission).toBe(true);
    expect(app.toast?.text).toBe(T.data.folderPermissionDenied);
  });

  it('ao abrir o app, uma pasta sem permissão já aparece como permissão vencida', async () => {
    const { repo } = await setup();
    const { handle } = fakeFolder('prompt');
    holdFolder(repo, handle);
    const again = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: null });
    await again.init();
    await vi.waitFor(() => expect(again.folderNeedsPermission).toBe(true));
  });

  it('um ajuste que não grava mostra o aviso próprio de ajuste, não o de salvar solves', async () => {
    const { app, repo } = await setup();
    repo.saveProfile = async () => { throw new Error('io'); };
    await app.updateSettings({ theme: 'dark' });
    expect(app.toast?.text).toBe(T.data.settingFailed);
  });

  it('uma cópia automática que falha mostra o aviso próprio de cópia', async () => {
    const { app, repo } = await setup();
    repo.saveBackup = async () => { throw new Error('quota'); };
    for (let i = 0; i < 50; i++) await app.addSolve({ ms: 60000 + i, penalty: null, at: t + i });
    // A cópia falha em segundo plano (parte B): o aviso sai depois que o addSolve volta.
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.data.backupFailed));
  });

  it('uma cópia na pasta que falha ao gravar mostra o aviso próprio de cópia na pasta', async () => {
    const { app, repo } = await setup();
    const handle = { getFileHandle: async () => { throw new Error('disco cheio'); } };
    await chooseFolder(app, repo, handle);
    expect(app.toast?.text).toBe(T.data.folderCopyFailed);
  });
});

// Armazenamento persistente: o pedido automático olha o que o navegador diz (storage.persisted), não só a marca gravada, e
// tenta de novo quando o app é instalado ou abre instalado.
describe('estado do app: proteção dos dados (pedido automático)', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  it('com a proteção já concedida pelo navegador, o pedido automático não sai', async () => {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    const persist = vi.fn(async () => true);
    const app = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: { persisted: async () => true, persist } });
    await app.init();
    await app.addSolve({ ms: 60000, penalty: null, at: t });
    expect(persist).not.toHaveBeenCalled();
  });

  it('uma recusa não encerra o assunto: ao ser instalado, o pedido sai de novo', async () => {
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
    const persist = vi.fn(async () => false);
    const app = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: { persisted: async () => false, persist } });
    await app.init();
    await app.addSolve({ ms: 60000, penalty: null, at: t });
    await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    await app.retryPersistence();
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it('aberto instalado (display-mode standalone), pede a proteção na abertura se o navegador ainda não a deu', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(display-mode: standalone)', media: query, onchange: null,
      addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel: null });
      const persist = vi.fn(async () => true);
      const app = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: { persisted: async () => false, persist } });
      await app.init();
      await vi.waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
    } finally {
      window.matchMedia = original;
    }
  });
});

// Escritas próprias atualizam a memória sem reler o banco; um aviso de outra aba relê só o tipo que mudou; a cópia automática
// roda em segundo plano (parte B, I3).
describe('estado do app: escritas próprias e avisos por tipo (parte B)', () => {
  beforeEach(() => { t = 1_791_500_000_000; });

  // 50 000 solves em memória, na ordem de tempo, na sessão atual (o estado que a tela tem num histórico grande).
  function bigHistory(sessionId: string, count = 50_000): Solve[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `h${String(i).padStart(7, '0')}`, sessionId, event: '333' as const, ms: 60_000 + ((i * 37) % 30_000), penalty: null,
      at: t - (count - i) * 60_000, scramble: 'R', note: '', createdAt: 1, updatedAt: 1, deletedAt: null,
    }));
  }

  // Um repositório com canal falso: o teste faz chegar avisos de "outra aba" pelo canal.
  async function withChannel() {
    const channel = { postMessage() {}, onmessage: null as ((ev: { data: unknown }) => void) | null, close() {} };
    const repo = createRepository(await openKlickDb(`app-${++n}`), { now, channel });
    const app = new AppState({ repo, queue: fakeQueue(), now, storage: null, storageManager: null });
    await app.init();
    return { app, repo, channel };
  }

  it('addSolve com 50 000 solves em memória não relê os solves do banco', async () => {
    const { app, repo } = await setup();
    app.solves = bigHistory(app.currentSession!.id);
    const listSolves = vi.spyOn(repo, 'listSolves');
    const solve = await app.addSolve({ ms: 61_000, penalty: null, at: t });
    expect(listSolves).not.toHaveBeenCalled();
    expect(app.solves).toHaveLength(50_001);
    expect(app.solves.at(-1)?.id).toBe(solve!.id);
  });

  it('o solve novo entra na posição da ordem por tempo, também quando cai no meio da lista', async () => {
    const { app } = await setup();
    app.solves = bigHistory(app.currentSession!.id);
    const middle = app.solves[25_000].at + 500; // entre o 25 000º e o 25 001º
    const solve = await app.addSolve({ ms: 61_000, penalty: null, at: middle });
    expect(app.solves.findIndex((s) => s.id === solve!.id)).toBe(25_001);
    const ats = app.solves.map((s) => s.at);
    expect(ats).toEqual([...ats].sort((a, b) => a - b));
  });

  it('um aviso de solves de outra aba relê só os solves', async () => {
    const { app, repo, channel } = await withChannel();
    const spies = {
      listSolves: vi.spyOn(repo, 'listSolves'),
      listSessions: vi.spyOn(repo, 'listSessions'),
      getProfile: vi.spyOn(repo, 'getProfile'),
      getMeta: vi.spyOn(repo, 'getMeta'),
    };
    channel.onmessage!({ data: { kind: 'solves' } });
    await vi.waitFor(() => expect(spies.listSolves).toHaveBeenCalledTimes(1));
    expect(spies.listSessions).not.toHaveBeenCalled();
    expect(spies.getProfile).not.toHaveBeenCalled();
    expect(spies.getMeta).not.toHaveBeenCalled();
  });

  it('um aviso de sessões de outra aba relê só as sessões', async () => {
    const { app, repo, channel } = await withChannel();
    const spies = { listSolves: vi.spyOn(repo, 'listSolves'), listSessions: vi.spyOn(repo, 'listSessions'), getMeta: vi.spyOn(repo, 'getMeta') };
    channel.onmessage!({ data: { kind: 'sessions' } });
    await vi.waitFor(() => expect(spies.listSessions).toHaveBeenCalledTimes(1));
    expect(spies.listSolves).not.toHaveBeenCalled();
    expect(spies.getMeta).not.toHaveBeenCalled();
    expect(app.sessions).toHaveLength(1);
  });

  it('um aviso de solves de outra aba traz o solve que ela gravou', async () => {
    const { app, repo, channel } = await withChannel();
    await repo.addSolve({ id: 'de-outra-aba', sessionId: app.currentSession!.id, event: '333', ms: 70_000, penalty: null, at: t, scramble: 'R' });
    channel.onmessage!({ data: { kind: 'solves' } });
    await vi.waitFor(() => expect(app.solves.map((s) => s.id)).toContain('de-outra-aba'));
  });

  it('a penalidade e a nota atualizam o solve na memória, sem reler os solves', async () => {
    const { app, repo } = await setup();
    const s = (await app.addSolve({ ms: 61_000, penalty: null, at: t }))!;
    const listSolves = vi.spyOn(repo, 'listSolves');
    await app.setPenalty(s.id, '+2');
    await app.setNote(s.id, 'cruz');
    expect(listSolves).not.toHaveBeenCalled();
    expect(app.solves.find((x) => x.id === s.id)).toMatchObject({ penalty: '+2', note: 'cruz' });
  });

  it('apagar um solve o tira da memória sem reler os solves', async () => {
    const { app, repo } = await setup();
    const s = (await app.addSolve({ ms: 61_000, penalty: null, at: t }))!;
    const listSolves = vi.spyOn(repo, 'listSolves');
    await app.deleteSolve(s.id);
    expect(listSolves).not.toHaveBeenCalled();
    expect(app.solves).toEqual([]);
  });

  it('a cópia automática roda em segundo plano: addSolve resolve antes dela', async () => {
    const { app, repo } = await setup();
    for (let i = 0; i < 49; i++) await app.addSolve({ ms: 60_000 + i, penalty: null, at: t + i });
    // A cópia do 50º solve fica presa: o addSolve não pode esperar por ela.
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const exportAll = repo.exportAll.bind(repo);
    repo.exportAll = async (o) => {
      await held;
      return exportAll(o);
    };
    const pending = app.addSolve({ ms: 60_000, penalty: null, at: t + 50 });
    const outcome = await Promise.race([pending.then(() => 'resolveu'), new Promise((r) => setTimeout(() => r('esperou'), 1500))]);
    expect(outcome).toBe('resolveu');
    expect(app.solves).toHaveLength(50);
    release();
    await vi.waitFor(async () => expect(await repo.listBackups()).toHaveLength(1));
  });
});

