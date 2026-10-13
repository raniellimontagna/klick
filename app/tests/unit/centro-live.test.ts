import { describe, expect, it, vi } from 'vitest';
import type { TimerState } from '../../src/core/timer';
import type { CentroAnimator } from '../../src/ui/centro/animator';
import { createCentroLive, REACTION_DELAY, REACTION_MS, SLEEP_AFTER } from '../../src/ui/timer/centro-live';

function fakeAnimator() {
  const shows: string[] = [];
  const triggers: string[] = [];
  const animator: CentroAnimator = {
    show: (v) => {
      shows.push(v.state);
    },
    trigger: (k) => {
      triggers.push(k);
    },
    freeze: vi.fn(),
    setAnimated: vi.fn(),
    setPaused: vi.fn(),
    repaint: vi.fn(),
    destroy: vi.fn(),
  };
  return { animator, shows, triggers };
}
const timerIn = (state: TimerState, extra: { inspectElapsed?: number; armProgress?: number } = {}) => ({ state, inspectElapsed: 0, armProgress: 0, ...extra });

describe('o Centro no Timer', () => {
  it('a reação espera imóvel, dura 2,5 s e dispara o salto e a piscada da face de cima uma vez', () => {
    const { animator, shows, triggers } = fakeAnimator();
    const live = createCentroLive(timerIn('done'), animator, 0);
    live.react('pb', 1000, true);
    expect(live.paint(1000 + REACTION_DELAY - 1).state).toBe('running');
    expect(live.paint(1000 + REACTION_DELAY).state).toBe('reaction');
    live.paint(1000 + REACTION_DELAY + 100);
    expect(triggers).toEqual(['pb', 'seasonEnd']);
    expect(live.reacting(1000 + REACTION_DELAY + REACTION_MS - 1)).toBe(true);
    expect(live.paint(1000 + REACTION_DELAY + REACTION_MS).state).toBe('idle');
    expect(live.reacting(1000 + REACTION_DELAY + REACTION_MS)).toBe(false);
    expect(shows).toContain('reaction');
  });

  it('reação sem recorde nem virada não dispara nada; limpar a reação volta ao parado', () => {
    const { animator, triggers } = fakeAnimator();
    const live = createCentroLive(timerIn('done'), animator, 0);
    live.react('good', 0);
    live.paint(REACTION_DELAY + 10);
    expect(triggers).toEqual([]);
    live.clearReaction();
    expect(live.view(REACTION_DELAY + 20).state).toBe('idle');
  });

  it('uma penalidade no meio da reação troca o resultado na hora, sem novo salto; sem reação, não faz nada', () => {
    const { animator, triggers } = fakeAnimator();
    const live = createCentroLive(timerIn('done'), animator, 0);
    live.setResult('dnf');
    expect(live.view(0)).toEqual({ state: 'idle' });
    live.react('pb', 0);
    live.paint(REACTION_DELAY + 10);
    expect(triggers).toEqual(['pb']);
    live.setResult('dnf');
    expect(live.view(REACTION_DELAY + 20)).toEqual({ state: 'reaction', result: 'dnf' });
    live.paint(REACTION_DELAY + 30);
    expect(triggers).toEqual(['pb']);
    expect(live.reacting(REACTION_DELAY + REACTION_MS - 1)).toBe(true);
  });

  it('enquanto o solve grava, o Centro fica parado até a reação ou até limpar; o timer ocupado passa por cima', () => {
    const { animator } = fakeAnimator();
    const timer = timerIn('done');
    const live = createCentroLive(timer, animator, 0);
    live.hold();
    expect(live.view(100000).state).toBe('running');
    expect(live.reacting(100000)).toBe(false);
    live.react('good', 1000);
    expect(live.view(1000 + REACTION_DELAY).state).toBe('reaction');
    expect(live.view(1000 + REACTION_DELAY + REACTION_MS).state).toBe('idle');
    live.hold();
    live.clearReaction();
    expect(live.view(0).state).toBe('idle');
    live.hold();
    timer.state = 'arming';
    expect(live.view(0).state).toBe('arming');
  });

  it('o timer manda: inspeção, armando, pronto e resolvendo passam por cima da reação', () => {
    const timer = timerIn('arming', { armProgress: 0.5 });
    const live = createCentroLive(timer, fakeAnimator().animator, 0);
    live.react('good', 0);
    expect(live.view(REACTION_DELAY + 1)).toEqual({ state: 'arming', armProgress: 0.5 });
  });

  it('dorme depois de 5 min parado; uma entrada acorda; com o timer ocupado, não dorme', () => {
    const timer = timerIn('idle');
    const live = createCentroLive(timer, fakeAnimator().animator, 0);
    expect(live.sleepIfIdle(SLEEP_AFTER - 1)).toBe(false);
    expect(live.sleepIfIdle(SLEEP_AFTER)).toBe(true);
    expect(live.view(0).state).toBe('sleep');
    live.wake(SLEEP_AFTER + 10);
    expect(live.sleeping).toBe(false);
    const busy = createCentroLive(timerIn('inspect'), fakeAnimator().animator, 0);
    expect(busy.sleepIfIdle(3 * SLEEP_AFTER)).toBe(false);
  });
});
