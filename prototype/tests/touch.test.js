import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, STATES } from '../scripts/timer.js';
import { createTouchArm } from '../scripts/touch.js';

function rig({ inspection = false, mode = 'two' } = {}) {
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
  const at = (ms) => {
    t = ms;
    timer.tick();
  };
  return { timer, touch, at };
}

test('dois polegares: um só não arma; os dois armam; o primeiro que sai larga', () => {
  const { timer, touch, at } = rig();
  touch.down(1, 'left');
  at(400);
  assert.equal(timer.state, STATES.IDLE);
  touch.down(2, 'right');
  at(800);
  assert.equal(timer.state, STATES.READY);
  touch.up(1);
  assert.equal(timer.state, STATES.RUNNING);
  touch.up(2);
  assert.equal(timer.state, STATES.RUNNING);
  at(5000);
  touch.down(3, 'left');
  assert.equal(timer.state, STATES.DONE);
});

test('dois dedos na mesma zona não armam', () => {
  const { timer, touch, at } = rig();
  touch.down(1, 'left');
  touch.down(2, 'left');
  at(500);
  assert.equal(timer.state, STATES.IDLE);
});

test('com inspeção: um toque inicia a inspeção e depois os dois polegares armam', () => {
  const { timer, touch, at } = rig({ inspection: true });
  touch.down(1, 'left');
  touch.up(1);
  assert.equal(timer.state, STATES.INSPECT);
  at(3000);
  touch.down(2, 'left');
  assert.equal(timer.state, STATES.INSPECT);
  touch.down(3, 'right');
  at(3300);
  assert.equal(timer.state, STATES.READY);
  touch.up(3);
  assert.equal(timer.state, STATES.RUNNING);
});

test('soltar antes do verde volta para a inspeção', () => {
  const { timer, touch, at } = rig({ inspection: true });
  touch.down(1, 'right');
  touch.up(1);
  at(2000);
  touch.down(2, 'left');
  touch.down(3, 'right');
  at(2100);
  touch.up(2);
  assert.equal(timer.state, STATES.INSPECT);
});

test('modo um toque: qualquer dedo arma', () => {
  const { timer, touch, at } = rig({ mode: 'one' });
  touch.down(1, 'left');
  at(300);
  assert.equal(timer.state, STATES.READY);
  touch.up(1);
  assert.equal(timer.state, STATES.RUNNING);
});

test('cancelAll abandona sem largar: pronto volta ao parado e o toque de inspeção não vale', () => {
  const { timer, touch, at } = rig();
  touch.down(1, 'left');
  touch.down(2, 'right');
  at(400);
  assert.equal(timer.state, STATES.READY);
  touch.cancelAll();
  assert.equal(timer.state, STATES.IDLE);
  const withInspection = rig({ inspection: true });
  withInspection.touch.down(1, 'left');
  withInspection.touch.cancelAll();
  assert.equal(withInspection.timer.state, STATES.IDLE);
  withInspection.touch.down(2, 'left');
  withInspection.touch.up(2);
  assert.equal(withInspection.timer.state, STATES.INSPECT);
});

test('parar com dois dedos e inspeção ligada não inicia outra inspeção', () => {
  const { timer, touch, at } = rig({ inspection: true });
  touch.down(1, 'left');
  touch.up(1);
  at(1000);
  touch.down(2, 'left');
  touch.down(3, 'right');
  at(1300);
  touch.up(2);
  assert.equal(timer.state, STATES.RUNNING);
  touch.up(3);
  at(5000);
  touch.down(4, 'left');
  touch.down(5, 'right');
  touch.up(4);
  touch.up(5);
  assert.equal(timer.state, STATES.DONE);
  touch.down(6, 'right');
  touch.up(6);
  assert.equal(timer.state, STATES.INSPECT);
});
