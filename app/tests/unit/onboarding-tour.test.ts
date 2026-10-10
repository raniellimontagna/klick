import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import OnboardingDialog from '../../src/ui/dialogs/OnboardingDialog.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ot-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('primeira vez: o tour', () => {
  it('Pular apresentação no passo 1 vai direto ao último passo', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true });
    expect(await screen.findByRole('heading', { name: 'Esse é o Centro' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Pular apresentação' }));
    expect(await screen.findByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).toBeNull();
    expect(screen.getByText('3 de 3')).toBeInTheDocument();
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
    await a.updateSettings({ holdMs: 0 });
    render(OnboardingDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('button', { name: 'Continuar' })).toBeDisabled();
    const hold = document.querySelector('[data-hold]') as HTMLButtonElement;
    await fireEvent.pointerDown(hold);
    await sleep(40);
    await fireEvent.pointerUp(hold);
    expect(await screen.findByRole('button', { name: 'Continuar' })).not.toBeDisabled();
  });

  it('fechar por qualquer caminho grava que a primeira vez já passou e libera app.dialog', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true });
    await screen.findByRole('heading', { name: 'Esse é o Centro' });
    (document.querySelector('dialog') as HTMLDialogElement).close();
    await vi.waitFor(async () => expect((await repo.getProfile()).onboarded).toBe(true));
    expect(a.dialog).toBeNull();
  });

  it('sem dados de exemplo: o último passo não oferece exemplo', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await screen.findByRole('button', { name: 'Começar do zero' });
    expect(screen.queryByRole('button', { name: /exemplo/i })).toBeNull();
  });

  it('importar do csTimer fecha o tour, grava a marca e pede o arquivo na tela Ajustes', async () => {
    const { a, repo } = await app();
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Importar do csTimer' }));
    expect(a.tab).toBe('ajustes');
    expect(a.dataAction).toBe('importFile');
    expect(a.dialog).toBeNull();
    await vi.waitFor(async () => expect((await repo.getProfile()).onboarded).toBe(true));
  });

  it('sem v1Available, o último passo não oferece importar da versão anterior', async () => {
    const { a } = await app();
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await screen.findByRole('button', { name: 'Começar do zero' });
    expect(screen.queryByRole('button', { name: 'Importar da versão anterior' })).toBeNull();
  });

  it('importar da versão anterior pede a importação na tela Ajustes', async () => {
    const { a } = await app();
    a.v1Available = true;
    a.dialog = 'onboarding';
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Pular apresentação' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Importar da versão anterior' }));
    expect(a.tab).toBe('ajustes');
    expect(a.dataAction).toBe('importV1');
    expect(a.dialog).toBeNull();
  });
});
