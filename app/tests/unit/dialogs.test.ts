import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createBackup } from '../../src/data/safety';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import SessionsDialog from '../../src/ui/dialogs/SessionsDialog.svelte';
import TrashDialog from '../../src/ui/dialogs/TrashDialog.svelte';
import BackupsDialog from '../../src/ui/dialogs/BackupsDialog.svelte';
import OnboardingDialog from '../../src/ui/dialogs/OnboardingDialog.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`dl-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R U` }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

describe('diálogos', () => {
  it('sessões: cria uma de Square-1 e agrupa por evento', async () => {
    const { a } = await app();
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.change(await screen.findByLabelText('Evento da nova sessão'), { target: { value: 'sq1' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await new Promise((r) => setTimeout(r, 30));
    expect(a.event).toBe('sq1');
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['3×3', 'Square-1']);
  });

  it('lixeira: restaura um solve excluído', async () => {
    const { a } = await app();
    const s = (await a.addSolve({ ms: 60000, penalty: null, at: Date.now() }))!;
    await a.deleteSolve(s.id);
    render(TrashDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: /Restaurar/ }));
    await new Promise((r) => setTimeout(r, 30));
    expect(a.solves.map((x) => x.id)).toEqual([s.id]);
  });

  it('cópias: restaurar pede dois cliques e volta o estado', async () => {
    const { a, repo } = await app();
    await a.addSolve({ ms: 60000, penalty: null, at: Date.now() });
    await createBackup(repo, 'manual', Date.now());
    await a.addSolve({ ms: 70000, penalty: null, at: Date.now() + 1 });
    render(BackupsDialog, { app: a, open: true });
    const btn = await screen.findByRole('button', { name: /Restaurar/ });
    await fireEvent.click(btn);
    expect(await screen.findByRole('button', { name: /Tem certeza/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /Tem certeza/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(a.solves.map((x) => x.ms)).toEqual([60000]);
  });

  it('primeira vez: o fim oferece importar ou começar do zero', async () => {
    const { a, repo } = await app();
    a.v1Available = true;
    render(OnboardingDialog, { app: a, open: true, skipPractice: true });
    for (let i = 0; i < 2; i++) {
      const next = screen.queryByRole('button', { name: 'Continuar' });
      if (next && !(next as HTMLButtonElement).disabled) await fireEvent.click(next);
      else break;
    }
    expect(await screen.findByRole('button', { name: 'Começar do zero' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar do csTimer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Importar da versão anterior' })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Começar do zero' }));
    await new Promise((r) => setTimeout(r, 30));
    expect((await repo.getProfile()).onboarded).toBe(true);
  });
});
