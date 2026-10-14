import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import TrilhaScreen from '../../src/ui/trilha/TrilhaScreen.svelte';

// O animador de verdade, com os gatilhos e o modo anotados: a tela não expõe o animador do Centro pequeno.
const spy = vi.hoisted(() => ({ triggers: [] as string[], animated: [] as boolean[] }));
vi.mock('../../src/ui/centro/animator', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/ui/centro/animator')>();
  return {
    ...mod,
    createCentroAnimator: (opts: Parameters<typeof mod.createCentroAnimator>[0]) => {
      const animator = mod.createCentroAnimator(opts);
      return {
        ...animator,
        trigger(kind: Parameters<typeof animator.trigger>[0]): void {
          spy.triggers.push(kind);
          animator.trigger(kind);
        },
        setAnimated(on: boolean): void {
          spy.animated.push(on);
          animator.setAnimated(on);
        },
      };
    },
  };
});

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`tri-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  a.tab = 'trilha';
  return { a, repo };
}

beforeEach(() => {
  spy.triggers = [];
  spy.animated = [];
});

describe('aba Trilha: o começo (spec 8.2)', () => {
  it('mostra o progresso, a próxima etapa e as 9 etapas com o estado de cada uma', async () => {
    const { a } = await app();
    await a.setTrail([0], true);
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('1 de 9 etapas')).toBeInTheDocument();
    const next = document.querySelector('[data-next-step]') as HTMLElement;
    expect(next).toHaveTextContent('Cantos brancos');
    expect(screen.getByRole('button', { name: 'Começar a aula' })).toBeInTheDocument();
    const states = [...document.querySelectorAll('[data-steps] li em')].map((e) => e.textContent);
    expect(states).toEqual(['feita', 'atual', 'à frente', 'à frente', 'à frente', 'à frente', 'à frente', 'à frente', 'à frente']);
  });

  it('a aula que parou no meio aparece como "Continuar do passo N"; tocar abre a aula', async () => {
    const { a } = await app();
    await a.setLessonAt(0, 2);
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar do passo 3' }));
    expect(a.trailView).toEqual({ kind: 'lesson', step: 0 });
  });

  it('um passo guardado além do fim aparece como o último passo da aula (como o leitor abre)', async () => {
    const { a } = await app();
    await a.setLessonAt(0, 40);
    render(TrilhaScreen, { app: a });
    expect(await screen.findByRole('button', { name: 'Continuar do passo 8' })).toBeInTheDocument();
  });

  it('tocar no nome de uma etapa abre a aula dela, feita ou não', async () => {
    const { a } = await app();
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'PLL em 2 passos' }));
    expect(a.trailView).toEqual({ kind: 'lesson', step: 7 });
  });

  it('"já sei" grava a etapa e pisca a face lateral; "desfazer" tira, sem piscar', async () => {
    const { a, repo } = await app();
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Cruz branca: já sei' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(true));
    await waitFor(() => expect(spy.triggers).toEqual(['trailStep']));
    await fireEvent.click(await screen.findByRole('button', { name: 'Cruz branca: desfazer' }));
    await waitFor(async () => expect((await repo.getProfile()).trail[0]).toBe(false));
    expect(spy.triggers).toEqual(['trailStep']);
  });

  it('no modo estático, o Centro pequeno fica parado (a etapa só acende)', async () => {
    const { a } = await app();
    await a.updateSettings({ centro: 'estatico' });
    render(TrilhaScreen, { app: a });
    await screen.findByText('0 de 9 etapas');
    await waitFor(() => expect(spy.animated.at(-1)).toBe(false));
  });

  it('com as 9 feitas, o cartão da próxima etapa dá lugar ao treino', async () => {
    const { a } = await app();
    await a.setTrail([0, 1, 2, 3, 4, 5, 6, 7, 8], true);
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('9 de 9 etapas')).toBeInTheDocument();
    expect(document.querySelector('[data-next-step]')).toBeNull();
    const cards = [...document.querySelectorAll('[data-training], [data-steps]')];
    expect(cards[0]).toHaveAttribute('data-training');
  });

  it('o treino mostra os 3 conjuntos com os casos firmes, e tocar abre o conjunto', async () => {
    const { a } = await app();
    render(TrilhaScreen, { app: a });
    expect(await screen.findByRole('button', { name: /OLL em 2 passos\s*0 de 10 firmes/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PLL em 2 passos\s*0 de 6 firmes/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /F2L com algoritmos\s*0 de 41 firmes/ }));
    expect(a.trailView).toEqual({ kind: 'set', set: 'f2l' });
  });
});

describe('aba Trilha: para quem já resolve (spec 8.2)', () => {
  it('o aviso abre a lista, marca várias etapas de uma vez, pisca uma vez e some', async () => {
    const { a, repo } = await app();
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('Já resolve? Marque o que já sabe.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Marcar etapas' }));
    // O foco não cai no body: abrir a lista leva à primeira caixa; Cancelar volta a "Marcar etapas".
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Cruz branca' })));
    await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Marcar etapas' })));
    await fireEvent.click(screen.getByRole('button', { name: 'Marcar etapas' }));
    const save = screen.getByRole('button', { name: 'Marcar' });
    expect(save).toBeDisabled();
    for (const name of ['Cruz branca', 'Cantos brancos', 'Segunda camada', 'Cruz amarela', 'Orientar e permutar']) {
      await fireEvent.click(screen.getByRole('checkbox', { name }));
    }
    await fireEvent.click(save);
    await waitFor(async () => expect((await repo.getProfile()).trail).toEqual([true, true, true, true, true, false, false, false, false]));
    await waitFor(() => expect(document.querySelector('[data-trail-prompt]')).toBeNull());
    expect(spy.triggers).toEqual(['trailStep']);
    expect(screen.getByText('5 de 9 etapas')).toBeInTheDocument();
    // O aviso sumiu com o botão: o foco vai para a ação principal, a próxima etapa.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Começar a aula' })));
  });

  it('"Agora não" dispensa o aviso neste aparelho (meta), sem marcar nada', async () => {
    const { a, repo } = await app();
    render(TrilhaScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Agora não' }));
    await waitFor(() => expect(document.querySelector('[data-trail-prompt]')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Começar a aula' })));
    expect((await repo.getMeta()).trailPromptDismissed).toBe(true);
    expect((await repo.getProfile()).trail.some(Boolean)).toBe(false);
  });

  it('quem já marcou alguma etapa não vê o aviso', async () => {
    const { a } = await app();
    await a.setTrail([3], true);
    render(TrilhaScreen, { app: a });
    await screen.findByText('1 de 9 etapas');
    expect(document.querySelector('[data-trail-prompt]')).toBeNull();
  });
});
