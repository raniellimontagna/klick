import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import OnboardingDialog from '../../src/ui/dialogs/OnboardingDialog.svelte';
import TrilhaScreen from '../../src/ui/trilha/TrilhaScreen.svelte';
import { T } from '../../src/strings';
import { mockMedia } from './media';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ot-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

// Vai ao passo 2 e segura o botão até ele ficar verde (holdMs 0: no primeiro quadro). Devolve o botão e o Continuar.
async function segurarAteVerde(a: AppState) {
  await a.updateSettings({ holdMs: 0 });
  render(OnboardingDialog, { app: a, open: true });
  await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
  const hold = (await screen.findByRole('button', { name: 'Segure aqui' })) as HTMLButtonElement;
  await fireEvent.pointerDown(hold);
  await vi.waitFor(() => expect(hold).toHaveTextContent('Agora solte'), { timeout: 3000 });
  return { hold, continuar: () => screen.getByRole('button', { name: 'Continuar' }) as HTMLButtonElement };
}

afterEach(() => {
  delete (document as unknown as Record<string, unknown>).visibilityState;
});

describe('primeira vez: o tour', () => {
  it('Pular apresentação no passo 1 vai direto ao último passo: a pergunta, com as opções de quem já resolve', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    expect(await screen.findByRole('heading', { name: 'Esse é o Centro' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(await screen.findByRole('heading', { name: 'Já resolve o cubo?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ainda não' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByText('4 de 4')).toBeInTheDocument();
  });

  it('Pular apresentação no passo 2 (sem ter segurado) também vai ao último passo', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Segure até ficar verde' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(await screen.findByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
  });

  it('no passo 2, Continuar só libera depois de segurar até ficar verde e soltar', async () => {
    const { a } = await app();
    const { hold, continuar } = await segurarAteVerde(a);
    expect(continuar()).toBeDisabled();
    await fireEvent.pointerUp(hold);
    await vi.waitFor(() => expect(continuar()).not.toBeDisabled(), { timeout: 3000 });
  });

  it('soltar fora do botão também solta o segurar (o soltar vale na janela)', async () => {
    const { a } = await app();
    const { continuar } = await segurarAteVerde(a);
    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
    await vi.waitFor(() => expect(continuar()).not.toBeDisabled(), { timeout: 3000 });
  });

  it('sair da janela (blur) abandona o segurar: não conta como praticado', async () => {
    const { a } = await app();
    const { hold, continuar } = await segurarAteVerde(a);
    window.dispatchEvent(new Event('blur'));
    await vi.waitFor(() => expect(hold).toHaveTextContent('Segure aqui'), { timeout: 3000 });
    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(continuar()).toBeDisabled();
  });

  it('a página escondida abandona o segurar: não conta como praticado', async () => {
    const { a } = await app();
    const { hold, continuar } = await segurarAteVerde(a);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.waitFor(() => expect(hold).toHaveTextContent('Segure aqui'), { timeout: 3000 });
    expect(continuar()).toBeDisabled();
  });

  it('fechar por qualquer caminho grava que a primeira vez já passou e libera app.dialog', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await screen.findByRole('heading', { name: 'Esse é o Centro' });
    (document.querySelector('dialog') as HTMLDialogElement).close();
    await vi.waitFor(async () => expect((await repo.getProfile()).onboarded).toBe(true), { timeout: 3000 });
    expect(a.dialog).toBeNull();
  });

  it('sem dados de exemplo: o último passo não oferece exemplo', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await screen.findByRole('button', { name: 'Começar do zero' });
    expect(screen.queryByRole('button', { name: /exemplo/i })).toBeNull();
  });

  it('importar do csTimer chama o seletor dentro do toque, antes de fechar o tour', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    let tourAberto: boolean | null = null;
    const onpickfile = vi.fn(() => {
      tourAberto = (document.querySelector('dialog') as HTMLDialogElement).hasAttribute('open');
    });
    render(OnboardingDialog, { app: a, open: true, skipPractice: true, onpickfile });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    const tocar = fireEvent.click(await screen.findByRole('button', { name: 'Importar do csTimer' }));
    // Sem await antes da asserção: o seletor já foi pedido dentro do toque, e o tour ainda estava aberto.
    expect(onpickfile).toHaveBeenCalledTimes(1);
    expect(tourAberto).toBe(true);
    await tocar;
    expect(a.dialog).toBeNull();
    await vi.waitFor(async () => expect((await repo.getProfile()).onboarded).toBe(true), { timeout: 3000 });
  });

  it('sem v1Available, o último passo não oferece importar da versão anterior', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await screen.findByRole('button', { name: 'Começar do zero' });
    expect(screen.queryByRole('button', { name: 'Importar da versão anterior' })).toBeNull();
  });

  it('importar da versão anterior fecha o tour, leva para Ajustes e faz a importação', async () => {
    const { a } = await app();
    a.v1Available = true;
    a.dialog = 'onboarding';
    const v1 = vi.spyOn(a, 'importV1').mockResolvedValue(null);
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Importar da versão anterior' }));
    expect(a.tab).toBe('ajustes');
    expect(a.dialog).toBeNull();
    await vi.waitFor(() => expect(v1).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });
});

describe('o tour numa tela de toque', () => {
  it('o passo 2 fala do botão, não do espaço', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const { a } = await app();
      render(OnboardingDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText(T.onboarding.steps[1].touchText)).toBeInTheDocument();
      expect(screen.queryByText(/espaço/)).toBeNull();
    } finally {
      restore();
    }
  });

  it('o passo 3 diz para parar com um toque, não com uma tecla', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const { a } = await app();
      render(OnboardingDialog, { app: a, open: true, skipPractice: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
      await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
      expect(await screen.findByText(T.onboarding.steps[2].touchText)).toBeInTheDocument();
      expect(screen.queryByText(/tecla/)).toBeNull();
    } finally {
      restore();
    }
  });

  it('com teclado, os passos continuam falando de espaço e de tecla', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText(T.onboarding.steps[2].text)).toBeInTheDocument();
  });
});

describe('a pergunta da trilha (spec do sub-projeto 4, seção 8.5)', () => {
  it('do passo 3, Continuar leva à pergunta; Voltar volta ao passo 2', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Seu primeiro marco' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Começar do zero' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('heading', { name: 'Já resolve o cubo?' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ainda não' }));
  });

  it('"Ainda não" é descrito pelo texto da pergunta', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    expect(screen.getByRole('button', { name: 'Ainda não' })).toHaveAccessibleDescription(T.onboarding.steps[3].text);
  });

  it('depois de "Ainda não", a home da Trilha não mostra o aviso de marcar o que já sabe', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Ainda não' }));
    await vi.waitFor(async () => expect((await repo.getMeta()).trailPromptDismissed).toBe(true), { timeout: 3000 });
    expect(a.trailPromptShown).toBe(false);
    a.openTrail();
    render(TrilhaScreen, { app: a });
    expect(await screen.findByText('0 de 9 etapas')).toBeInTheDocument();
    expect(screen.queryByText(T.trilha.prompt)).toBeNull();
  });

  it('"Ainda não" fecha o tour e abre a aba Trilha direto na aula 1', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Ainda não' }));
    expect(a.tab).toBe('trilha');
    expect(a.trailView).toEqual({ kind: 'lesson', step: 0 });
    expect(a.dialog).toBeNull();
    await vi.waitFor(async () => expect((await repo.getProfile()).onboarded).toBe(true), { timeout: 3000 });
  });

  it('"Já resolvo" segue como antes: Começar do zero fecha no Timer, e a Trilha vai mostrar o aviso de marcar o que já sabe', async () => {
    const { a } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    expect(screen.getByText('Já resolvo')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    expect(a.tab).toBe('timer');
    expect(a.dialog).toBeNull();
    expect(a.trailPromptShown).toBe(true);
  });
});
