// O cubo das aulas e a figura do treino (spec do sub-projeto 4, seções 6.1, 6.4 e 7.2). O TwistyPlayer do cubing.js fica atrás de uma
// interface pequena (CubeView), para as telas serem testadas sem ele. Um por aula: montado ao abrir e desmontado ao sair. Sem WebGL, ou
// com o cubing.js sem carregar o 3D, a aula cai na figura 2D do estado (o ExperimentalSVGAnimator, como a imagem do embaralhamento).
//
// O quadro é o das aulas: amarelo em cima, branco embaixo, verde na frente. O cubing.js parte do branco em cima, então todo setup recebe
// um z2 na frente (core/trail/frame.ts).
import { maskObject, maskOrbits } from '../../core/trail/frame';
import type { CubeAngle, MaskKind } from '../../core/trail/types';
import { type CubingModule, loadCubing } from '../../scramble/cubing-loader';

export interface CubeSpec {
  setup: string;
  alg: string; // '' quando o passo só mostra o estado
  view: CubeAngle;
  mask?: MaskKind;
}

// O que a tela mostra dos controles: o movimento atual (o próximo a tocar; igual ao tamanho do algoritmo no fim), se toca, e as pontas.
export interface CubeState {
  move: number;
  playing: boolean;
  atStart: boolean;
  atEnd: boolean;
}

export interface CubeView {
  readonly moving: boolean; // false: a figura 2D parada (a tela esconde os controles de movimento)
  show(spec: CubeSpec, autoplay: boolean): void; // outro passo: o estado novo, no começo do algoritmo; autoplay toca uma vez
  play(): void;
  pause(): void;
  step(direction: 1 | -1): void; // um movimento para a frente ou para trás
  restart(): void;
  listen(fn: (state: CubeState) => void): void; // um ouvinte só; recebe o estado atual na hora
  destroy(): void;
}

export interface MountOptions {
  load?: () => Promise<CubingModule>;
  webgl?: () => boolean;
}

// O que a aula usa do TwistyPlayer do cubing.js 0.65 (o loader o tipa só como HTMLElement).
interface Prop<V> {
  addFreshListener(fn: (value: V) => void): void;
  removeFreshListener(fn: (value: V) => void): void;
}
interface Player extends HTMLElement {
  alg: string;
  experimentalSetupAlg: string;
  experimentalStickeringMaskOrbits: string;
  visualization: string;
  cameraLatitude: number;
  cameraLongitude: number;
  play(): void;
  pause(): void;
  jumpToStart(): void;
  controller: { animationController: { play(o: { direction: number; untilBoundary: string }): void } };
  experimentalModel: {
    currentMoveInfo: Prop<{ patternIndex: number }>;
    coarseTimelineInfo: Prop<{ playing: boolean; atStart: boolean; atEnd: boolean }>;
  };
}

// Todas as peças normais: o passo sem máscara.
const FULL_MASK = 'EDGES:------------,CORNERS:--------,CENTERS:------';
// O cubing.js limita a latitude da câmera a 35°: 35 vê de cima (o padrão dele), -35 vê de baixo (a cruz branca).
const CAMERA = { above: 35, below: -35, longitude: 30 };
const FORWARDS = 1; // Direction.Forwards do cubing.js
const BACKWARDS = -1; // Direction.Backwards
const ONE_MOVE = 'move'; // BoundaryType.Move

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
  } catch {
    return false;
  }
}

// A figura 2D de um estado: a camada de cima chapada na vista 'top', a planificação do cubo nas outras. Lança se o cubing.js falha.
export async function drawFigure(host: HTMLElement, spec: Pick<CubeSpec, 'setup' | 'view' | 'mask'>, load: () => Promise<CubingModule> = loadCubing): Promise<void> {
  const cubing = await load();
  const puzzle = cubing.puzzles['3x3x3'];
  if (!puzzle) throw new Error('cubing.js sem o 3x3x3');
  const kpuzzle = await puzzle.kpuzzle();
  const svg = spec.view === 'top' && puzzle.llSVG ? await puzzle.llSVG() : await puzzle.svg();
  const animator = new cubing.ExperimentalSVGAnimator(kpuzzle, svg, spec.mask ? maskObject(spec.mask) : undefined);
  animator.draw(kpuzzle.defaultPattern().applyAlg(`z2 ${spec.setup}`));
  host.replaceChildren(animator.wrapperElement);
}

function threeD(host: HTMLElement, cubing: CubingModule, first: CubeSpec): CubeView {
  // Sem painel, sem link para o Twizzle e sem adesivos-fantasma: o cubo é só a figura animada; os controles são os da aula.
  const player = new cubing.TwistyPlayer({ puzzle: '3x3x3', background: 'none', controlPanel: 'none', viewerLink: 'none', hintFacelets: 'none' }) as Player;
  let state: CubeState = { move: 0, playing: false, atStart: true, atEnd: false };
  let listener: ((s: CubeState) => void) | null = null;
  const emit = (patch: Partial<CubeState>): void => {
    state = { ...state, ...patch };
    listener?.(state);
  };
  const onMove = (info: { patternIndex: number }): void => emit({ move: info.patternIndex });
  const onTimeline = (info: { playing: boolean; atStart: boolean; atEnd: boolean }): void =>
    emit({ playing: info.playing, atStart: info.atStart, atEnd: info.atEnd });
  const apply = (spec: CubeSpec): void => {
    player.experimentalSetupAlg = `z2 ${spec.setup}`;
    player.alg = spec.alg;
    player.visualization = spec.view === 'top' ? 'experimental-2D-LL' : '3D';
    player.cameraLatitude = spec.view === 'below' ? CAMERA.below : CAMERA.above;
    player.cameraLongitude = CAMERA.longitude;
    player.experimentalStickeringMaskOrbits = spec.mask ? maskOrbits(spec.mask) : FULL_MASK;
    player.jumpToStart();
  };
  apply(first);
  host.replaceChildren(player);
  player.experimentalModel.currentMoveInfo.addFreshListener(onMove);
  player.experimentalModel.coarseTimelineInfo.addFreshListener(onTimeline);
  return {
    moving: true,
    show(spec, autoplay) {
      player.pause();
      apply(spec);
      if (autoplay && spec.alg !== '') player.play();
    },
    play: () => player.play(),
    pause: () => player.pause(),
    step: (direction) => player.controller.animationController.play({ direction: direction === 1 ? FORWARDS : BACKWARDS, untilBoundary: ONE_MOVE }),
    restart() {
      player.pause();
      player.jumpToStart();
    },
    listen(fn) {
      listener = fn;
      fn(state);
    },
    destroy() {
      listener = null;
      player.experimentalModel.currentMoveInfo.removeFreshListener(onMove);
      player.experimentalModel.coarseTimelineInfo.removeFreshListener(onTimeline);
      player.pause();
      player.remove();
    },
  };
}

async function flat(host: HTMLElement, cubing: CubingModule, first: CubeSpec): Promise<CubeView> {
  const load = async (): Promise<CubingModule> => cubing;
  await drawFigure(host, first, load);
  const still = (): void => {};
  return {
    moving: false,
    show(spec) {
      void drawFigure(host, spec, load).catch(still);
    },
    play: still,
    pause: still,
    step: still,
    restart: still,
    listen(fn) {
      fn({ move: 0, playing: false, atStart: true, atEnd: true });
    },
    destroy() {
      host.replaceChildren();
    },
  };
}

// Monta o cubo da aula em `host`. Com WebGL, o 3D; sem ele (ou se o 3D lança), a figura 2D. null: nem o cubing.js carregou; a aula segue
// com o texto e o algoritmo escrito.
export async function mountCube(host: HTMLElement, spec: CubeSpec, o: MountOptions = {}): Promise<CubeView | null> {
  const { load = loadCubing, webgl = hasWebGL } = o;
  let cubing: CubingModule;
  try {
    cubing = await load();
  } catch {
    return null;
  }
  if (webgl()) {
    try {
      return threeD(host, cubing, spec);
    } catch {
      // o 3D não montou: a figura 2D, abaixo
    }
  }
  try {
    return await flat(host, cubing, spec);
  } catch {
    return null;
  }
}
