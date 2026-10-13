import { describe, expect, it } from 'vitest';
import { renderCentro } from '../../src/ui/centro';
import { createCentroAnimator, type Scheduler } from '../../src/ui/centro/animator';
import { createBehavior } from '../../src/ui/centro/behavior';
import { EXPRESSIONS, EYE_X, eyePath } from '../../src/ui/centro/face';

// Relógio, quadros e temporizadores de mentira: o teste avança o tempo de 16 em 16 ms.
function fakeScheduler() {
  let t = 0;
  let frames: (() => void)[] = [];
  const timers: { at: number; cb: () => void; on: boolean }[] = [];
  const sch: Scheduler = {
    now: () => t,
    frame: (cb) => {
      frames.push(cb);
      return () => {
        frames = frames.filter((f) => f !== cb);
      };
    },
    after: (ms, cb) => {
      const x = { at: t + ms, cb, on: true };
      timers.push(x);
      return () => {
        x.on = false;
      };
    },
  };
  return {
    sch,
    advance(ms: number): void {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + 16);
        for (const x of timers) {
          if (x.on && x.at <= t) {
            x.on = false;
            x.cb();
          }
        }
        const run = frames;
        frames = [];
        for (const f of run) f();
      }
    },
    frames: () => frames.length,
    timers: () => timers.filter((x) => x.on).length,
  };
}

function mount(): SVGElement {
  const host = document.createElement('div');
  host.innerHTML = renderCentro({ theme: 'light' });
  document.body.append(host);
  return host.querySelector('svg') as SVGElement;
}
const eyeD = (svg: SVGElement) => svg.querySelector('path.eye')?.getAttribute('d');
// Piscadas e olhadinhas longe (o sorteio dá sempre 0,99): os testes veem só o que pediram.
const calm = () => createBehavior(() => 0.99);

describe('animador do Centro', () => {
  it('troca de expressão anima em uns 200 ms, e o laço para quando assenta', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'arming', armProgress: 0.5 });
    clock.advance(48);
    expect(eyeD(svg)).not.toBe(eyePath(EXPRESSIONS.open, EYE_X.l));
    expect(eyeD(svg)).not.toBe(eyePath(EXPRESSIONS.half, EYE_X.l));
    clock.advance(600);
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(svg.dataset.eyes).toBe('half');
    expect(clock.frames()).toBe(0);
    expect(clock.timers()).toBe(0); // armando: sem piscada e sem órbita
  });

  it('parado e assentado: nenhum quadro seguido, só um temporizador; a órbita anda um adesivo a cada 0,95 s', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'idle' });
    clock.advance(300);
    expect(clock.frames()).toBe(0);
    expect(clock.timers()).toBe(1);
    expect(svg.querySelector('.ring.lit')?.getAttribute('data-k')).toBe('0');
    clock.advance(700);
    expect(svg.querySelector('.ring.lit')?.getAttribute('data-k')).toBe('1');
  });

  it('a mesma vista de novo não recomeça nada', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'ready' });
    clock.advance(600);
    const before = clock.frames() + clock.timers();
    anim.show({ state: 'ready' });
    expect(clock.frames() + clock.timers()).toBe(before);
  });

  it('no solve: freeze encaixa o foco, desenha um quadro e não deixa nada agendado', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'reaction', result: 'pb' });
    anim.trigger('pb');
    clock.advance(32);
    anim.freeze();
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.focus, EYE_X.l));
    expect(svg.querySelector('g.cbody')?.hasAttribute('transform')).toBe(false);
    expect(clock.frames() + clock.timers()).toBe(0);
    anim.show({ state: 'running' });
    clock.advance(5000);
    expect(clock.frames() + clock.timers()).toBe(0);
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.focus, EYE_X.l));
  });

  it('estático: troca na hora e não agenda nada', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm(), animated: false });
    anim.show({ state: 'idle' });
    expect(clock.frames() + clock.timers()).toBe(0);
    expect(svg.querySelectorAll('.ring.lit')).toHaveLength(0); // sem órbita
    anim.show({ state: 'arming', armProgress: 1 });
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.half, EYE_X.l));
    expect(clock.frames() + clock.timers()).toBe(0);
  });

  it('passar para estático no meio de um salto para o salto na hora, sem sobrar temporizador', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'reaction', result: 'pb' });
    anim.trigger('pb');
    clock.advance(160);
    expect(svg.querySelector('g.cbody')?.getAttribute('transform')).toMatch(/^translate\(0 -/);
    anim.setAnimated(false);
    expect(svg.querySelector('g.cbody')?.hasAttribute('transform')).toBe(false);
    expect(eyeD(svg)).toBe(eyePath(EXPRESSIONS.happy, EYE_X.l));
    expect(clock.frames() + clock.timers()).toBe(0);
  });

  it('pausado não agenda nada; ao voltar, pinta e agenda de novo', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'idle' });
    anim.setPaused(true);
    expect(clock.frames() + clock.timers()).toBe(0);
    clock.advance(5000);
    expect(clock.frames() + clock.timers()).toBe(0);
    anim.setPaused(false);
    expect(clock.timers()).toBe(1);
  });

  it('fim de temporada apaga a face de cima e a acende de novo, uma vez', () => {
    const clock = fakeScheduler();
    const svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm() });
    anim.show({ state: 'reaction', result: 'good' });
    anim.trigger('seasonEnd');
    clock.advance(300);
    expect(Number(svg.querySelector<SVGGElement>('g.top')?.style.opacity)).toBeLessThan(0.5);
    clock.advance(400);
    expect(svg.querySelector<SVGGElement>('g.top')?.style.opacity).toBe('');
    expect(clock.frames()).toBe(0);
  });

  it('um SVG refeito recebe o estado atual', () => {
    const clock = fakeScheduler();
    let svg = mount();
    const anim = createCentroAnimator({ svg: () => svg, scheduler: clock.sch, behavior: calm(), animated: false });
    anim.show({ state: 'ready' });
    svg = mount();
    anim.repaint();
    expect(svg.querySelectorAll('.ring.lit')).toHaveLength(8);
    expect(svg.dataset.eyes).toBe('focus');
  });
});
