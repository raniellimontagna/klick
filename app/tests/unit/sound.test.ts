import { describe, expect, it, vi } from 'vitest';
import { createSound, hasPortugueseVoice } from '../../src/ui/sound';
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

// A voz do aviso da inspeção (Web Speech). O seam é o segundo argumento de createSound: um speechSynthesis falso.
describe('voz', () => {
  type FakeVoice = { lang: string; name: string };
  function fakeSpeech(voices: FakeVoice[]) {
    const said: { text: string; lang: string; voice: FakeVoice | null }[] = [];
    const listeners = new Set<() => void>();
    const synth = {
      said,
      cancelled: 0,
      voices,
      getVoices: () => synth.voices,
      cancel() {
        synth.cancelled++;
      },
      speak(u: { text: string; lang: string; voice: FakeVoice | null }) {
        said.push({ text: u.text, lang: u.lang, voice: u.voice });
      },
      addEventListener: (_t: string, fn: () => void) => void listeners.add(fn),
      removeEventListener: (_t: string, fn: () => void) => void listeners.delete(fn),
      fire: () => listeners.forEach((fn) => fn()),
      listeners,
    };
    class Utterance {
      voice: FakeVoice | null = null;
      lang = '';
      constructor(public text: string) {}
    }
    return { synth, Utterance };
  }

  it('speak fala com a voz em português', () => {
    const { synth, Utterance } = fakeSpeech([
      { lang: 'en-US', name: 'Inglês' },
      { lang: 'pt-PT', name: 'Portugal' },
      { lang: 'pt-BR', name: 'Brasil' },
    ]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      expect(s.speak('oito')).toBe(true);
      expect(synth.said).toHaveLength(1);
      expect(synth.said[0].text).toBe('oito');
      expect(synth.said[0].voice?.name).toBe('Brasil'); // pt-BR ganha de pt-PT
      expect(synth.said[0].lang).toBe('pt-BR');
      // Sem pt-BR, serve qualquer português; um segundo fala cancela o que ainda estiver na fila.
      synth.voices = [{ lang: 'pt_PT', name: 'Portugal' }];
      s.close();
      const t = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      const cancelled = synth.cancelled;
      expect(t.speak('doze')).toBe(true);
      expect(synth.cancelled).toBe(cancelled + 1);
      expect(synth.said[1].voice?.name).toBe('Portugal');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sem speechSynthesis ou sem voz em português, speak devolve false', () => {
    const { synth, Utterance } = fakeSpeech([{ lang: 'en-US', name: 'Inglês' }]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      expect(createSound(undefined, { speech: null }).speak('oito')).toBe(false);
      expect(createSound().speak('oito')).toBe(false); // o jsdom não tem speechSynthesis
      expect(createSound(undefined, { speech: synth as unknown as SpeechSynthesis }).speak('oito')).toBe(false);
      expect(synth.said).toHaveLength(0);
      // uma API que lança também vira false, sem quebrar
      const quebrada = { getVoices: () => { throw new Error('x'); }, addEventListener() {}, removeEventListener() {} };
      expect(createSound(undefined, { speech: quebrada as unknown as SpeechSynthesis }).speak('oito')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('as vozes que carregam depois (voiceschanged) passam a valer, e close solta o ouvinte', () => {
    const { synth, Utterance } = fakeSpeech([]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      expect(s.speak('oito')).toBe(false); // ainda sem vozes
      synth.voices = [{ lang: 'pt-BR', name: 'Brasil' }];
      synth.fire();
      expect(s.speak('oito')).toBe(true);
      s.close();
      expect(synth.listeners.size).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('warn: fala "oito" e "doze" com voz, cai no bipe sem voz em português e respeita o liga e desliga do aviso', () => {
    const { synth, Utterance } = fakeSpeech([{ lang: 'pt-BR', name: 'Brasil' }]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    const made = { osc: 0 };
    class FakeCtx {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() {
        return Promise.resolve();
      }
      createOscillator() {
        made.osc++;
        return { type: '', frequency: {}, connect: (n: unknown) => n, start() {}, stop() {} };
      }
      createGain() {
        return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n: unknown) => n };
      }
    }
    vi.stubGlobal('window', { AudioContext: FakeCtx });
    try {
      const words = { 8000: 'oito', 12000: 'doze' };
      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis, words });
      s.warn(8000, true);
      s.warn(12000, true);
      expect(synth.said.map((x) => x.text)).toEqual(['oito', 'doze']);
      expect(made.osc).toBe(0);
      s.warn(8000, false); // sem Voz: o bipe
      expect(made.osc).toBe(1);
      synth.voices = [];
      s.close();
      const t = createSound(undefined, { speech: synth as unknown as SpeechSynthesis, words });
      t.warn(8000, true); // sem voz em português: o bipe
      expect(made.osc).toBe(2);
      t.setEnabled('insp', false);
      t.warn(12000, true);
      t.warn(12000, false);
      expect(made.osc).toBe(2);
      expect(synth.said).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unlock com voz ligada prepara a fala uma vez, com uma fala muda; sem voz ligada nunca', () => {
    const { synth, Utterance } = fakeSpeech([{ lang: 'pt-BR', name: 'Brasil' }]);
    const made: { text: string; volume: number }[] = [];
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class extends Utterance {
        volume = 1;
        constructor(text: string) {
          super(text);
          made.push(this);
        }
      },
    );
    try {
      const off = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      off.unlock();
      off.unlock(false);
      expect(synth.said).toHaveLength(0);
      expect(off.speak('oito')).toBe(true); // a preparação não é pré-requisito do speak
      synth.said.length = 0;
      made.length = 0;

      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      s.unlock(true);
      expect(synth.said).toHaveLength(1);
      expect(made[0].volume).toBe(0);
      expect(made[0].text.trim()).toBe('');
      s.unlock(true);
      expect(synth.said).toHaveLength(1); // só uma vez por som
      expect(s.speak('oito')).toBe(true);
      expect(synth.said.map((x) => x.text.trim())).toEqual(['', 'oito']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  // O iOS só vale a fala num evento de ativação (pointerup, keyup): a preparação do pointerdown pode ter sido descartada, então o primeiro
  // unlock de ativação prepara de novo, uma vez, mesmo com o do gesto anterior já feito.
  it('unlock(true, true), o gesto de ativação, prepara a fala mais uma vez depois do pointerdown, e só uma', () => {
    const { synth, Utterance } = fakeSpeech([{ lang: 'pt-BR', name: 'Brasil' }]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      s.unlock(true); // pointerdown
      expect(synth.said).toHaveLength(1);
      s.unlock(true, true); // pointerup
      expect(synth.said).toHaveLength(2);
      s.unlock(true, true);
      s.unlock(true);
      expect(synth.said).toHaveLength(2);
      const off = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      off.unlock(false, true); // sem Voz, nada
      expect(synth.said).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('as palavras do aviso vêm de quem cria o som (strings.ts); sem elas, o aviso é só o bipe', () => {
    const { synth, Utterance } = fakeSpeech([{ lang: 'pt-BR', name: 'Brasil' }]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis, words: { 8000: 'eight', 12000: 'twelve' } });
      s.warn(8000, true);
      s.warn(12000, true);
      expect(synth.said.map((x) => x.text)).toEqual(['eight', 'twelve']);
      const bare = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      bare.warn(8000, true);
      expect(synth.said).toHaveLength(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sem voz em português, unlock(true) não fala nada e tenta de novo quando a voz chegar', () => {
    const { synth, Utterance } = fakeSpeech([]);
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance);
    try {
      const s = createSound(undefined, { speech: synth as unknown as SpeechSynthesis });
      s.unlock(true);
      expect(synth.said).toHaveLength(0);
      synth.voices = [{ lang: 'pt-BR', name: 'Brasil' }];
      s.unlock(true);
      expect(synth.said).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('o código "por" (ISO 639-2) também vale como português', () => {
    expect(hasPortugueseVoice({ getVoices: () => [{ lang: 'por-BRA' }] } as unknown as SpeechSynthesis)).toBe(true);
  });

  it('hasPortugueseVoice diz se o aparelho tem voz em português', () => {
    expect(hasPortugueseVoice({ getVoices: () => [{ lang: 'pt-BR' }] } as unknown as SpeechSynthesis)).toBe(true);
    expect(hasPortugueseVoice({ getVoices: () => [{ lang: 'en-GB' }] } as unknown as SpeechSynthesis)).toBe(false);
    expect(hasPortugueseVoice(null)).toBe(false);
    expect(hasPortugueseVoice()).toBe(false);
  });
});
