import { describe, expect, it, vi } from 'vitest';
import { createSound } from '../../src/ui/sound';
import type { Sound } from '../../src/ui/sound';

// Casos portados de prototype/tests/sound.test.js.
describe('sons', () => {
  it('sem AudioContext (o jsdom não tem), os sons viram silêncio sem lançar erro', () => {
    const s = createSound();
    expect(() => {
      s.unlock();
      s.klick();
      s.tick();
      s.chord();
      s.setEnabled('pb', false);
      s.chord();
    }).not.toThrow();
  });

  it('cada grupo de som liga e desliga sozinho', () => {
    const made = { osc: 0, buf: 0 };
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      sampleRate = 8000;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        made.osc++;
        return { type: '', frequency: {}, connect: (n: unknown) => n, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
      }
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
      }
      createBufferSource() {
        made.buf++;
        return { buffer: null, connect: (n: unknown) => n, start() {} };
      }
      createBiquadFilter() {
        return { type: '', frequency: {}, Q: {}, connect: (n: unknown) => n };
      }
    }
    const plays = { klick: (s: Sound) => s.klick(), insp: (s: Sound) => s.tick(), pb: (s: Sound) => s.chord() };
    type Group = keyof typeof plays;
    const count = (s: Sound, group: Group) => {
      const before = made.osc + made.buf;
      plays[group](s);
      return made.osc + made.buf - before;
    };
    vi.stubGlobal('window', { AudioContext: FakeCtx });
    try {
      for (const g of Object.keys(plays) as Group[]) {
        const s = createSound();
        s.setEnabled(g, false);
        s.setEnabled(g, false); // desligar duas vezes continua desligado (não é um "inverter")
        for (const other of Object.keys(plays) as Group[]) {
          if (other === g) expect(count(s, other), `${g} desligado não toca`).toBe(0);
          else expect(count(s, other), `${other} continua tocando com ${g} desligado`).toBeGreaterThan(0);
        }
        s.setEnabled(g, true);
        expect(count(s, g), `${g} volta a tocar quando religado`).toBeGreaterThan(0);
      }
      const quiet = createSound({ klick: false, insp: true, pb: true });
      expect(count(quiet, 'klick'), 'createSound respeita os grupos iniciais').toBe(0);
      expect(count(quiet, 'insp')).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
