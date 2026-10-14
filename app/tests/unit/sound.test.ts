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

  // O iOS limita quantos AudioContext uma página abre: quem cria um som por tela (o treino) precisa devolvê-lo ao sair.
  describe('close', () => {
    function fakeAudio() {
      const made = { contexts: 0, closed: 0 };
      class FakeCtx {
        state = 'running';
        currentTime = 0;
        sampleRate = 8000;
        destination = {};
        constructor() {
          made.contexts++;
        }
        resume() {
          return Promise.resolve();
        }
        close() {
          made.closed++;
          this.state = 'closed';
          return Promise.resolve();
        }
        createBuffer(_channels: number, length: number) {
          return { getChannelData: () => new Float32Array(length) };
        }
        createBufferSource() {
          return { buffer: null, connect: (n: unknown) => n, start() {} };
        }
        createBiquadFilter() {
          return { type: '', frequency: {}, Q: {}, connect: (n: unknown) => n };
        }
        createGain() {
          return { gain: { value: 0 }, connect: (n: unknown) => n };
        }
      }
      return { made, FakeCtx };
    }

    it('fecha o AudioContext que o som abriu, uma vez só, mesmo chamado duas vezes', () => {
      const { made, FakeCtx } = fakeAudio();
      vi.stubGlobal('window', { AudioContext: FakeCtx });
      try {
        const s = createSound();
        s.klick(); // abre o contexto
        expect(made.contexts).toBe(1);
        s.close();
        s.close();
        expect(made.closed).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('sem contexto aberto, close não faz nada (nem abre um só para fechar)', () => {
      const { made, FakeCtx } = fakeAudio();
      vi.stubGlobal('window', { AudioContext: FakeCtx });
      try {
        const s = createSound();
        expect(() => s.close()).not.toThrow();
        expect(made).toEqual({ contexts: 0, closed: 0 });
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('depois de fechado, o som fica em silêncio e não abre outro contexto', () => {
      const { made, FakeCtx } = fakeAudio();
      vi.stubGlobal('window', { AudioContext: FakeCtx });
      try {
        const s = createSound();
        s.unlock();
        s.close();
        s.unlock();
        s.klick();
        s.tick();
        s.chord();
        expect(made.contexts).toBe(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('um close que falha não derruba quem sai da tela', async () => {
      const { FakeCtx } = fakeAudio();
      class Broken extends FakeCtx {
        close(): Promise<void> {
          return Promise.reject(new Error('já fechado'));
        }
      }
      vi.stubGlobal('window', { AudioContext: Broken });
      try {
        const s = createSound();
        s.unlock();
        expect(() => s.close()).not.toThrow();
        await Promise.resolve(); // o catch da promessa roda; nada vaza como rejeição não tratada
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
