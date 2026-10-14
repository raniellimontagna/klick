import { describe, expect, it, vi } from 'vitest';
import { maskObject, maskOrbits } from '../../src/core/trail/frame';
import type { CubingModule } from '../../src/scramble/cubing-loader';
import { drawFigure, mountCube } from '../../src/ui/trilha/cube-view';

// Um cubing.js de mentira: o TwistyPlayer guarda o que recebe e conta as chamadas; o animador 2D guarda a máscara e o padrão.
function fakeCubing() {
  const log: string[] = [];
  const listeners = new Map<string, (v: never) => void>();
  const prop = (name: string) => ({
    addFreshListener: (fn: (v: never) => void) => listeners.set(name, fn),
    removeFreshListener: () => listeners.delete(name),
  });
  const player = Object.assign(document.createElement('div'), {
    alg: '',
    experimentalSetupAlg: '',
    experimentalStickeringMaskOrbits: '',
    visualization: '',
    cameraLatitude: 0,
    cameraLongitude: 0,
    play: () => log.push('play'),
    pause: () => log.push('pause'),
    jumpToStart: () => log.push('jumpToStart'),
    controller: { animationController: { play: (o: { direction: number; untilBoundary: string }) => log.push(`step ${o.direction} ${o.untilBoundary}`) } },
    experimentalModel: { currentMoveInfo: prop('move'), coarseTimelineInfo: prop('timeline') },
  });
  const drawn: { svg: string; mask: unknown; pattern: unknown }[] = [];
  let config: Record<string, unknown> = {};
  const module = {
    randomScrambleForEvent: async () => ({ toString: () => '' }),
    TwistyPlayer: function (c: Record<string, unknown>) {
      config = c;
      return player;
    },
    puzzles: {
      '3x3x3': {
        kpuzzle: async () => ({ defaultPattern: () => ({ applyAlg: (alg: string) => `padrão ${alg}` }) }),
        svg: async () => 'planificação',
        llSVG: async () => 'camada de cima',
      },
    },
    ExperimentalSVGAnimator: function (_k: unknown, svg: string, mask?: unknown) {
      const wrapperElement = document.createElement('div');
      wrapperElement.dataset.svg = svg;
      return { wrapperElement, draw: (pattern: unknown) => drawn.push({ svg, mask, pattern }) };
    },
  } as unknown as CubingModule;
  return { module, player, log, listeners, drawn, config: () => config };
}

describe('cubo da aula: o TwistyPlayer atrás da interface (spec 6.1)', () => {
  it('monta o 3D com o setup no quadro das aulas (z2 na frente), a máscara e a câmera de cima', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    const view = await mountCube(host, { setup: "R U R'", alg: "R U' R'", view: '3D', mask: 'f2l' }, { load: async () => f.module, webgl: () => true });
    expect(view?.moving).toBe(true);
    expect(host.firstChild).toBe(f.player);
    expect(f.config()).toMatchObject({ puzzle: '3x3x3', controlPanel: 'none', background: 'none', viewerLink: 'none', hintFacelets: 'none' });
    expect(f.player.experimentalSetupAlg).toBe("z2 R U R'");
    expect(f.player.alg).toBe("R U' R'");
    expect(f.player.experimentalStickeringMaskOrbits).toBe(maskOrbits('f2l'));
    expect([f.player.visualization, f.player.cameraLatitude]).toEqual(['3D', 35]);
  });

  it('vista de cima é a camada chapada; vista de baixo é o 3D com a câmera por baixo; sem máscara, tudo normal', async () => {
    const f = fakeCubing();
    const view = (await mountCube(document.createElement('div'), { setup: '', alg: '', view: 'top' }, { load: async () => f.module, webgl: () => true }))!;
    expect(f.player.visualization).toBe('experimental-2D-LL');
    expect(f.player.experimentalStickeringMaskOrbits).toBe('EDGES:------------,CORNERS:--------,CENTERS:------');
    view.show({ setup: '', alg: '', view: 'below', mask: 'cross' }, false);
    expect([f.player.visualization, f.player.cameraLatitude]).toEqual(['3D', -35]);
  });

  it('trocar de passo volta ao começo e só toca sozinho quando pedido e com algoritmo', async () => {
    const f = fakeCubing();
    const view = (await mountCube(document.createElement('div'), { setup: '', alg: '', view: '3D' }, { load: async () => f.module, webgl: () => true }))!;
    f.log.length = 0;
    view.show({ setup: 'F', alg: "F'", view: '3D' }, true);
    expect(f.log).toEqual(['pause', 'jumpToStart', 'play']);
    f.log.length = 0;
    view.show({ setup: 'F', alg: "F'", view: '3D' }, false);
    view.show({ setup: '', alg: '', view: '3D' }, true);
    expect(f.log).not.toContain('play');
  });

  it('um movimento para a frente ou para trás vai pelo controlador de animação, até o fim do movimento', async () => {
    const f = fakeCubing();
    const view = (await mountCube(document.createElement('div'), { setup: '', alg: 'R U', view: '3D' }, { load: async () => f.module, webgl: () => true }))!;
    f.log.length = 0;
    view.step(1);
    view.step(-1);
    expect(f.log).toEqual(['step 1 move', 'step -1 move']);
  });

  it('o ouvinte recebe o movimento atual e as pontas da linha do tempo; desmontar tira o player e os ouvintes', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    const view = (await mountCube(host, { setup: '', alg: 'R U', view: '3D' }, { load: async () => f.module, webgl: () => true }))!;
    const seen = vi.fn();
    view.listen(seen);
    (f.listeners.get('move') as (v: { patternIndex: number }) => void)({ patternIndex: 1 });
    (f.listeners.get('timeline') as (v: object) => void)({ playing: true, atStart: false, atEnd: false });
    expect(seen).toHaveBeenLastCalledWith({ move: 1, playing: true, atStart: false, atEnd: false });
    view.destroy();
    expect(host.childElementCount).toBe(0);
    expect(f.listeners.size).toBe(0);
  });

  it('sem WebGL: a figura 2D do estado, com a máscara, e sem movimento', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    const view = await mountCube(host, { setup: 'F2', alg: 'F2', view: 'top', mask: 'oll' }, { load: async () => f.module, webgl: () => false });
    expect(view?.moving).toBe(false);
    expect(f.drawn).toEqual([{ svg: 'camada de cima', mask: maskObject('oll'), pattern: 'padrão z2 F2' }]);
    expect((host.firstChild as HTMLElement).dataset.svg).toBe('camada de cima');
  });

  it('o cubing.js que não carrega: null, e a aula segue sem cubo', async () => {
    const view = await mountCube(document.createElement('div'), { setup: '', alg: '', view: '3D' }, { load: () => Promise.reject(new Error('offline')), webgl: () => true });
    expect(view).toBeNull();
  });

  it('a figura do treino: planificação fora da vista de cima', async () => {
    const f = fakeCubing();
    const host = document.createElement('div');
    await drawFigure(host, { setup: "R U R'", view: '3D', mask: 'pair' }, async () => f.module);
    expect(f.drawn).toEqual([{ svg: 'planificação', mask: maskObject('pair'), pattern: "padrão z2 R U R'" }]);
  });
});
