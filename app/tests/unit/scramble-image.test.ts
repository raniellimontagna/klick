import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tick } from 'svelte';

vi.mock('../../src/scramble/cubing-loader', () => {
  class FakeTwisty extends HTMLElement {
    config: Record<string, unknown>;
    constructor(config: Record<string, unknown>) {
      super();
      this.config = config;
    }
  }
  if (!customElements.get('fake-twisty')) customElements.define('fake-twisty', FakeTwisty);
  return { loadCubing: async () => ({ TwistyPlayer: FakeTwisty, randomScrambleForEvent: async () => '' }) };
});

import ScrambleImage from '../../src/ui/timer/ScrambleImage.svelte';
import * as loader from '../../src/scramble/cubing-loader';

describe('imagem do embaralhamento', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('desenha a vista 2D do evento com o embaralhamento', async () => {
    const { container } = render(ScrambleImage, { event: 'minx', scramble: 'R++ D--', visible: true });
    await vi.waitFor(() => expect(container.querySelector('fake-twisty')).not.toBeNull());
    const el = container.querySelector('fake-twisty') as HTMLElement & { config: Record<string, unknown> };
    expect(el.config).toMatchObject({ puzzle: 'megaminx', experimentalSetupAlg: 'R++ D--', visualization: '2D', controlPanel: 'none', background: 'none' });
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  });

  it('desligada, não desenha nada', async () => {
    const { container } = render(ScrambleImage, { event: '333', scramble: 'R U', visible: false });
    await tick();
    expect(container.querySelector('fake-twisty')).toBeNull();
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
    await vi.waitFor(() => expect(container.querySelector('fake-twisty')).not.toBeNull());

    libera(modulo); // agora o carregamento antigo termina
    await new Promise((r) => setTimeout(r, 0));

    const twisties = container.querySelectorAll('fake-twisty');
    expect(twisties).toHaveLength(1);
    expect((twisties[0] as HTMLElement & { config: Record<string, unknown> }).config).toMatchObject({ experimentalSetupAlg: "F' L" });
  });
});
