// A ligação do Centro com o timer, fora da tela do Timer (spec do sub-projeto 3, seção 6.1): o estado do Centro a cada quadro, o parado
// enquanto o solve grava, a reação depois dele (com o salto do recorde, a piscada da face de cima na virada e a penalidade que muda o
// resultado no meio) e o sono depois de 5 min parado. Quem desenha é o animador; a tela repassa os eventos e chama paint() no laço dela.
import type { ResultKind } from '../../core/stats';
import type { TimerState } from '../../core/timer';
import type { CentroView } from '../centro';
import type { CentroAnimator } from '../centro/animator';

// Números do protótipo: a reação começa meio segundo depois da gravação e dura 2,5 s.
export const REACTION_DELAY = 500;
export const REACTION_MS = 2500;
export const SLEEP_AFTER = 5 * 60000; // parado com o timer desligado por 5 min: o Centro dorme

export interface TimerLike {
  readonly state: TimerState;
  readonly inspectElapsed: number;
  readonly armProgress: number;
}

export interface CentroLive {
  readonly sleeping: boolean;
  view(now: number): CentroView; // o estado do Centro neste instante (performance.now)
  paint(now: number): CentroView; // o mesmo, já entregue ao animador (com o salto e a piscada no começo da reação)
  hold(): void; // o solve parou e está gravando: o Centro fica parado (como no solve) até react() ou clearReaction()
  react(result: ResultKind | null, t0: number, seasonEnd?: boolean): void; // a reação ao solve, de t0 + 0,5 s a t0 + 3 s
  setResult(result: ResultKind | null): void; // uma penalidade no meio da reação: o anel e os olhos seguem, sem novo salto
  seasonEnd(result: ResultKind | null, t0: number): void; // uma penalidade fechou a temporada: reage de novo já em t0, com a piscada e sem salto
  clearReaction(): void; // tira a reação e o parado da gravação
  reacting(now: number): boolean; // a reação ainda está na tela (o laço precisa de quadro)
  wake(wallNow: number): void; // uma entrada da pessoa (Date.now): acorda e conta a inatividade de novo
  sleepIfIdle(wallNow: number): boolean; // dorme se ficou 5 min parado com o timer desligado; true se dormiu agora
}

export function createCentroLive(timer: TimerLike, animator: CentroAnimator, wallNow: number): CentroLive {
  let reaction: { from: number; until: number; result: ResultKind | null; jump: boolean; seasonEnd: boolean; triggered: boolean } | null = null;
  let held = false; // gravando o solve: parado até a reação
  let sleeping = false;
  let lastInput = wallNow;

  function view(now: number): CentroView {
    if (sleeping) return { state: 'sleep' };
    if (timer.state === 'inspect') return { state: 'inspect', inspectElapsed: timer.inspectElapsed };
    if (timer.state === 'arming') return { state: 'arming', armProgress: timer.armProgress };
    if (timer.state === 'ready' || timer.state === 'running') return { state: timer.state };
    if (held) return { state: 'running' }; // o solve ainda grava: o Centro segue como no solve
    if (reaction && now < reaction.from) return { state: 'running' }; // ainda imóvel: a reação vem depois
    if (reaction && now < reaction.until) return { state: 'reaction', result: reaction.result ?? undefined };
    return { state: 'idle' };
  }

  return {
    get sleeping() {
      return sleeping;
    },
    view,
    paint(now) {
      const v = view(now);
      animator.show(v);
      if (reaction && v.state === 'reaction' && !reaction.triggered) {
        reaction.triggered = true;
        if (reaction.jump && reaction.result === 'pb') animator.trigger('pb');
        if (reaction.seasonEnd) animator.trigger('seasonEnd');
      }
      return v;
    },
    hold() {
      held = true;
      reaction = null;
    },
    react(result, t0, seasonEnd = false) {
      held = false;
      reaction = { from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + REACTION_MS, result, jump: true, seasonEnd, triggered: false };
    },
    setResult(result) {
      if (reaction) reaction.result = result;
    },
    seasonEnd(result, t0) {
      held = false;
      reaction = { from: t0, until: t0 + REACTION_MS, result, jump: false, seasonEnd: true, triggered: false }; // sem gravação a esperar
    },
    clearReaction() {
      held = false;
      reaction = null;
    },
    reacting(now) {
      return reaction !== null && now < reaction.until;
    },
    wake(now) {
      lastInput = now;
      sleeping = false;
    },
    sleepIfIdle(now) {
      if (sleeping || now - lastInput < SLEEP_AFTER || (timer.state !== 'idle' && timer.state !== 'done')) return false;
      sleeping = true;
      return true;
    },
  };
}
