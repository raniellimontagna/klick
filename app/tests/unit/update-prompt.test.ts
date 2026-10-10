import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import { offerUpdate } from '../../src/ui/state/update.svelte';
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
});
