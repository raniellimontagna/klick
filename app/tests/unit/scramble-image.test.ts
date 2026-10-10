import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EventId } from '../../src/core/types';

// Fingimento do cubing.js: `puzzles[id]` tem kpuzzle() e svg(), e o animador SVG guarda os padrões que recebe em draw().
// Tudo fica num vi.hoisted porque o vi.mock sobe antes dos imports.
const cubing = vi.hoisted(() => {
  const animadores: FakeAnimador[] = [];
  const pedidos: string[] = []; // ids dos puzzles pedidos a kpuzzle()
  const falhas = { kpuzzle: false, svg: false, applyAlg: false };

  class FakeAnimador {
    wrapperElement: HTMLElement;
    desenhos: unknown[] = [];
    readonly puzzle: string;
    readonly svg: string;
    constructor(kpuzzle: { puzzle: string }, svg: string) {
      this.puzzle = kpuzzle.puzzle;
      this.svg = svg;
      this.wrapperElement = document.createElement('div');
      this.wrapperElement.className = 'svg-wrapper';
      animadores.push(this);
    }
    draw(pattern: unknown) {
      this.desenhos.push(pattern);
    }
  }

  function puzzle(id: string) {
    return {
      kpuzzle: async () => {
        pedidos.push(id);
        if (falhas.kpuzzle) throw new Error('kpuzzle');
        return {
          puzzle: id,
          defaultPattern: () => ({
            applyAlg: (alg: string) => {
              if (falhas.applyAlg) throw new Error('alg inválido');
              return { puzzle: id, alg };
            },
          }),
        };
      },
      svg: async () => {
        if (falhas.svg) throw new Error('svg');
        return `<svg data-puzzle="${id}"></svg>`;
      },
    };
  }

  const modulo = {
    // 4x4x4 de propósito fora da lista: o evento sem puzzle no cubing.js deixa o div vazio.
    puzzles: { megaminx: puzzle('megaminx'), '3x3x3': puzzle('3x3x3'), square1: puzzle('square1') },
    ExperimentalSVGAnimator: FakeAnimador,
    randomScrambleForEvent: async () => ({ toString: () => "R U" }),
  };

  return { animadores, pedidos, falhas, modulo };
});

vi.mock('../../src/scramble/cubing-loader', () => ({
  loadCubing: async () => cubing.modulo,
}));

import ScrambleImage from '../../src/ui/timer/ScrambleImage.svelte';
import * as loader from '../../src/scramble/cubing-loader';

// Uma volta de macrotarefa: basta para as promessas internas do componente terminarem.
const esperaTarefas = () => new Promise((r) => setTimeout(r, 0));

describe('imagem do embaralhamento', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cubing.animadores.length = 0;
    cubing.pedidos.length = 0;
    cubing.falhas.kpuzzle = false;
    cubing.falhas.svg = false;
    cubing.falhas.applyAlg = false;
  });

  it('desenha o puzzle do evento com o embaralhamento aplicado, dentro do div aria-hidden', async () => {
    const { container } = render(ScrambleImage, { event: 'minx', scramble: 'R++ D--', visible: true });
    await vi.waitFor(() => expect(container.querySelector('.scr-img > .svg-wrapper')).not.toBeNull());
    expect(cubing.pedidos).toEqual(['megaminx']);
    expect(cubing.animadores).toHaveLength(1);
    expect(cubing.animadores[0].puzzle).toBe('megaminx');
    expect(cubing.animadores[0].desenhos).toEqual([{ puzzle: 'megaminx', alg: 'R++ D--' }]);
    expect(container.querySelector('.scr-img')?.getAttribute('aria-hidden')).toBe('true');
  });

  it.each<[EventId, string, boolean]>([
    ['minx', 'megaminx', true],
    ['sq1', 'square1', true],
    ['333', '3x3x3', false],
  ])('evento %s pede o puzzle %s e wide=%s', async (event, puzzleId, wide) => {
    const { container } = render(ScrambleImage, { event, scramble: 'R U', visible: true });
    await vi.waitFor(() => expect(container.querySelector('.svg-wrapper')).not.toBeNull());
    expect(cubing.pedidos).toEqual([puzzleId]);
    expect(container.querySelector('.scr-img')?.classList.contains('wide')).toBe(wide);
  });

  it('desligada, não carrega nem desenha nada', async () => {
    const { container } = render(ScrambleImage, { event: '333', scramble: 'R U', visible: false });
    await esperaTarefas();
    expect(cubing.pedidos).toEqual([]);
    expect(container.querySelector('.scr-img')?.childElementCount).toBe(0);
  });

  it('embaralhamento vazio não desenha nada', async () => {
    const { container } = render(ScrambleImage, { event: '333', scramble: '', visible: true });
    await esperaTarefas();
    expect(cubing.pedidos).toEqual([]);
    expect(container.querySelector('.scr-img')?.childElementCount).toBe(0);
  });

  it('evento cujo puzzle não existe no cubing.js deixa o div vazio, sem erro', async () => {
    const { container } = render(ScrambleImage, { event: '444', scramble: 'R U', visible: true });
    await esperaTarefas();
    expect(cubing.pedidos).toEqual([]);
    expect(container.querySelector('.scr-img')?.childElementCount).toBe(0);
  });

  it.each(['kpuzzle', 'svg', 'applyAlg'] as const)('falha em %s deixa o div vazio, sem lançar', async (falha) => {
    cubing.falhas[falha] = true;
    const { container } = render(ScrambleImage, { event: 'minx', scramble: 'R++ D--', visible: true });
    await vi.waitFor(() => expect(cubing.pedidos).toEqual(['megaminx']));
    await esperaTarefas();
    expect(container.querySelector('.scr-img')?.childElementCount).toBe(0);
    expect(cubing.animadores).toHaveLength(0);
  });

  it('se o carregamento falha, o div fica vazio e o componente não lança', async () => {
    const espiao = vi.spyOn(loader, 'loadCubing').mockImplementationOnce(() => Promise.reject(new Error('rede')));
    const { container } = render(ScrambleImage, { event: '333', scramble: 'R U', visible: true });
    await vi.waitFor(() => expect(espiao).toHaveBeenCalledTimes(1));
    await esperaTarefas();
    expect(container.querySelector('.scr-img')?.childElementCount).toBe(0);
    expect(cubing.animadores).toHaveLength(0);
  });

  it('se a cena muda antes de o carregamento terminar, fica só o embaralhamento atual', async () => {
    const modulo = await loader.loadCubing(); // o módulo falso, lido antes de espionar
    let libera!: (m: loader.CubingModule) => void;
    const primeiro = new Promise<loader.CubingModule>((resolve) => {
      libera = resolve;
    });
    const espiao = vi.spyOn(loader, 'loadCubing').mockImplementationOnce(() => primeiro);

    const { container, rerender } = render(ScrambleImage, { event: '333', scramble: 'R U', visible: true });
    await vi.waitFor(() => expect(espiao).toHaveBeenCalledTimes(1)); // o primeiro carregamento começou e ficou pendente
    await rerender({ scramble: "F' L" }); // a cena muda antes de ele terminar
    await vi.waitFor(() => expect(container.querySelector('.svg-wrapper')).not.toBeNull());

    libera(modulo); // agora o carregamento antigo termina
    await esperaTarefas();

    expect(container.querySelectorAll('.svg-wrapper')).toHaveLength(1);
    expect(cubing.animadores).toHaveLength(1);
    expect(cubing.animadores[0].desenhos).toEqual([{ puzzle: '3x3x3', alg: "F' L" }]);
  });

  it('ao esconder (visible vai a false), o desenho sai do div', async () => {
    const { container, rerender } = render(ScrambleImage, { event: '333', scramble: 'R U', visible: true });
    await vi.waitFor(() => expect(container.querySelector('.svg-wrapper')).not.toBeNull());
    await rerender({ visible: false });
    expect(container.querySelector('.svg-wrapper')).toBeNull();
    expect(container.querySelector('.scr-img')?.childElementCount).toBe(0);
  });
});
