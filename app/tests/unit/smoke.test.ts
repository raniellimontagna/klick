import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from '../../src/ui/App.svelte';

describe('esqueleto', () => {
  // A raiz existe já no carregamento; o conteúdo da casca chega quando boot() termina (casca em app-shell.test.ts).
  it('monta a raiz do App antes de o estado carregar', () => {
    render(App);
    expect(screen.getByTestId('app-root')).toBeInTheDocument();
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
