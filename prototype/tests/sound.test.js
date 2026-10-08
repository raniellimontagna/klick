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
