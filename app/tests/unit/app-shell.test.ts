import { render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

// Os testes da casca trocam o boot por um próprio (hooks.boot); sem ele, o boot padrão abre um banco de teste.
const hooks = vi.hoisted(() => ({ boot: null as null | (() => Promise<unknown>) }));

vi.mock('../../src/ui/state/boot', async () => {
  const { openKlickDb } = await import('../../src/data/db');
  const { createRepository } = await import('../../src/data/repository');
  const { createScrambleQueue } = await import('../../src/scramble/queue');
  const { AppState } = await import('../../src/ui/state/app.svelte');
  return {
    boot: async () => {
      if (hooks.boot) return hooks.boot();
      const repo = createRepository(await openKlickDb('shell'), { channel: null });
      // Perfil já apresentado: o tour da primeira vez não abre por cima destes testes (eles não tratam dele).
      await repo.saveProfile({ onboarded: true });
      const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
      await app.init();
      return app;
    },
  };
});

import App from '../../src/ui/App.svelte';

describe('casca do app', () => {
  it('trocar de aba volta ao topo da página: a aba nova não abre no meio, na rolagem da anterior', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      render(App);
      await screen.findByRole('button', { name: 'Timer' });
      scrollTo.mockClear();
      screen.getAllByRole('button', { name: 'Evolução' })[0].click();
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
      scrollTo.mockClear();
      screen.getAllByRole('button', { name: 'Ajustes' })[0].click();
      await waitFor(() => expect(scrollTo).toHaveBeenCalledWith(0, 0));
    } finally {
      scrollTo.mockRestore();
    }
    // O primeiro teste do arquivo paga a primeira montagem do app inteiro e das telas do Evolução e do Ajustes: ~1,5 s com a suíte em
    // paralelo, e mais de 5 s com a máquina ocupada.
  }, 15_000);

  it('abrir o app não mexe na rolagem (só a troca de aba volta ao topo)', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      render(App);
      await screen.findByRole('button', { name: 'Timer' });
      await tick();
      expect(scrollTo).not.toHaveBeenCalled();
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('mostra as quatro abas e a tela do Timer', async () => {
    render(App);
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Evolução', 'Centro', 'Ajustes']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-screen="timer"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

// Brief 9b: prazo do boot (regra 4), toast sem role (regra 9), beforeunload com pendentes (regra 5).
let dbn = 0;
async function makeApp({ failSave = false }: { failSave?: boolean } = {}): Promise<AppState> {
  const repo = createRepository(await openKlickDb(`shell-${++dbn}`), { channel: null });
  await repo.saveProfile({ onboarded: true });
  const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
  await app.init();
  if (failSave) repo.addSolve = async () => { throw new Error('quota'); };
  return app;
}

// Dispara o evento e devolve o próprio evento, para ler defaultPrevented.
function leave(): Event {
  const e = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(e);
  return e;
}

describe('casca do app: robustez (brief 9b)', () => {
  afterEach(() => {
    hooks.boot = null;
  });

  it('se o banco não abre em 8 s, mostra o aviso de indisponível no lugar do fundo', async () => {
    hooks.boot = () => new Promise<never>(() => {});
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render(App);
      await tick();
      await vi.advanceTimersByTimeAsync(7999);
      expect(screen.queryByRole('alert')).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      await tick();
      expect(screen.getByRole('alert')).toHaveTextContent(T.data.dbUnavailable);
    } finally {
      vi.useRealTimers();
    }
  });

  it('um boot que termina depois do prazo põe a casca no lugar do aviso', async () => {
    const app = await makeApp();
    let finish!: (ready: AppState) => void;
    hooks.boot = () => new Promise<AppState>((resolve) => { finish = resolve; });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render(App);
      await tick();
      await vi.advanceTimersByTimeAsync(8000);
      await tick();
      expect(screen.getByRole('alert')).toHaveTextContent(T.data.dbUnavailable);
      finish(app);
      await vi.advanceTimersByTimeAsync(0);
      await tick();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    } finally {
      vi.useRealTimers();
    }
  });

  it('o aviso (toast) não tem role=status: o anúncio sai só pela região aria-live', async () => {
    const app = await makeApp();
    hooks.boot = async () => app;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    app.showToast('Solve excluído');
    await tick();
    expect(document.querySelector('.toast')).not.toHaveAttribute('role');
    await waitFor(() => expect(document.querySelector('[data-live]')).toHaveTextContent('Solve excluído'));
  });

  it('fechar a aba sem solve pendente não pede confirmação', async () => {
    const app = await makeApp();
    hooks.boot = async () => app;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    expect(leave().defaultPrevented).toBe(false);
  });

  it('fechar a aba com solve que não foi salvo pede confirmação', async () => {
    const app = await makeApp({ failSave: true });
    await app.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    expect(app.savePending).toBe(1);
    hooks.boot = async () => app;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    expect(leave().defaultPrevented).toBe(true);
  });

  it('depois de desmontar a casca, o beforeunload não é mais ouvido', async () => {
    const app = await makeApp({ failSave: true });
    await app.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    hooks.boot = async () => app;
    const { unmount } = render(App);
    await screen.findByRole('button', { name: 'Timer' });
    unmount();
    expect(leave().defaultPrevented).toBe(false);
  });

  it('ao ser instalado (appinstalled), a casca pede a proteção dos dados de novo', async () => {
    const app = await makeApp();
    const retry = vi.spyOn(app, 'retryPersistence');
    hooks.boot = async () => app;
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    window.dispatchEvent(new Event('appinstalled'));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('o seletor do tour e o de Seus dados têm rótulos distintos (leitor de tela)', async () => {
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    const tour = document.querySelector('[data-import-input]');
    expect(tour?.getAttribute('aria-label')).toBe(T.onboarding.importFileTour);
    expect(T.onboarding.importFileTour).not.toBe(T.dados.importFile);
  });
});
