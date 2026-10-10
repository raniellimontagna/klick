import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`aj-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('Ajustes', () => {
  it('marca os valores atuais', async () => {
    const { a } = await app();
    await a.updateSettings({ holdMs: 550 });
    render(AjustesScreen, { app: a });
    expect(await screen.findByText('Ajustes')).toBeInTheDocument();
    expect(document.querySelector('[data-set="holdMs"][data-val="550"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-set="theme"][data-val="system"]')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelector('[data-toggle="inspection"]')).toBeChecked();
  });

  it('trocar o tema grava e aplica', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    await fireEvent.click(await screen.findByRole('button', { name: 'Noite' }));
    expect((await repo.getProfile()).settings.theme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('desligar a imagem do embaralhamento grava e mantém o foco no switch', async () => {
    const { a, repo } = await app();
    render(AjustesScreen, { app: a });
    const sw = (await screen.findByRole('checkbox', { name: /Imagem do embaralhamento/ })) as HTMLInputElement;
    sw.focus();
    await fireEvent.click(sw);
    await new Promise((r) => setTimeout(r, 20));
    expect((await repo.getProfile()).settings.scrambleImage).toBe(false);
    expect((document.activeElement as HTMLElement | null)?.getAttribute('data-toggle')).toBe('scrambleImage');
  });
});
