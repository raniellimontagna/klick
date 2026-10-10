import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

// boot() abriria o IndexedDB e o cubing de verdade. Aqui o estado é montado com uma fila falsa, como em app-shell.test.ts.
vi.mock('../../src/ui/state/boot', async () => {
  const { openKlickDb } = await import('../../src/data/db');
  const { createRepository } = await import('../../src/data/repository');
  const { createScrambleQueue } = await import('../../src/scramble/queue');
  const { AppState } = await import('../../src/ui/state/app.svelte');
  return {
    boot: async () => {
      const repo = createRepository(await openKlickDb('smoke'), { channel: null });
      await repo.saveProfile({ onboarded: true }); // o tour da primeira vez não abre por cima destes testes
      const app = new AppState({ repo, queue: createScrambleQueue({ generate: async () => "R U R'" }), storage: null, storageManager: null });
      await app.init();
      return app;
    },
  };
});

import App from '../../src/ui/App.svelte';

describe('esqueleto', () => {
  // A raiz existe já no carregamento; quando o estado chega, a aba do Timer aparece selecionada.
  it('monta a raiz do App e, com o estado carregado, mostra a aba do Timer', async () => {
    render(App);
    expect(screen.getByTestId('app-root')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page');
  });

  it('IndexedDB simulado está disponível nos testes', () => {
    expect(typeof indexedDB.open).toBe('function');
  });
});

// O Vitest roda com globals desligado, então a limpeza automática do @testing-library/svelte só se registra pelo
// import de '@testing-library/svelte/vitest' em setup.ts. Estes dois testes seguidos pegam a regressão:
// sem ele, o render de um teste continua no document.body e o seguinte enxerga mais de um app-root.
describe('isolamento entre testes', () => {
  it('renderiza o App e acha um app-root', () => {
    render(App);
    expect(screen.getAllByTestId('app-root')).toHaveLength(1);
  });

  it('o teste seguinte começa sem o DOM do anterior', () => {
    render(App);
    expect(screen.getAllByTestId('app-root')).toHaveLength(1);
  });
});
