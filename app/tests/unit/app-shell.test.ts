import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/ui/state/boot', async () => {
  const { openKlickDb } = await import('../../src/data/db');
  const { createRepository } = await import('../../src/data/repository');
  const { createScrambleQueue } = await import('../../src/scramble/queue');
  const { AppState } = await import('../../src/ui/state/app.svelte');
  return {
    boot: async () => {
      const repo = createRepository(await openKlickDb('shell'), { channel: null });
      const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
      await app.init();
      return app;
    },
  };
});

import App from '../../src/ui/App.svelte';

describe('casca do app', () => {
  it('mostra as quatro abas e a tela do Timer', async () => {
    render(App);
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
    for (const name of ['Evolução', 'Centro', 'Ajustes']) expect(screen.getAllByRole('button', { name }).length).toBeGreaterThan(0);
    expect(document.querySelector('[data-screen="timer"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')).not.toBeNull();
  });
});
