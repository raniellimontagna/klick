import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../scripts/sound.js';

test('sem AudioContext (Node), os sons viram silêncio sem lançar erro', () => {
  const s = createSound();
  assert.doesNotThrow(() => {
    s.unlock();
    s.klick();
    s.tick();
    s.chord();
    s.setEnabled('pb', false);
    s.chord();
  });
});

test('cada grupo de som liga e desliga sozinho', () => {
  const made = { osc: 0, buf: 0 };
  class FakeCtx {
    constructor() {
      this.state = 'running';
      this.currentTime = 0;
      this.sampleRate = 8000;
      this.destination = {};
    }
    resume() {
      return Promise.resolve();
    }
    createOscillator() {
      made.osc++;
      return { type: '', frequency: {}, connect: (n) => n, start() {}, stop() {} };
    }
    createGain() {
      return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n };
    }
    createBuffer(channels, length) {
      return { getChannelData: () => new Float32Array(length) };
    }
    createBufferSource() {
      made.buf++;
      return { buffer: null, connect: (n) => n, start() {} };
    }
    createBiquadFilter() {
      return { type: '', frequency: {}, Q: {}, connect: (n) => n };
    }
  }
  const plays = { klick: (s) => s.klick(), insp: (s) => s.tick(), pb: (s) => s.chord() };
  const count = (s, group) => {
    const before = made.osc + made.buf;
    plays[group](s);
    return made.osc + made.buf - before;
  };
  const previous = globalThis.window;
  globalThis.window = { AudioContext: FakeCtx };
  try {
    for (const g of Object.keys(plays)) {
      const s = createSound();
      s.setEnabled(g, false);
      s.setEnabled(g, false); // desligar duas vezes continua desligado (não é um "inverter")
      for (const other of Object.keys(plays)) {
        if (other === g) assert.equal(count(s, other), 0, `${g} desligado não toca`);
        else assert.ok(count(s, other) > 0, `${other} continua tocando com ${g} desligado`);
      }
      s.setEnabled(g, true);
      assert.ok(count(s, g) > 0, `${g} volta a tocar quando religado`);
    }
    const quiet = createSound({ klick: false, insp: true, pb: true });
    assert.equal(count(quiet, 'klick'), 0, 'createSound respeita os grupos iniciais');
    assert.ok(count(quiet, 'insp') > 0);
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
