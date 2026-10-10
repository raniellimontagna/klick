import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import ShortcutsDialog from '../../src/ui/dialogs/ShortcutsDialog.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`sc-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

let opener: HTMLButtonElement | null = null;
afterEach(() => {
  opener?.remove();
  opener = null;
});

describe('Atalhos', () => {
  it('mostra a tabela de atalhos do protótipo num diálogo aberto', async () => {
    const { a } = await app();
    render(ShortcutsDialog, { app: a, open: true });
    expect(await screen.findByRole('heading', { name: 'Atalhos' })).toBeInTheDocument();
    expect(document.querySelector('dialog')).toHaveAttribute('open');
    expect(screen.getByText('Armar (segure) e largar (solte)')).toBeInTheDocument();
    expect(screen.getByText('Trocar de aba')).toBeInTheDocument();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(10);
  });

  it('o fechar pelo botão libera app.dialog e devolve o foco ao botão que abriu', async () => {
    const { a } = await app();
    opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    a.dialog = 'shortcuts';
    render(ShortcutsDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
    expect(a.dialog).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('clicar no respiro não fecha; clicar no fundo fecha', async () => {
    const { a } = await app();
    render(ShortcutsDialog, { app: a, open: true });
    const d = document.querySelector('dialog') as HTMLDialogElement;
    d.getBoundingClientRect = () => ({ left: 100, right: 400, top: 100, bottom: 300, x: 100, y: 100, width: 300, height: 200, toJSON() {} }) as DOMRect;
    await fireEvent.click(d, { clientX: 150, clientY: 150 });
    expect(d).toHaveAttribute('open');
    await fireEvent.click(d, { clientX: 10, clientY: 10 });
    expect(d).not.toHaveAttribute('open');
  });
});
