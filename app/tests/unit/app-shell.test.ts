import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';
import { encodeDuelLink } from '../../src/core/duel/link';
import type { DuelLink } from '../../src/core/types';
import { DB_NAME, openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import { dbEvents, setDbUpgrade, trackingUpgrade } from '../../src/ui/state/db-notice.svelte';

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

  it('mostra as cinco abas, na ordem do atalho, e a tela do Timer', async () => {
    render(App);
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    const names = [...document.querySelectorAll<HTMLButtonElement>('nav.tabs button')].map((b) => b.textContent?.trim());
    expect(names).toEqual(['Timer', 'Evolução', 'Trilha', 'Centro', 'Ajustes']);
    expect(document.querySelectorAll('nav.tabbar button')).toHaveLength(5);
    expect(document.querySelector('[data-screen="timer"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});

describe('a aba Trilha', () => {
  it('se o pedaço da Trilha não carrega: uma linha de erro com "Tentar de novo", que refaz o import', async () => {
    let calls = 0;
    const loadTrilha = () => (++calls === 1 ? Promise.reject(new Error('offline')) : import('../../src/ui/trilha/TrilhaScreen.svelte'));
    render(App, { loadTrilha });
    await screen.findByRole('button', { name: 'Timer' });
    screen.getAllByRole('button', { name: 'Trilha' })[0].click();
    expect(await screen.findByRole('alert')).toHaveTextContent(T.trilha.loadFailed);
    screen.getByRole('button', { name: T.trilha.retry }).click();
    expect(await screen.findByText('0 de 9 etapas', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('se a nova tentativa também falha (o navegador guardou a falha do import): a linha oferece recarregar a página', async () => {
    // O jsdom não deixa trocar o reload do location dele: o location global vira uma cópia com o reload espiado.
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    try {
      let calls = 0;
      const loadTrilha = () => {
        calls++;
        return Promise.reject(new Error('offline'));
      };
      render(App, { loadTrilha });
      await screen.findByRole('button', { name: 'Timer' });
      screen.getAllByRole('button', { name: 'Trilha' })[0].click();
      expect(await screen.findByRole('alert')).toHaveTextContent(T.trilha.loadFailed);
      const retry = screen.getByRole('button', { name: T.trilha.retry });
      retry.focus();
      retry.click();
      const again = await screen.findByRole('button', { name: T.trilha.reload });
      expect(calls).toBe(2);
      expect(screen.getByRole('alert')).toHaveTextContent(T.trilha.loadFailedAgain);
      expect(screen.queryByRole('button', { name: T.trilha.retry })).toBeNull();
      // O botão de tentar de novo sumiu com o clique: o foco vai para o de recarregar, não fica no body.
      expect(document.activeElement).toBe(again);
      again.click();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('a tecla 3 abre a Trilha (carregada na hora) e a 4 o Centro', async () => {
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit3', key: '3', bubbles: true }));
    // A aba Trilha carrega sob demanda (spec 9.5): na primeira vez do arquivo, o pedaço dela ainda passa pelo Vite.
    expect(await screen.findByText('0 de 9 etapas', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(document.querySelector('[data-screen="trilha"]')).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit4', key: '4', bubbles: true }));
    await waitFor(() => expect(document.querySelector('[data-screen="companion"]')).not.toBeNull());
    expect(document.querySelector('[data-screen="trilha"]')).toBeNull();
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

  // A migração para a versão 3 pode passar dos 8 s num aparelho antigo com muito histórico; recarregar a aborta. Enquanto ela roda, a casca
  // não desiste: diz que está atualizando. O prazo recomeça inteiro quando ela termina.
  it('atualizando os dados: passa dos 8 s sem o aviso de indisponível, com o aviso calmo; depois da atualização, o prazo recomeça', async () => {
    hooks.boot = () => {
      dbEvents(() => null).upgrading?.();
      return new Promise<never>(() => {});
    };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      render(App);
      await tick();
      expect(screen.getByRole('status')).toHaveTextContent(T.data.upgrading);
      await vi.advanceTimersByTimeAsync(60_000);
      await tick();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(T.data.upgrading);
      setDbUpgrade('idle'); // a atualização terminou, e o resto da abertura não
      await tick();
      await vi.advanceTimersByTimeAsync(7999);
      expect(screen.queryByRole('alert')).toBeNull();
      await vi.advanceTimersByTimeAsync(1);
      await tick();
      expect(screen.getByRole('alert')).toHaveTextContent(T.data.dbUnavailable);
    } finally {
      vi.useRealTimers();
      setDbUpgrade('idle');
    }
  });

  it('a atualização dos dados falha (cota cheia ou abortada): o aviso diz que os dados estão como estavam, não que o armazenamento foi bloqueado', async () => {
    for (const name of ['QuotaExceededError', 'AbortError']) {
      hooks.boot = () =>
        trackingUpgrade(
          (async () => {
            dbEvents(() => null).upgrading?.();
            throw new DOMException('falhou', name);
          })(),
        );
      const { unmount } = render(App);
      expect(await screen.findByRole('alert')).toHaveTextContent(T.data.upgradeFailed);
      expect(screen.queryByText(T.data.dbUnavailable)).toBeNull();
      unmount();
      setDbUpgrade('idle');
    }
  });

  // A atualização que falhou deixa o banco na versão de antes. Aqui ele nasce na versão 2, com um solve, uma sessão e um treino.
  async function stuckDevice(): Promise<void> {
    const db = await openKlickDb(DB_NAME, {}, 2);
    await db.put('sessions', { id: 's1', name: 'Principal', event: '333', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null } as never);
    await db.put('solves', { id: 'v1', sessionId: 's1', event: '333', ms: 31_000, penalty: null, at: 2, scramble: 'R U', note: '', createdAt: 2, updatedAt: 2, deletedAt: null } as never);
    await db.put('practice', { id: 'p1', caseId: 'oll2-sune', ms: 2500, ok: true, helped: false, at: 3 } as never);
    db.close();
  }
  const failUpgrade = (): void => {
    hooks.boot = () =>
      trackingUpgrade(
        (async () => {
          dbEvents(() => null).upgrading?.();
          throw new DOMException('falhou', 'QuotaExceededError');
        })(),
      );
  };
  const urlApi = URL as unknown as Record<string, unknown>;
  // O jsdom não tem URL.createObjectURL nem clica em link: guarda o blob e o nome que iriam para o download.
  function captureDownloads(): { blobs: Blob[]; names: string[] } {
    const got = { blobs: [] as Blob[], names: [] as string[] };
    urlApi.createObjectURL = (blob: Blob) => (got.blobs.push(blob), 'blob:klick');
    urlApi.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      got.names.push(this.download);
    });
    return got;
  }
  const readBlob = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });

  it('a atualização que falhou oferece exportar (baixa klick-*.json) e tentar de novo (recarrega)', async () => {
    await stuckDevice();
    failUpgrade();
    const got = captureDownloads();
    const reload = vi.fn();
    try {
      render(App, { reload });
      expect(await screen.findByRole('alert')).toHaveTextContent(T.data.upgradeFailed);
      screen.getByRole('button', { name: T.data.upgradeExport }).click();
      await waitFor(() => expect(got.names).toHaveLength(1));
      expect(got.names[0]).toMatch(/^klick-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
      const file = JSON.parse(await readBlob(got.blobs[0])) as { format: string; sessions: unknown[]; solves: unknown[]; practice: unknown[] };
      expect(file).toMatchObject({ format: 'klick', version: 1 });
      expect([file.sessions.length, file.solves.length, file.practice.length]).toEqual([1, 1, 1]);
      expect(screen.queryByText(T.data.upgradeExportFailed)).toBeNull();
      expect(reload).not.toHaveBeenCalled();
      screen.getByRole('button', { name: T.data.upgradeRetry }).click();
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      delete urlApi.createObjectURL;
      delete urlApi.revokeObjectURL;
      vi.restoreAllMocks();
      setDbUpgrade('idle');
    }
  });

  it('a leitura que falha mostra upgradeExportFailed', async () => {
    failUpgrade();
    const got = captureDownloads();
    const reload = vi.fn();
    try {
      render(App, { reload });
      await screen.findByRole('alert');
      const open = vi.spyOn(indexedDB, 'open').mockImplementation(() => {
        throw new DOMException('sem espaço', 'QuotaExceededError');
      });
      screen.getByRole('button', { name: T.data.upgradeExport }).click();
      expect(await screen.findByText(T.data.upgradeExportFailed)).toBeInTheDocument();
      expect(open).toHaveBeenCalled();
      expect(got.names).toEqual([]);
      // Os dois botões continuam: dá para tentar de novo, e a próxima leitura (que agora funciona) baixa o arquivo.
      expect(screen.getByRole('button', { name: T.data.upgradeRetry })).toBeInTheDocument();
      open.mockRestore();
      screen.getByRole('button', { name: T.data.upgradeExport }).click();
      await waitFor(() => expect(got.names).toHaveLength(1));
      expect(screen.queryByText(T.data.upgradeExportFailed)).toBeNull();
    } finally {
      delete urlApi.createObjectURL;
      delete urlApi.revokeObjectURL;
      vi.restoreAllMocks();
      setDbUpgrade('idle');
    }
  });

  it('o download que falha mostra upgradeDownloadFailed (não o de leitura) e mantém os dois botões', async () => {
    await stuckDevice();
    failUpgrade();
    // Sem URL.createObjectURL (o jsdom não tem), o downloadText devolve false: a leitura deu certo, o arquivo é que não saiu.
    delete urlApi.createObjectURL;
    try {
      render(App, { reload: vi.fn() });
      await screen.findByRole('alert');
      screen.getByRole('button', { name: T.data.upgradeExport }).click();
      expect(await screen.findByText(T.data.upgradeDownloadFailed)).toBeInTheDocument();
      expect(screen.queryByText(T.data.upgradeExportFailed)).toBeNull();
      expect(screen.getByRole('button', { name: T.data.upgradeExport })).toBeEnabled();
      expect(screen.getByRole('button', { name: T.data.upgradeRetry })).toBeInTheDocument();
    } finally {
      vi.restoreAllMocks();
      setDbUpgrade('idle');
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

// O link do desafio ao abrir (spec do desafio, seção 4; a maquete aprovada, 5 e 10): `#desafio=` no boot e no hashchange, e o fragmento sai
// da barra (recarregar não abre o mesmo aviso de novo).
describe('casca do app: o link do desafio', () => {
  const SCRAMBLES = Array.from({ length: 7 }, (_, i) => `R U R' U' F${i}`);
  const LINK: DuelLink = {
    v: 1,
    id: 'abcdefgh12345678',
    event: '333',
    scrambles: SCRAMBLES,
    a: { name: 'Ranielli', times: SCRAMBLES.map((_, i) => ({ ms: 12_000 + i, penalty: null })) },
  };

  // Um aparelho sem inspeção e sem tempo de armar: o solve pelo teclado fica síncrono.
  async function duelDevice({ onboarded = true }: { onboarded?: boolean } = {}) {
    const repo = createRepository(await openKlickDb(`shell-dz-${++dbn}`), { channel: null });
    if (onboarded) await repo.saveProfile({ onboarded: true });
    const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
    await app.init();
    await app.updateSettings({ inspection: false, holdMs: 0 });
    hooks.boot = async () => app;
    return { app, repo };
  }

  const key = (type: 'keydown' | 'keyup', code: string, k: string): void => {
    document.body.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
  };
  const hashChanged = (): Promise<void> => new Promise((resolve) => window.addEventListener('hashchange', () => resolve(), { once: true }));

  afterEach(() => {
    hooks.boot = null;
    history.replaceState(null, '', '/');
  });

  it('abrir com #desafio= abre o desafio e limpa o fragmento', async () => {
    const { app } = await duelDevice();
    history.replaceState(null, '', `/?de=zap#desafio=${await encodeDuelLink(LINK)}`);
    render(App);
    const invite = await screen.findByRole('dialog', { name: 'Ranielli te desafiou' });
    // O fragmento saiu da barra; o caminho e a busca ficam.
    expect(location.hash).toBe('');
    expect(`${location.pathname}${location.search}`).toBe('/?de=zap');
    await fireEvent.click(within(invite).getByRole('button', { name: T.duel.accept }));
    await waitFor(() => expect(app.duel.phase).toBe('solving'));
    expect(app.duel.current).toMatchObject({ side: 'b', theirName: 'Ranielli' });
  });

  it('#desafio= torto mostra o aviso e não grava nada', async () => {
    const { app, repo } = await duelDevice();
    history.replaceState(null, '', '/#desafio=isto-nao-e-um-desafio');
    render(App);
    const alert = await screen.findByRole('alertdialog', { name: T.duel.invalidTitle });
    expect(location.hash).toBe('');
    expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    // Fechar volta ao Timer, e recarregar não abriria o aviso de novo (o fragmento já saiu).
    await fireEvent.click(within(alert).getByRole('button', { name: T.duel.close }));
    expect(app.duel.phase).toBe('idle');
    expect(location.hash).toBe('');
  });

  it('um hashchange com desafio abre a tela com o app já aberto', async () => {
    const { app } = await duelDevice();
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    app.tab = 'evolucao'; // o link chega com outra aba aberta: o convite e o desafio são do Timer
    await tick();
    const changed = hashChanged();
    location.hash = `#desafio=${await encodeDuelLink(LINK)}`;
    await changed;
    await screen.findByRole('dialog', { name: 'Ranielli te desafiou' });
    expect(app.tab).toBe('timer');
    expect(location.hash).toBe('');
    // Outro fragmento qualquer não é desafio: nada muda.
    await fireEvent.click(screen.getByRole('button', { name: T.duel.notNow }));
    const other = hashChanged();
    location.hash = '#main';
    await other;
    await tick();
    expect(app.duel.phase).toBe('idle');
    expect(location.hash).toBe('#main');
  });

  // A decisão do primeiro toque: um link que chega com o timer ocupado (a inspeção, o solve) espera ele parar. Com o timer rodando, o
  // primeiro toque em qualquer lugar para o solve e é engolido; o convite por cima perderia esse toque.
  it('um link aberto com o timer rodando espera o solve parar, e o primeiro toque no convite vale', async () => {
    const { app } = await duelDevice();
    render(App);
    await screen.findByRole('button', { name: 'Timer' });
    key('keydown', 'Space', ' ');
    key('keyup', 'Space', ' ');
    await waitFor(() => expect(app.timerBusy).toBe(true));
    const changed = hashChanged();
    location.hash = `#desafio=${await encodeDuelLink(LINK)}`;
    await changed;
    await new Promise((resolve) => setTimeout(resolve, 50)); // o tempo de ler o link, se ele não esperasse
    expect(location.hash).toBe(''); // lido e tirado da barra, esperando
    expect(app.timerBusy).toBe(true);
    expect(app.duel.phase).toBe('idle');
    expect(screen.queryByRole('dialog', { name: 'Ranielli te desafiou' })).toBeNull();
    key('keydown', 'KeyA', 'a'); // o solve para: é um solve de sempre
    const invite = await screen.findByRole('dialog', { name: 'Ranielli te desafiou' });
    await waitFor(() => expect(app.solves).toHaveLength(1));
    const accept = within(invite).getByRole('button', { name: T.duel.accept });
    await fireEvent.pointerDown(accept);
    await fireEvent.click(accept);
    await waitFor(() => expect(app.duel.phase).toBe('solving'));
  });

  // Um erro ao ler o link (aqui, o navegador recusa mexer no histórico) não derruba a abertura: a casca abre, e o desafio mostra o aviso.
  it('um erro ao ler o link no boot não vira o aviso de banco indisponível: o desafio mostra que não abre', async () => {
    const { app, repo } = await duelDevice();
    history.replaceState(null, '', `/#desafio=${await encodeDuelLink(LINK)}`);
    const replace = vi.spyOn(history, 'replaceState').mockImplementation(() => {
      throw new DOMException('negado', 'SecurityError');
    });
    try {
      render(App);
      expect(await screen.findByRole('alertdialog', { name: T.duel.invalidTitle })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Timer' })).toBeInTheDocument();
      expect(screen.queryByText(T.data.dbUnavailable)).toBeNull();
      expect(app.duel.phase).toBe('invalid');
      expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    } finally {
      replace.mockRestore();
    }
  });

  it('a primeira visita por um link vai direto ao desafio, e a apresentação fica para depois', async () => {
    const { app } = await duelDevice({ onboarded: false });
    history.replaceState(null, '', `/#desafio=${await encodeDuelLink(LINK)}`);
    render(App);
    await screen.findByRole('dialog', { name: 'Ranielli te desafiou' });
    expect(app.dialog).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.notNow }));
    await waitFor(() => expect(app.dialog).toBe('onboarding'));
  });
});
