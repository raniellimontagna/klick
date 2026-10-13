// O animador do Centro (spec do sub-projeto 3, seção 6.4): um por SVG. Aproxima o rosto do alvo e escreve no SVG só quando algo muda.
// O requestAnimationFrame roda só durante transição, piscada, salto ou piscada da face de cima. Parado e assentado, o próximo evento do
// comportamento (piscada, olhadinha, passo da órbita, respiração) é agendado com setTimeout. No solve, freeze() encaixa o foco, desenha
// um quadro e cancela tudo.
import { type CentroView, eyesFor, paintFace, paintRing, paintTop, ringFor } from '../centro';
import { type Behavior, createBehavior, type Overlay } from './behavior';
import { approach, EXPRESSIONS, type Face, OPEN_MIN, settled } from './face';

export interface Scheduler {
  now(): number;
  frame(cb: () => void): () => void; // pede um quadro; devolve o cancelador
  after(ms: number, cb: () => void): () => void; // agenda; devolve o cancelador
}

export const browserScheduler: Scheduler = {
  now: () => performance.now(),
  frame: (cb) => {
    const id = requestAnimationFrame(() => cb());
    return () => cancelAnimationFrame(id);
  },
  after: (ms, cb) => {
    const id = setTimeout(cb, ms);
    return () => clearTimeout(id);
  },
};

export interface CentroAnimator {
  show(view: CentroView): void; // o estado do momento; "resolvendo" congela (freeze). A mesma vista de novo não faz nada.
  trigger(kind: 'pb' | 'seasonEnd'): void; // salto do recorde, piscada da face de cima
  freeze(): void; // o solve começou: foco, um quadro, nada agendado
  setAnimated(on: boolean): void; // estático: trocas na hora, nada agendado
  setPaused(paused: boolean): void; // página escondida ou Centro fora da tela
  repaint(): void; // o SVG foi refeito (tema, acabamento, marcas): pinta nele o estado atual
  destroy(): void;
}

export interface AnimatorOptions {
  svg: () => SVGElement | null; // o SVG atual: pode mudar quando a tela refaz o markup
  scheduler?: Scheduler;
  behavior?: Behavior;
  animated?: boolean;
}

// O rosto que aparece: a base, com a piscada puxando a abertura para o traço, a olhadinha somada e o squash do salto.
function shown(face: Face, ov: Overlay): Face {
  return { ...face, open: face.open + (OPEN_MIN - face.open) * ov.blink, lookX: face.lookX + ov.lookX, squash: face.squash * ov.squash };
}

export function createCentroAnimator(opts: AnimatorOptions): CentroAnimator {
  const sch = opts.scheduler ?? browserScheduler;
  const behavior = opts.behavior ?? createBehavior();
  let animated = opts.animated ?? true;
  let paused = false;
  let frozen = false;
  let destroyed = false;
  let view: CentroView = { state: 'idle' };
  let viewSig = '';
  let target: Face = EXPRESSIONS.open;
  let face: Face = EXPRESSIONS.open;
  let last = sch.now();
  let cancelFrame: (() => void) | null = null;
  let cancelWake: (() => void) | null = null;
  // O que já está pintado: o anel só é reescrito quando muda, ou num SVG novo.
  let paintedSvg: SVGElement | null = null;
  let paintedRing = '';

  behavior.setAnimated(animated, last);
  behavior.setMood('idle', last);

  function stop(): void {
    cancelFrame?.();
    cancelFrame = null;
    cancelWake?.();
    cancelWake = null;
  }

  function paint(now: number): void {
    const svg = opts.svg();
    if (!svg) return;
    const fresh = svg !== paintedSvg;
    paintedSvg = svg;
    const ring = ringFor({ ...view, orbit: view.state === 'idle' ? behavior.orbit(now) : null });
    const sig = ring.join();
    if (fresh || sig !== paintedRing) {
      paintRing(svg, ring);
      paintedRing = sig;
    }
    const ov = behavior.overlay(now);
    paintFace(svg, shown(face, ov), ov.lift);
    paintTop(svg, ov.topDim);
    svg.classList.toggle('breath-off', behavior.breath(now) === true);
    svg.dataset.eyes = eyesFor(view);
  }

  function frame(): void {
    cancelFrame = null;
    if (destroyed || frozen) return;
    const now = sch.now();
    face = animated ? approach(face, target, now - last) : target;
    last = now;
    if (settled(face, target)) face = target;
    paint(now);
    if (paused) return;
    if (face !== target || behavior.busy(now)) {
      cancelFrame = sch.frame(frame);
      return;
    }
    const at = behavior.nextAt(now);
    if (at !== null) cancelWake = sch.after(Math.max(0, at - now), kick);
  }

  // Recomeça o ciclo agora: pinta e decide entre o próximo quadro e o próximo evento.
  function kick(): void {
    if (destroyed || frozen || paused) return;
    stop();
    last = sch.now();
    frame();
  }

  function freeze(): void {
    if (destroyed || frozen) return;
    frozen = true;
    stop();
    const now = sch.now();
    view = { state: 'running' };
    viewSig = 'running';
    behavior.setMood('running', now);
    target = EXPRESSIONS.focus;
    face = target;
    paint(now);
  }

  return {
    show(next) {
      if (destroyed) return;
      if (next.state === 'running') {
        freeze();
        return;
      }
      const eyes = eyesFor(next);
      const sig = `${next.state}|${ringFor({ ...next, orbit: null }).join()}|${eyes}`;
      if (sig === viewSig && !frozen) return;
      frozen = false;
      viewSig = sig;
      view = next;
      behavior.setMood(next.state, sch.now());
      target = EXPRESSIONS[eyes];
      kick();
    },
    trigger(kind) {
      if (destroyed || frozen) return;
      behavior.trigger(kind, sch.now());
      kick();
    },
    freeze,
    setAnimated(on) {
      if (on === animated) return;
      animated = on;
      behavior.setAnimated(on, sch.now());
      if (!on) face = target;
      if (frozen || paused) {
        if (!on) paint(sch.now());
        return;
      }
      kick();
    },
    setPaused(next) {
      if (next === paused) return;
      paused = next;
      if (paused) stop();
      else kick();
    },
    repaint() {
      if (destroyed) return;
      paintedSvg = null;
      if (frozen || paused) paint(sch.now());
      else kick();
    },
    destroy() {
      destroyed = true;
      stop();
    },
  };
}
