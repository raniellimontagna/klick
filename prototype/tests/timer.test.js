import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, STATES } from '../scripts/timer.js';

function rig(opts = {}) {
  let t = 0;
  const timer = createTimer({ now: () => t, holdMs: 300, inspection: false, ...opts });
  const log = { states: [], warns: [], done: [] };
  timer.on('state', (s) => log.states.push(s));
  timer.on('warn', (w) => log.warns.push(w));
  timer.on('done', (r) => log.done.push(r));
  const at = (ms) => {
    t = ms;
    timer.tick();
  };
  return { timer, log, at, setTime: (ms) => { t = ms; } };
}

test('sem inspeção: segurar 0,3 s arma, soltar larga, apertar para', () => {
  const { timer, log, at } = rig();
  timer.press();
  assert.equal(timer.state, STATES.ARMING);
  at(299);
  assert.equal(timer.state, STATES.ARMING);
  assert.ok(timer.armProgress > 0.99 && timer.armProgress < 1);
  at(300);
  assert.equal(timer.state, STATES.READY);
  timer.release();
  assert.equal(timer.state, STATES.RUNNING);
  at(300 + 58420);
  timer.press();
  assert.equal(timer.state, STATES.DONE);
  assert.deepEqual(log.done, [{ ms: 58420, penalty: null }]);
  assert.equal(timer.elapsed, 58420);
});

test('soltar antes do verde volta ao parado sem resultado', () => {
  const { timer, log, at } = rig();
  timer.press();
  at(150);
  timer.release();
  assert.equal(timer.state, STATES.IDLE);
  assert.equal(log.done.length, 0);
});

test('tempo para armar 0 fica pronto na hora', () => {
  const { timer } = rig({ holdMs: 0 });
  timer.press();
  assert.equal(timer.state, STATES.READY);
});

test('soltar a tecla depois de parar não faz nada', () => {
  const { timer, at } = rig({ holdMs: 0 });
  timer.press();
  timer.release();
  at(1000);
  timer.press();
  timer.release();
  assert.equal(timer.state, STATES.DONE);
});

test('com inspeção: apertar e soltar inicia; segurar arma; soltar larga sem penalidade', () => {
  const { timer, log, at } = rig({ inspection: true });
  timer.press();
  assert.equal(timer.state, STATES.IDLE);
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  at(5000);
  assert.equal(timer.inspectElapsed, 5000);
  timer.press();
  at(5300);
  assert.equal(timer.state, STATES.READY);
  timer.release();
  assert.equal(timer.state, STATES.RUNNING);
  at(65300);
  timer.press();
  assert.deepEqual(log.done, [{ ms: 60000, penalty: null }]);
});

test('soltar antes do verde durante a inspeção volta para a inspeção, que continua contando', () => {
  const { timer, at } = rig({ inspection: true });
  timer.press();
  timer.release();
  at(4000);
  timer.press();
  at(4100);
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  at(6000);
  assert.equal(timer.inspectElapsed, 6000);
});

test('avisos de 8 s e 12 s saem uma vez só', () => {
  const { timer, log, at } = rig({ inspection: true });
  timer.press();
  timer.release();
  at(7999);
  at(8000);
  at(9000);
  at(12500);
  at(13000);
  assert.deepEqual(log.warns, [8000, 12000]);
});

test('largar depois de 15 s dá +2; depois de 17 s, DNF', () => {
  for (const [startAt, expected] of [[15500, '+2'], [17500, 'DNF']]) {
    const { timer, log, at } = rig({ inspection: true });
    timer.press();
    timer.release();
    at(startAt - 300);
    timer.press();
    at(startAt);
    timer.release();
    at(startAt + 40000);
    timer.press();
    assert.equal(log.done[0].penalty, expected);
  }
});

test('depois de um resultado, o próximo ciclo começa de novo', () => {
  const { timer, at } = rig({ inspection: true });
  timer.press();
  timer.release();
  at(1000);
  timer.press();
  at(1300);
  timer.release();
  at(2000);
  timer.press();
  assert.equal(timer.state, STATES.DONE);
  timer.release();
  timer.press();
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  assert.equal(timer.inspectElapsed, 0);
});

test('setOptions vale no próximo ciclo e reset volta ao parado', () => {
  const { timer, at } = rig();
  timer.setOptions({ inspection: true });
  timer.press();
  timer.release();
  assert.equal(timer.state, STATES.INSPECT);
  timer.reset();
  assert.equal(timer.state, STATES.IDLE);
  at(100);
  assert.equal(timer.inspectElapsed, 0);
});

test('soltar depois do tempo de armar larga mesmo sem tick no meio', () => {
  const { timer, setTime } = rig();
  timer.press();
  setTime(310);
  timer.release();
  assert.equal(timer.state, STATES.RUNNING);
});

test('reset limpa o resultado anterior', () => {
  const { timer, at } = rig({ holdMs: 0 });
  timer.press();
  timer.release();
  at(1000);
  timer.press();
  assert.deepEqual(timer.result, { ms: 1000, penalty: null });
  timer.reset();
  assert.equal(timer.result, null);
});
