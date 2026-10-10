import { describe, expect, it } from 'vitest';
import { createTimer } from '../../src/core/timer';
import { createTouchArm } from '../../src/core/touch';
import { createInputController } from '../../src/ui/timer/input';

function setup(o: { coarse?: boolean; mode?: 'two' | 'one'; inspection?: boolean } = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection: o.inspection ?? false });
  const touch = createTouchArm({ press: () => timer.press(), release: () => timer.release(), cancel: () => timer.cancel(), getState: () => timer.state, getInspection: () => o.inspection ?? false, mode: o.mode ?? 'two' });
  const actions: string[] = [];
  let dialog = false;
  const ctl = createInputController(
    { timer, touch, tabIsTimer: () => true, dialogOpen: () => dialog, onAction: (a) => actions.push(a), onWake: () => {} },
    { coarse: () => o.coarse ?? false, armMode: () => o.mode ?? 'two' },
  );
  document.body.innerHTML = '<section data-screen="timer"><span data-time>0</span><div data-zones><div data-zone="left"></div><div data-zone="right"></div></div><button data-act="plus2">+2</button><input data-note /></section>';
  const screen = document.querySelector('[data-screen="timer"]') as HTMLElement;
  const zones = document.querySelector('[data-zones]') as HTMLElement;
  const detach = ctl.attach(document, window, zones, screen);
  const key = (type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body, repeat = false) =>
    target.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true, repeat }));
  return { timer, actions, key, setT: (v: number) => { t = v; }, setDialog: (v: boolean) => { dialog = v; }, zones, screen, detach, ctl };
}

describe('teclado', () => {
  it('segurar espaço arma, soltar no verde larga, qualquer tecla para', () => {
    const s = setup();
    s.key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    s.key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('running');
    s.setT(5000);
    s.key('keydown', 'KeyA', 'a');
    expect(s.timer.state).toBe('done');
  });

  it('digitando na nota, as teclas não viram atalhos nem armam', () => {
    const s = setup();
    const input = document.querySelector('[data-note]') as HTMLInputElement;
    input.focus();
    s.key('keydown', 'KeyP', 'p', input);
    s.key('keydown', 'Space', ' ', input);
    expect(s.actions).toEqual([]);
    expect(s.timer.state).toBe('idle');
  });

  it('com diálogo aberto, nada acontece', () => {
    const s = setup();
    s.setDialog(true);
    s.key('keydown', 'Space', ' ');
    s.key('keydown', 'KeyN', 'n');
    expect(s.timer.state).toBe('idle');
    expect(s.actions).toEqual([]);
  });

  it('auto-repeat de atalho é ignorado', () => {
    const s = setup();
    s.key('keydown', 'KeyP', 'p');
    s.key('keydown', 'KeyP', 'p', document.body, true);
    expect(s.actions).toEqual(['plus2']);
  });

  it('abandonHold no meio do armar (troca de evento, sessão ou aba) volta ao repouso', () => {
    const s = setup();
    s.key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    s.ctl.abandonHold();
    expect(s.timer.state).toBe('idle');
    s.key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('idle');
  });

  it('perder o foco no meio do armar abandona sem largar', () => {
    const s = setup();
    s.key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    window.dispatchEvent(new Event('blur'));
    expect(s.timer.state).toBe('idle');
    s.key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('idle');
  });
});

describe('toque', () => {
  const pe = (type: string, el: Element, id: number, primary = true) =>
    el.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: primary }));

  it('dois polegares: um só não arma; os dois armam; o primeiro que sai larga', () => {
    const s = setup({ coarse: true });
    const [l, r] = Array.from(s.zones.children);
    pe('pointerdown', l, 1);
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('idle');
    pe('pointerdown', r, 2, false);
    s.setT(800); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    pe('pointerup', l, 1);
    expect(s.timer.state).toBe('running');
  });

  it('toque cancelado pelo sistema abandona, não larga', () => {
    const s = setup({ coarse: true });
    const [l, r] = Array.from(s.zones.children);
    pe('pointerdown', l, 1); pe('pointerdown', r, 2, false);
    s.setT(400); s.timer.tick();
    pe('pointercancel', l, 1);
    expect(s.timer.state).toBe('idle');
  });

  it('um toque: tocar no tempo arma; tocar num botão não arma', () => {
    const s = setup({ coarse: true, mode: 'one' });
    pe('pointerdown', document.querySelector('[data-time]')!, 3);
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    pe('pointerup', document.querySelector('[data-time]')!, 3);
    expect(s.timer.state).toBe('running');
    pe('pointerdown', document.body, 4);
    expect(s.timer.state).toBe('done');
    const s2 = setup({ coarse: true, mode: 'one' });
    pe('pointerdown', document.querySelector('[data-act="plus2"]')!, 5);
    s2.setT(400); s2.timer.tick();
    expect(s2.timer.state).toBe('idle');
  });
});
