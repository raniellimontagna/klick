import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository, type Repository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

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
    expect(app.scramble).toBe('333-1');
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
