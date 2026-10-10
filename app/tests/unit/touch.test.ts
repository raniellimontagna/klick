import { describe, expect, it } from 'vitest';
import { STATES, createTimer } from '../../src/core/timer';
import { createTouchArm } from '../../src/core/touch';

function rig({ inspection = false, mode = 'two' }: { inspection?: boolean; mode?: 'two' | 'one' } = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection });
  const touch = createTouchArm({
    press: timer.press,
    release: timer.release,
    cancel: timer.cancel,
    getState: () => timer.state,
    getInspection: () => inspection,
    mode,
  });
  const at = (ms: number) => {
    t = ms;
    timer.tick();
  };
  return { timer, touch, at };
}

// Casos portados de prototype/tests/touch.test.js.
describe('armar no toque', () => {
  it('dois polegares: um só não arma; os dois armam; o primeiro que sai larga', () => {
    const { timer, touch, at } = rig();
    touch.down(1, 'left');
    at(400);
    expect(timer.state).toBe(STATES.IDLE);
    touch.down(2, 'right');
    at(800);
    expect(timer.state).toBe(STATES.READY);
    touch.up(1);
    expect(timer.state).toBe(STATES.RUNNING);
    touch.up(2);
    expect(timer.state).toBe(STATES.RUNNING);
    at(5000);
    touch.down(3, 'left');
    expect(timer.state).toBe(STATES.DONE);
  });

  it('dois dedos na mesma zona não armam', () => {
    const { timer, touch, at } = rig();
    touch.down(1, 'left');
    touch.down(2, 'left');
    at(500);
    expect(timer.state).toBe(STATES.IDLE);
  });

  it('com inspeção: um toque inicia a inspeção e depois os dois polegares armam', () => {
    const { timer, touch, at } = rig({ inspection: true });
    touch.down(1, 'left');
    touch.up(1);
    expect(timer.state).toBe(STATES.INSPECT);
    at(3000);
    touch.down(2, 'left');
    expect(timer.state).toBe(STATES.INSPECT);
    touch.down(3, 'right');
    at(3300);
    expect(timer.state).toBe(STATES.READY);
    touch.up(3);
    expect(timer.state).toBe(STATES.RUNNING);
  });

  it('soltar antes do verde volta para a inspeção', () => {
    const { timer, touch, at } = rig({ inspection: true });
    touch.down(1, 'right');
    touch.up(1);
    at(2000);
    touch.down(2, 'left');
    touch.down(3, 'right');
    at(2100);
    touch.up(2);
    expect(timer.state).toBe(STATES.INSPECT);
  });

  it('modo um toque: qualquer dedo arma', () => {
    const { timer, touch, at } = rig({ mode: 'one' });
    touch.down(1, 'left');
    at(300);
    expect(timer.state).toBe(STATES.READY);
    touch.up(1);
    expect(timer.state).toBe(STATES.RUNNING);
  });

  it('cancelAll abandona sem largar: pronto volta ao parado e o toque de inspeção não vale', () => {
    const { timer, touch, at } = rig();
    touch.down(1, 'left');
    touch.down(2, 'right');
    at(400);
    expect(timer.state).toBe(STATES.READY);
    touch.cancelAll();
    expect(timer.state).toBe(STATES.IDLE);
    const withInspection = rig({ inspection: true });
    withInspection.touch.down(1, 'left');
    withInspection.touch.cancelAll();
    expect(withInspection.timer.state).toBe(STATES.IDLE);
    withInspection.touch.down(2, 'left');
    withInspection.touch.up(2);
    expect(withInspection.timer.state).toBe(STATES.INSPECT);
  });

  it('parar com dois dedos e inspeção ligada não inicia outra inspeção', () => {
    const { timer, touch, at } = rig({ inspection: true });
    touch.down(1, 'left');
    touch.up(1);
    at(1000);
    touch.down(2, 'left');
    touch.down(3, 'right');
    at(1300);
    touch.up(2);
    expect(timer.state).toBe(STATES.RUNNING);
    touch.up(3);
    at(5000);
    touch.down(4, 'left');
    touch.down(5, 'right');
    touch.up(4);
    touch.up(5);
    expect(timer.state).toBe(STATES.DONE);
    touch.down(6, 'right');
    touch.up(6);
    expect(timer.state).toBe(STATES.INSPECT);
  });
});
