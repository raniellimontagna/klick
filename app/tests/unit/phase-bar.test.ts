import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { phaseLabels } from '../../src/core/phases';
import { T } from '../../src/strings';
import PhaseBar from '../../src/ui/timer/PhaseBar.svelte';

// A barra das fases (a maquete aprovada, peça tc-split): a mesma no resultado do Timer, no detalhe do solve e no quadro da Evolução.
const items = (name: string = T.fases.bar) => within(screen.getByRole('list', { name })).getAllByRole('listitem');
// O que aparece do nome: o texto solto de .n, sem o "Fase " que só o leitor ouve.
const visibleName = (li: HTMLElement) =>
  [...(li.querySelector('.n')?.childNodes ?? [])].filter((x) => x.nodeType === Node.TEXT_NODE).map((x) => x.textContent).join('');

describe('a barra das fases', () => {
  it('a barra mostra as fases na proporção, com a mais pesada destacada e os rótulos', () => {
    render(PhaseBar, { phases: [1840, 6120, 2150, 3230], labels: phaseLabels(4, '222') });
    const list = screen.getByRole('list', { name: 'Fases deste solve' });
    // O papel vem explícito: o Safari com VoiceOver não lê como lista um <ol> sem marcador.
    expect(list.getAttribute('role')).toBe('list');
    // Uma coluna por fase, na ordem, com o peso de cada uma (e o mínimo do texto).
    expect(list.style.gridTemplateColumns).toBe(
      'minmax(max-content, 1840fr) minmax(max-content, 6120fr) minmax(max-content, 2150fr) minmax(max-content, 3230fr)',
    );
    const li = items();
    expect(li).toHaveLength(4);
    // A mais pesada (a fase 2) na tinta: só ela tem data-top.
    expect(li.map((x) => x.hasAttribute('data-top'))).toEqual([false, true, false, false]);
    // Aparece o número; o leitor lê "Fase 2, 6.12 s, 46% do tempo, a que mais pesa". As partes somam 100%.
    expect(li.map(visibleName)).toEqual(['1', '2', '3', '4']);
    expect(li[1]).toHaveTextContent('Fase 2, 6.12 s, 46% do tempo, a que mais pesa');
    expect(li[0]).toHaveTextContent('Fase 1, 1.84 s, 14% do tempo');
    expect(li[0]).not.toHaveTextContent('mais pesa');
    expect(li.map((x) => x.querySelector('small')?.firstChild?.textContent)).toEqual(['14%', '46%', '16%', '24%']);
  });

  it('com 4 fases no 3×3, os nomes do CFOP no lugar dos números', () => {
    render(PhaseBar, { phases: [1840, 6120, 2150, 3230], labels: phaseLabels(4, '333') });
    const li = items();
    expect(li.map((x) => x.querySelector('.n')?.textContent)).toEqual(['Cruz', 'F2L', 'OLL', 'PLL']);
    expect(li[1]).toHaveTextContent('F2L, 6.12 s, 46% do tempo, a que mais pesa');
  });

  it('a mais pesada pode vir de fora (a média do quadro), e o nome da lista também', () => {
    render(PhaseBar, { phases: [3000, 3000, 4000], labels: phaseLabels(3, '333'), heaviest: 2, label: 'Média de cada fase' });
    expect(items('Média de cada fase').map((x) => x.hasAttribute('data-top'))).toEqual([false, false, true]);
  });

  it('de um minuto para cima, a duração vem como tempo ("1:02.40")', () => {
    render(PhaseBar, { phases: [62400, 30000], labels: phaseLabels(2, '444') });
    const li = items();
    expect(li[0]).toHaveTextContent('1:02.40');
    expect(li[1]).toHaveTextContent('30.00 s');
  });
});
