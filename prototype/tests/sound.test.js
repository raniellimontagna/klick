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
  const previous = globalThis.window;
  globalThis.window = { AudioContext: FakeCtx };
  try {
    const s = createSound();
    s.klick();
    assert.equal(made.buf, 1);
    s.tick();
    assert.equal(made.osc, 1);
    s.chord();
    assert.equal(made.osc, 4);
    s.setEnabled('klick', false);
    s.setEnabled('insp', false);
    s.setEnabled('pb', false);
    s.klick();
    s.tick();
    s.chord();
    assert.deepEqual(made, { osc: 4, buf: 1 });
  } finally {
    if (previous === undefined) delete globalThis.window;
    else globalThis.window = previous;
  }
});
