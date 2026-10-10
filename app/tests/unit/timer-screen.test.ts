import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ts-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R U` }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('tela do Timer', () => {
  it('mostra o embaralhamento, o tempo zerado e as médias da sessão vazias', async () => {
    const { a } = await app();
    render(TimerScreen, { app: a });
    expect(await screen.findByText('333 R U')).toBeInTheDocument();
    expect(document.querySelector('[data-tiles]')?.textContent).toContain('—');
  });

  it('no 6×6 o tile mostra a média de 3', async () => {
    const { a } = await app();
    await a.createSession('666');
    render(TimerScreen, { app: a });
    expect(await screen.findByText('Média de 3')).toBeInTheDocument();
  });

  it('com gravação pendente, mostra o aviso fixo', async () => {
    const { a, repo } = await app();
    repo.addSolve = async () => { throw new Error('quota'); };
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    render(TimerScreen, { app: a });
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
  });
});

// Extras da 10b: o que a tela faz de verdade com o timer, o aviso e a nota.
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function key(type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
}

// Um solve pelo teclado: segura espaço além do tempo de armar, solta (corre) e para com outra tecla.
async function solveByKeys(): Promise<void> {
  key('keydown', 'Space', ' ');
  await sleep(320);
  key('keyup', 'Space', ' ');
  key('keydown', 'KeyA', 'a');
}

describe('tela do Timer: solve, reação e nota', () => {
  it('o solve já está em app.solves quando a reação começa (gravação antes da reação)', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    // A gravação demora mais que a reação de 500 ms: se a reação viesse antes, a lista ainda estaria vazia.
    const gravar = repo.addSolve.bind(repo);
    repo.addSolve = async (s) => {
      await sleep(800);
      return gravar(s);
    };
    render(TimerScreen, { app: a });
    const vistos: number[] = [];
    const observador = new MutationObserver(() => {
      if (document.body.dataset.cview === 'reaction') vistos.push(a.solves.length);
    });
    observador.observe(document.body, { attributes: true, attributeFilter: ['data-cview'] });
    try {
      await solveByKeys();
      await waitFor(() => expect(vistos.length).toBeGreaterThan(0), { timeout: 4000 });
      expect(vistos[0]).toBe(1);
    } finally {
      observador.disconnect();
    }
  });

  it('segurar além do tempo de armar, sem soltar, põe o timer em pronto (o laço chama tick)', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    key('keydown', 'Space', ' ');
    await waitFor(() => expect(document.body.dataset.tstate).toBe('ready'), { timeout: 1500 });
    key('keyup', 'Space', ' ');
    expect(document.body.dataset.tstate).toBe('running');
    key('keydown', 'KeyA', 'a');
    await waitFor(() => expect(document.body.dataset.tstate).toBe('done'), { timeout: 1500 });
  });

  it('gravação falhou: o aviso fixo aparece e o tempo do timer segue na tela', async () => {
    const { a, repo } = await app();
    await a.updateSettings({ inspection: false });
    repo.addSolve = async () => { throw new Error('quota'); };
    render(TimerScreen, { app: a });
    key('keydown', 'Space', ' ');
    await sleep(320);
    key('keyup', 'Space', ' ');
    await sleep(120);
    key('keydown', 'KeyA', 'a');
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
    // O tempo se pinta no quadro seguinte à falha: espera alguns quadros, senão lê o último valor que o laço pintou antes.
    await sleep(100);
    const tempo = document.querySelector('[data-time]')?.textContent ?? '';
    expect(tempo).toMatch(/^\d:\d\d\.\d\d$/);
    expect(tempo).not.toBe('0:00.00');
  });

  it('com app.saveStalled (gravação presa, sem fila), mostra o aviso fixo', async () => {
    const { a } = await app();
    a.saveStalled = true;
    render(TimerScreen, { app: a });
    expect(await screen.findByText(T.data.saveFailed)).toBeInTheDocument();
  });

  it('no 6×6 o chip "vs média" fala em média de 3, não de 5', async () => {
    const { a } = await app();
    await a.createSession('666');
    const agora = Date.now();
    for (let i = 0; i < 4; i++) {
      await a.addSolve({ ms: 60000 + i * 1000, penalty: null, at: agora - (4 - i) * 1000 });
    }
    render(TimerScreen, { app: a });
    expect(await screen.findByText(/vs média de 3$/)).toBeInTheDocument();
    expect(screen.queryByText(/vs média de 5/)).toBeNull();
  });

  it('enquanto o embaralhamento não chega (app.scramble vazio), mostra "gerando…"', async () => {
    const repo = createRepository(await openKlickDb(`ts-${++n}`), { channel: null });
    const a = new AppState({ repo, queue: createScrambleQueue({ generate: () => new Promise<string>(() => {}) }), storage: null, storageManager: null });
    render(TimerScreen, { app: a });
    expect(screen.getByText('gerando…')).toBeInTheDocument();
  });

  it('Esc no campo de nota fecha o formulário e tira o foco', async () => {
    const { a } = await app();
    await a.updateSettings({ inspection: false });
    render(TimerScreen, { app: a });
    await solveByKeys();
    await waitFor(() => expect(document.querySelector('[data-actions]')).not.toHaveAttribute('hidden'));
    key('keydown', 'KeyM', 'm');
    const form = document.querySelector('[data-noteform]') as HTMLFormElement;
    const campo = screen.getByLabelText('Nota sobre este solve');
    await waitFor(() => expect(form).not.toHaveAttribute('hidden'));
    await waitFor(() => expect(campo).toHaveFocus());
    fireEvent.keyDown(campo, { key: 'Escape', code: 'Escape' });
    expect(form).toHaveAttribute('hidden');
    expect(campo).not.toHaveFocus();
  });
});
