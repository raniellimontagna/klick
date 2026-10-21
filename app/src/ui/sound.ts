// Sons sintetizados com Web Audio (sem arquivos). Sem AudioContext (ou se falhar), tudo vira silêncio.
// Porte de prototype/scripts/sound.js.
import type { Settings } from '../core/types';

type SoundGroups = Settings['sound'];
export type SoundGroup = keyof SoundGroups;

export interface Sound {
  klick(): void;
  tick(): void; // aviso da inspeção (o bipe)
  speak(text: string): boolean; // fala com uma voz em português; false sem a API ou sem voz em português (quem chamou cai no bipe)
  warn(ms: number, voice: boolean): void; // o aviso da inspeção aos 8 e 12 s: "oito"/"doze" com voz, o bipe sem ela; segue sound.insp
  chord(): void; // recorde
  unlock(voice?: boolean, activation?: boolean): void; // chamar num gesto da pessoa: o navegador só libera o áudio depois de um; com `voice`, prepara também a fala (o iOS descarta o primeiro speak fora de um gesto); `activation` é o gesto que o iOS conta (pointerup, keyup), que prepara mais uma vez
  close(): void; // devolve o AudioContext ao navegador (o iOS limita quantos a página abre); depois disso o som fica em silêncio
  setEnabled(group: SoundGroup, on: boolean): void;
}

type AudioContextClass = typeof AudioContext;

// O que o som usa da Web Speech; o teste põe um falso no lugar (segundo argumento de createSound).
type Speech = Pick<SpeechSynthesis, 'getVoices' | 'cancel' | 'speak' | 'addEventListener' | 'removeEventListener'>;
export interface SoundOptions {
  speech?: Speech | null; // omitido: o speechSynthesis do navegador, se houver
  words?: Readonly<Record<number, string>>; // o que se fala em cada tempo de aviso (ms → palavra; strings.ts); sem a palavra, o aviso é o bipe
}

function browserSpeech(): Speech | null {
  return typeof speechSynthesis === 'undefined' ? null : speechSynthesis;
}

// A voz em português: pt-BR primeiro, senão qualquer pt. O Android devolve "pt_BR" com sublinhado.
function pickPortuguese(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const lang = (v: SpeechSynthesisVoice): string => v.lang.toLowerCase().replace('_', '-');
  return voices.find((v) => lang(v) === 'pt-br') ?? voices.find((v) => lang(v) === 'pt' || lang(v).startsWith('pt-') || lang(v).startsWith('por')) ?? null;
}

// O aparelho tem voz em português? As vozes podem carregar depois; quem mostra isso na tela escuta `voiceschanged` (ver watchVoices).
export function hasPortugueseVoice(speech: Pick<SpeechSynthesis, 'getVoices'> | null = browserSpeech()): boolean {
  try {
    return !!speech && pickPortuguese(speech.getVoices()) !== null;
  } catch {
    return false;
  }
}

// Avisa quando as vozes do aparelho mudam (no Chrome elas chegam depois da página). Devolve quem solta o ouvinte.
export function watchVoices(fn: () => void, speech: Pick<SpeechSynthesis, 'addEventListener' | 'removeEventListener'> | null = browserSpeech()): () => void {
  if (!speech) return () => {};
  try {
    speech.addEventListener('voiceschanged', fn);
  } catch {
    return () => {};
  }
  return () => {
    try {
      speech.removeEventListener('voiceschanged', fn);
    } catch {
      /* já solto */
    }
  };
}

// O Safari antigo só tem webkitAudioContext, que não está nos tipos do DOM.
function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: AudioContextClass };
  return w.AudioContext || w.webkitAudioContext || null;
}

export function createSound(initial: SoundGroups = { klick: true, insp: true, pb: true }, options: SoundOptions = {}): Sound {
  const enabled: SoundGroups = { ...initial };
  const AC = audioContextClass();
  let ctx: AudioContext | null = null;
  let closed = false;

  function ensure(): AudioContext | null {
    if (!AC || closed) return null;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') Promise.resolve(ctx.resume()).catch(() => {});
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq: number, dur: number, vol: number, delay = 0): void {
    const c = ensure();
    if (!c) return;
    try {
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch {
      /* som é opcional */
    }
  }

  // "klick": rajada curta de ruído filtrado, como um botão mecânico.
  function klick(): void {
    if (!enabled.klick) return;
    const c = ensure();
    if (!c) return;
    try {
      const len = Math.floor(c.sampleRate * 0.03);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
      const src = c.createBufferSource();
      const bp = c.createBiquadFilter();
      const g = c.createGain();
      src.buffer = buf;
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 3;
      g.gain.value = 0.6;
      src.connect(bp).connect(g).connect(c.destination);
      src.start();
    } catch {
      /* som é opcional */
    }
  }

  // A voz: guardada e atualizada no `voiceschanged`, que é quando o navegador termina de carregá-las. O ouvinte só entra no primeiro uso.
  const speech = options.speech === undefined ? browserSpeech() : options.speech;
  let voice: SpeechSynthesisVoice | null = null;
  let unwatch: (() => void) | null = null;

  function refreshVoice(): void {
    try {
      voice = speech ? pickPortuguese(speech.getVoices()) : null;
    } catch {
      voice = null;
    }
  }

  // Fala `text` com a voz em português. `cancel` limpa a fila antes; a preparação (volume 0) não cancela nada.
  function utter(text: string, volume: number, cancel: boolean): boolean {
    if (!speech || closed || typeof SpeechSynthesisUtterance === 'undefined') return false;
    try {
      if (!unwatch) {
        unwatch = watchVoices(refreshVoice, speech);
        refreshVoice();
      }
      if (!voice) refreshVoice(); // as vozes podem ter chegado sem o evento
      if (!voice) return false;
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang.replace('_', '-');
      u.volume = volume;
      if (cancel) speech.cancel(); // o "doze" não espera atrás do "oito"
      speech.speak(u);
      return true;
    } catch {
      return false;
    }
  }

  const speak = (text: string): boolean => utter(text, 1, true);

  // O iOS só libera a fala depois de um speak dentro de um gesto: sem isso o primeiro "oito", que sai do laço do timer, some em silêncio.
  // Uma fala muda por som, e só quando há voz em português (sem ela, tenta de novo no próximo gesto).
  // O gesto de ativação (pointerup, keyup) prepara mais uma vez: o do pointerdown pode ter sido descartado, e o iOS só conta o de ativação.
  let primed = false;
  let primedOnActivation = false;
  function prime(activation: boolean): void {
    if (activation) {
      if (primedOnActivation) return;
      primedOnActivation = utter(' ', 0, false);
      primed ||= primedOnActivation;
      return;
    }
    if (primed) return;
    primed = utter(' ', 0, false);
  }

  return {
    klick,
    tick() {
      if (enabled.insp) tone(1320, 0.05, 0.15);
    },
    speak,
    warn(ms, voiceOn) {
      if (!enabled.insp) return;
      const word = options.words?.[ms];
      if (voiceOn && word && speak(word)) return;
      tone(1320, 0.05, 0.15);
    },
    chord() {
      if (enabled.pb) [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.35, 0.12, i * 0.04));
    },
    unlock(voiceOn = false, activation = false) {
      ensure();
      if (voiceOn) prime(activation);
    },
    // Fecha o contexto, se algum foi aberto; chamar de novo não faz nada, e um som fechado não abre outro.
    close() {
      closed = true;
      unwatch?.();
      unwatch = null;
      const c = ctx;
      ctx = null;
      if (!c) return;
      try {
        Promise.resolve(c.close()).catch(() => {});
      } catch {
        /* já fechado: nada a devolver */
      }
    },
    setEnabled(group, on) {
      enabled[group] = on;
    },
  };
}
