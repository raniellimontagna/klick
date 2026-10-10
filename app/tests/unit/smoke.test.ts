import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import App from '../../src/ui/App.svelte';
import { T } from '../../src/strings';

describe('esqueleto', () => {
  it('monta o App com um texto de strings.ts', () => {
    render(App);
    expect(screen.getByTestId('app-root')).toHaveTextContent(T.coach.idle);
  });

  it('IndexedDB simulado está disponível nos testes', () => {
    expect(typeof indexedDB.open).toBe('function');
  });
});
