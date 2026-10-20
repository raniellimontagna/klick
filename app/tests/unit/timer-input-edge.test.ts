import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTimer } from '../../src/core/timer';
import { createTouchArm } from '../../src/core/touch';
import { createInputController, eventTime } from '../../src/ui/timer/input';

// Casos extras da entrada: horário do evento (eventTime e a mesma base no gesto), atalhos, inspeção, cliques e abandono.
// O jsdom põe timeStamp de época (Date.now()), então eventos "com horário válido" recebem um timeStamp escolhido aqui.

const stamp = <E extends Event>(e: E, ts: number): E => {
  Object.defineProperty(e, 'timeStamp', { value: ts });
  return e;
};

let cleanups: Array<() => void> = [];
afterEach(() => {
  cleanups.forEach((f) => f());
  cleanups = [];
  Reflect.deleteProperty(document, 'hidden');
});

function setup(o: { coarse?: boolean; mode?: 'two' | 'one'; inspection?: boolean; tab?: boolean } = {}) {
  let t = 0;
  let dialog = false;
  const tab = o.tab ?? true;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection: o.inspection ?? false, onError: vi.fn() });
  const touch = createTouchArm({
    press: (at) => timer.press(at),
    release: (at) => timer.release(at),
    cancel: () => timer.cancel(),
    getState: () => timer.state,
    getInspection: () => o.inspection ?? false,
    mode: o.mode ?? 'two',
  });
  const actions: string[] = [];
  const onWake = vi.fn();
  const ctl = createInputController(
    { timer, touch, tabIsTimer: () => tab, dialogOpen: () => dialog, onAction: (a) => actions.push(a), onWake },
    { coarse: () => o.coarse ?? false, armMode: () => o.mode ?? 'two' },
  );
  document.body.innerHTML =
    '<section data-screen="timer"><span data-time>0</span><div data-zones><div data-zone="left"></div><div data-zone="right"></div></div><button data-act="plus2">+2</button><input data-note /></section>';
  const screen = document.querySelector('[data-screen="timer"]') as HTMLElement;
  const zones = document.querySelector('[data-zones]') as HTMLElement;
  const detach = ctl.attach(document, window, zones, screen);
  cleanups.push(detach);
  const [left, right] = Array.from(zones.children) as HTMLElement[];
  return {
    timer, ctl, actions, onWake, zones, left, right, detach,
    setT: (v: number) => { t = v; },
    setDialog: (v: boolean) => { dialog = v; },
  };
}

type KeyOpts = { target?: EventTarget; repeat?: boolean; ts?: number; meta?: boolean };
const key = (type: 'keydown' | 'keyup', code: string, k: string, o: KeyOpts = {}) => {
  const ev = new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true, repeat: o.repeat ?? false, metaKey: o.meta ?? false });
  if (o.ts !== undefined) stamp(ev, o.ts);
  (o.target ?? document.body).dispatchEvent(ev);
  return ev;
};

type PointerOpts = { primary?: boolean; ts?: number };
const pe = (type: string, el: EventTarget, id: number, o: PointerOpts = {}) => {
  const ev = new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: o.primary ?? true });
  if (o.ts !== undefined) stamp(ev, o.ts);
  el.dispatchEvent(ev);
  return ev;
};

describe('eventTime', () => {
  const ev = (ts: number) => stamp(new Event('keydown'), ts);

  it('devolve o horário do evento quando ele está na janela de 60 s', () => {
    expect(eventTime(ev(1200), () => 1000)).toBe(1200);
  });

  it('NaN (ou infinito) vira undefined', () => {
    expect(eventTime(ev(NaN), () => 1000)).toBeUndefined();
    expect(eventTime(ev(Infinity), () => 1000)).toBeUndefined();
  });

  it('fora da janela de 60 s vira undefined, nos dois sentidos', () => {
    expect(eventTime(ev(1000 + 60_000), () => 1000)).toBeUndefined();
    expect(eventTime(ev(1000 - 60_001), () => 1000)).toBeUndefined();
    expect(eventTime(ev(1000 + 59_999), () => 1000)).toBe(1000 + 59_999);
  });

  it('timeStamp de época (como o do jsdom) cai no relógio do timer', () => {
    expect(eventTime(new Event('keydown'))).toBeUndefined();
    expect(eventTime(stamp(new Event('keydown'), Date.now()))).toBeUndefined();
  });

  it('sem o segundo argumento, compara com performance.now()', () => {
    const now = performance.now();
    expect(eventTime(stamp(new Event('keydown'), now))).toBe(now);
  });
});

describe('mesma base no gesto (teclado)', () => {
  it('armado pelo relógio do timer, o soltar não usa o horário do evento', () => {
    const s = setup();
    s.setT(0);
    key('keydown', 'Space', ' ', { ts: Date.now() }); // horário inválido: o armar vai pelo relógio do timer
    s.setT(100);
    key('keyup', 'Space', ' ', { ts: performance.now() + 5000 }); // horário válido, mas a base é outra
    expect(s.timer.state).toBe('idle');
  });

  it('armado com horário do evento, o soltar também usa o horário do evento', () => {
    const s = setup();
    const base = performance.now();
    s.setT(0);
    key('keydown', 'Space', ' ', { ts: base });
    s.setT(10_000); // o relógio do timer diz que se passou muito tempo: não deve contar
    key('keyup', 'Space', ' ', { ts: base + 100 });
    expect(s.timer.state).toBe('idle');
  });

  it('larga e para pelo horário do evento, não pelo relógio do timer', () => {
    const s = setup();
    const base = performance.now();
    key('keydown', 'Space', ' ', { ts: base });
    s.setT(10_000);
    key('keyup', 'Space', ' ', { ts: base + 400 });
    expect(s.timer.state).toBe('running');
    key('keydown', 'KeyA', 'a', { ts: base + 1400 });
    expect(s.timer.state).toBe('done');
    expect(s.timer.result?.ms).toBe(1000);
  });

  it('soltar com o diálogo aberto aborta, não larga', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    s.setDialog(true);
    key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('idle');
  });

  it('fora da aba do Timer, o espaço não arma e não é engolido', () => {
    const s = setup({ tab: false });
    const ev = key('keydown', 'Space', ' ');
    expect(ev.defaultPrevented).toBe(false);
    expect(s.timer.state).toBe('idle');
  });
});

describe('mesma base no gesto (toque)', () => {
  it('primeiro dedo sem horário: o gesto inteiro usa o relógio do timer', () => {
    const s = setup({ coarse: true });
    s.setT(0);
    pe('pointerdown', s.left, 1, { ts: Date.now() });
    pe('pointerdown', s.right, 2, { primary: false, ts: performance.now() });
    expect(s.timer.state).toBe('arming');
    s.setT(100);
    pe('pointerup', s.right, 2, { ts: performance.now() + 5000 });
    expect(s.timer.state).toBe('idle');
  });

  it('dedos com horário do evento: armar e soltar usam o horário do evento', () => {
    const s = setup({ coarse: true });
    const base = performance.now();
    s.setT(0);
    pe('pointerdown', s.left, 1, { ts: base });
    pe('pointerdown', s.right, 2, { primary: false, ts: base });
    expect(s.timer.state).toBe('arming');
    s.setT(10_000);
    pe('pointerup', s.left, 1, { ts: base + 100 });
    expect(s.timer.state).toBe('idle');
  });

  it('dedos com horário do evento: o soltar depois do verde larga pelo horário do evento', () => {
    const s = setup({ coarse: true });
    const base = performance.now();
    pe('pointerdown', s.left, 1, { ts: base });
    pe('pointerdown', s.right, 2, { primary: false, ts: base });
    s.setT(10_000);
    pe('pointerup', s.left, 1, { ts: base + 400 });
    expect(s.timer.state).toBe('running');
  });

  it('o soltar do toque é ouvido na janela, não só na zona', () => {
    const s = setup({ coarse: true });
    pe('pointerdown', s.left, 1);
    pe('pointerdown', s.right, 2, { primary: false });
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    pe('pointerup', window, 1);
    expect(s.timer.state).toBe('running');
  });

  it('abandonHold tira a marca de zona pressionada e esquece o toque', () => {
    const s = setup({ coarse: true });
    pe('pointerdown', s.left, 1);
    expect(s.left.classList.contains('down')).toBe(true);
    s.ctl.abandonHold();
    expect(s.left.classList.contains('down')).toBe(false);
    pe('pointerup', s.left, 1);
    expect(s.timer.state).toBe('idle');
  });

  it('pointercancel numa zona abandona', () => {
    const s = setup({ coarse: true });
    pe('pointerdown', s.left, 1);
    pe('pointerdown', s.right, 2, { primary: false });
    s.setT(400); s.timer.tick();
    pe('pointercancel', s.left, 1);
    expect(s.timer.state).toBe('idle');
  });
});

describe('atalhos', () => {
  it('cada tecla chama onAction com o nome certo, na ordem', () => {
    const s = setup();
    const keys: Array<[string, string]> = [
      ['KeyP', 'p'], ['KeyD', 'd'], ['KeyM', 'm'], ['Backspace', 'Backspace'], ['KeyZ', 'z'],
      ['KeyN', 'n'], ['Slash', '?'], ['Digit1', '1'], ['Digit2', '2'], ['Digit3', '3'], ['Digit4', '4'], ['Digit5', '5'],
    ];
    keys.forEach(([code, k]) => key('keydown', code, k));
    expect(s.actions).toEqual(['plus2', 'dnf', 'note', 'delete', 'undo', 'next', 'shortcuts', 'tab1', 'tab2', 'tab3', 'tab4', 'tab5']);
  });

  it('M segura o padrão do navegador', () => {
    setup();
    expect(key('keydown', 'KeyM', 'm').defaultPrevented).toBe(true);
  });

  it('com Ctrl, Alt ou Meta, as letras não viram atalho', () => {
    const s = setup();
    key('keydown', 'KeyP', 'p', { meta: true });
    expect(s.actions).toEqual([]);
  });

  it('fora da aba do Timer, letras não atuam, mas 1–5 e ? seguem', () => {
    const s = setup({ tab: false });
    key('keydown', 'KeyP', 'p');
    key('keydown', 'Digit2', '2');
    key('keydown', 'Slash', '?');
    expect(s.actions).toEqual(['tab2', 'shortcuts']);
  });

  it('durante a inspeção, letras não atuam; 1–5 seguem como no protótipo', () => {
    const s = setup({ inspection: true });
    key('keydown', 'Space', ' ');
    key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('inspect');
    key('keydown', 'KeyP', 'p');
    key('keydown', 'Digit1', '1');
    expect(s.actions).toEqual(['tab1']);
  });

  it('digitando num campo de texto, ? e 1–5 também não disparam', () => {
    const s = setup();
    const input = document.querySelector('[data-note]') as HTMLInputElement;
    key('keydown', 'Slash', '?', { target: input });
    key('keydown', 'Digit1', '1', { target: input });
    expect(s.actions).toEqual([]);
  });
});

describe('timer rodando', () => {
  it('qualquer tecla para, e o espaço que parou não pareia com soltar', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('running');
    s.setT(1000);
    key('keydown', 'Space', ' ');
    expect(s.timer.state).toBe('done');
    key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('done');
  });

  it('rodando com um campo de texto focado, qualquer tecla para mesmo assim (ordem do protótipo)', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('running');
    const input = document.querySelector('[data-note]') as HTMLInputElement;
    input.focus();
    expect(document.activeElement).toBe(input);
    const ev = key('keydown', 'KeyA', 'a', { target: input });
    expect(s.timer.state).toBe('done');
    expect(ev.defaultPrevented).toBe(true);
  });

  it('auto-repeat do espaço segurado de antes não para o solve', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    key('keyup', 'Space', ' ');
    expect(s.timer.state).toBe('running');
    key('keydown', 'Space', ' ', { repeat: true });
    expect(s.timer.state).toBe('running');
  });

  it('toque no timer rodando para e não arma de novo, mesmo na tela inteira', () => {
    const s = setup({ coarse: true, mode: 'one' });
    const time = document.querySelector('[data-time]')!;
    pe('pointerdown', time, 1);
    s.setT(400); s.timer.tick();
    pe('pointerup', time, 1);
    expect(s.timer.state).toBe('running');
    pe('pointerdown', time, 2);
    expect(s.timer.state).toBe('done');
    pe('pointerup', time, 2);
    expect(s.timer.state).toBe('done');
  });

  it('o clique da parada é engolido uma vez só', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    key('keyup', 'Space', ' ');
    const btn = document.querySelector('[data-act="plus2"]') as HTMLButtonElement;
    const spy = vi.fn();
    btn.addEventListener('click', spy);
    pe('pointerdown', btn, 1);
    expect(s.timer.state).toBe('done');
    btn.click();
    expect(spy).not.toHaveBeenCalled();
    btn.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  // Review Focus 2, pela entrada inteira (os eventos de ponteiro nas zonas e fora delas): com fases, o dedo novo marca, com outro encostado.
  it('com fases, um dedo novo (numa zona ou fora dela) com outro ainda encostado marca a fase', () => {
    const s = setup({ coarse: true });
    s.timer.setOptions({ phases: 3 });
    pe('pointerdown', s.left, 1);
    pe('pointerdown', s.right, 2, { primary: false });
    s.setT(400); s.timer.tick();
    pe('pointerup', window, 1);
    pe('pointerup', window, 2);
    expect(s.timer.state).toBe('running');
    s.setT(2400);
    pe('pointerdown', s.left, 3); // a primeira fase, e o dedo fica
    expect(s.timer.marks).toEqual([2000]);
    s.setT(4400);
    pe('pointerdown', s.right, 4, { primary: false }); // outro dedo na outra zona: a segunda
    expect(s.timer.marks).toEqual([2000, 4000]);
    s.setT(6400);
    pe('pointerdown', document.querySelector('[data-time]')!, 5, { primary: false }); // fora das zonas: a última, que para
    expect(s.timer.state).toBe('done');
    expect(s.timer.result?.phases).toEqual([2000, 2000, 2000]);
  });

  it('um segundo dedo que não é primário não libera o clique engolido', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    key('keyup', 'Space', ' ');
    const btn = document.querySelector('[data-act="plus2"]') as HTMLButtonElement;
    const spy = vi.fn();
    btn.addEventListener('click', spy);
    pe('pointerdown', btn, 1);
    pe('pointerdown', document.body, 2, { primary: false });
    btn.click();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('abandono e ciclo de vida', () => {
  it('página escondida abandona sem largar', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.timer.state).toBe('idle');
  });

  it('página visível não abandona', () => {
    const s = setup();
    key('keydown', 'Space', ' ');
    s.setT(400); s.timer.tick();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(s.timer.state).toBe('ready');
  });

  it('detach tira todos os ouvintes: teclado, zonas, tela e janela', () => {
    const s = setup({ coarse: true, mode: 'one' });
    pe('pointerdown', document.querySelector('[data-time]')!, 1); // um toque arma na tela inteira
    s.setT(400); s.timer.tick();
    expect(s.timer.state).toBe('ready');
    s.detach();
    pe('pointerup', window, 1); // o soltar na janela não pode mais largar
    expect(s.timer.state).toBe('ready');
    window.dispatchEvent(new Event('blur')); // nem o blur abandona
    expect(s.timer.state).toBe('ready');
    pe('pointerdown', s.right, 2); // nem a zona marca (a esquerda ainda tem o dedo do armar)
    expect(s.right.classList.contains('down')).toBe(false);
    key('keydown', 'KeyP', 'p'); // nem o teclado atua
    expect(s.actions).toEqual([]);

    const s2 = setup({ coarse: true, mode: 'one' }); // a tela também não arma, mesmo com o toque na área do timer
    s2.detach();
    pe('pointerdown', document.querySelector('[data-time]')!, 3);
    expect(s2.timer.state).toBe('idle');
  });

  it('todo evento de entrada avisa a tela para acordar (onWake)', () => {
    const s = setup();
    key('keydown', 'KeyP', 'p');
    expect(s.onWake).toHaveBeenCalledTimes(1);
    pe('pointerdown', document.body, 1);
    expect(s.onWake).toHaveBeenCalledTimes(2);
  });
});
