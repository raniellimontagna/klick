import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { duelPayloadOf } from '../../src/core/duel/link';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import { askReload, canReloadNow, offerUpdate, reloadIfFree } from '../../src/ui/state/update.svelte';
import UpdatePrompt from '../../src/ui/dialogs/UpdatePrompt.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`up-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

afterEach(() => offerUpdate(null)); // limpa o aviso entre os testes

describe('Aviso de nova versão', () => {
  it('não aparece sem versão nova esperando', async () => {
    const a = await app();
    render(UpdatePrompt, { app: a });
    expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull();
  });

  it('aparece com o timer parado e o botão chama a função de atualizar', async () => {
    const a = await app();
    const apply = vi.fn(async () => {});
    offerUpdate(apply);
    render(UpdatePrompt, { app: a });
    expect(screen.getByText('Nova versão disponível.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Recarregar' }));
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('some enquanto o timer está ocupado e volta quando ele para', async () => {
    const a = await app();
    offerUpdate(async () => {});
    render(UpdatePrompt, { app: a });
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    a.timerBusy = true;
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull());
    a.timerBusy = false;
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument());
  });

  it('some enquanto um solve está em voo ou sem gravar (app.unsaved)', async () => {
    const a = await app();
    offerUpdate(async () => {});
    render(UpdatePrompt, { app: a });
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    a.solvesInFlight = 1;
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull());
    a.solvesInFlight = 0;
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument());
  });

  // A revisão final: recarregar entre o solve do desafio parar e a gravação dele voltar perderia o solve; com B conferindo a penalidade, a
  // escolha dele (+2, DNF) ainda está só na memória. As duas coisas contam em app.unsaved, como um solve em voo.
  it('some enquanto uma gravação do desafio está em voo e enquanto B confere a penalidade', async () => {
    const repo = createRepository(await openKlickDb(`up-${++n}`), { channel: null });
    const a = new AppState({
      repo,
      queue: createScrambleQueue({ generate: async () => 'R U' }),
      storage: null,
      storageManager: null,
      duel: { generate: async (ev) => `${ev} R U` },
    });
    await a.init();
    offerUpdate(async () => {});
    render(UpdatePrompt, { app: a });
    await a.duel.start('333');
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    // A gravação do solve presa: da hora em que o timer para até ela voltar.
    const saveDuel = repo.saveDuel.bind(repo);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    repo.saveDuel = async (...args) => {
      await gate;
      return saveDuel(...args);
    };
    const recording = a.duel.record({ ms: 10_000, penalty: null });
    expect(a.unsaved).toBe(true); // na hora do pedido, antes de a fila chegar à gravação
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull());
    release();
    await recording;
    expect(a.unsaved).toBe(false);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument());
    repo.saveDuel = saveDuel;

    // B, com o solve gravado e o ponto ainda por ver: a penalidade dele está só na memória até "Ver o ponto".
    for (let i = 1; i < 7; i++) await a.duel.record({ ms: 10_000, penalty: null });
    const url = (await a.duel.challengeUrl('https://klick.test'))!;
    a.duel.exit();
    await a.duel.openLink(duelPayloadOf(new URL(url).hash)!); // o próprio link: own, nada a conferir
    expect(a.unsaved).toBe(false);
    const b = new AppState({
      repo: createRepository(await openKlickDb(`up-${++n}`), { channel: null }),
      queue: createScrambleQueue({ generate: async () => 'R U' }),
      storage: null,
      storageManager: null,
    });
    await b.init();
    await b.duel.openLink(duelPayloadOf(new URL(url).hash)!);
    await b.duel.accept();
    await b.duel.record({ ms: 9_000, penalty: null });
    expect(b.duel.phase).toBe('confirm');
    expect(b.unsaved).toBe(true);
    await b.duel.setPenalty('+2');
    expect(b.unsaved).toBe(true);
    await b.duel.reveal();
    expect(b.duel.phase).toBe('reveal');
    expect(b.unsaved).toBe(false);
  });

  it('a região de status existe sempre, e o texto entra só quando há versão nova', async () => {
    const a = await app();
    render(UpdatePrompt, { app: a });
    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('');
    offerUpdate(async () => {});
    await vi.waitFor(() => expect(region).toHaveTextContent('Nova versão disponível.'));
    expect(screen.getByRole('status')).toBe(region);
  });
});

// Outra aba aceitou a versão nova: esta só recarrega com a tela livre (timer parado, sem espaço segurado, sem solve por gravar).
describe('Recarregar só com a tela livre', () => {
  const free = { timerBusy: false, pendingInspect: false, unsaved: false };
  afterEach(() => {
    reloadIfFree(free, () => {}); // zera um pedido que o teste deixou
  });

  it('a regra só deixa recarregar com as três condições falsas', () => {
    expect(canReloadNow(free)).toBe(true);
    expect(canReloadNow({ ...free, timerBusy: true })).toBe(false);
    expect(canReloadNow({ ...free, pendingInspect: true })).toBe(false);
    expect(canReloadNow({ ...free, unsaved: true })).toBe(false);
  });

  it('sem pedido, não recarrega', () => {
    const reload = vi.fn();
    expect(reloadIfFree(free, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    ['o timer está ocupado', { ...free, timerBusy: true }],
    ['há espaço segurado antes da inspeção', { ...free, pendingInspect: true }],
    ['um solve está em voo ou sem gravar', { ...free, unsaved: true }],
  ])('com pedido e %s, adia: não recarrega, e recarrega quando a tela fica livre', (_label, busy) => {
    askReload();
    const reload = vi.fn();
    expect(reloadIfFree(busy, reload)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(reloadIfFree(free, reload)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('recarrega uma vez só: o pedido sai junto com o recarregamento', () => {
    askReload();
    const reload = vi.fn();
    expect(reloadIfFree(free, reload)).toBe(true);
    expect(reloadIfFree(free, reload)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('o aviso some enquanto o espaço segura antes da inspeção (app.pendingInspect), como com o timer ocupado', async () => {
    const a = await app();
    offerUpdate(async () => {});
    render(UpdatePrompt, { app: a });
    expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument();
    a.pendingInspect = true;
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Recarregar' })).toBeNull());
    a.pendingInspect = false;
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Recarregar' })).toBeInTheDocument());
  });
});
