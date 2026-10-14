// Sons sintetizados com Web Audio (sem arquivos). Sem AudioContext (ou se falhar), tudo vira silêncio.
// Porte de prototype/scripts/sound.js.
import type { Settings } from '../core/types';

type SoundGroups = Settings['sound'];
export type SoundGroup = keyof SoundGroups;

export interface Sound {
  klick(): void;
  tick(): void; // aviso da inspeção
  chord(): void; // recorde
  unlock(): void; // chamar num gesto da pessoa: o navegador só libera o áudio depois de um
  close(): void; // devolve o AudioContext ao navegador (o iOS limita quantos a página abre); depois disso o som fica em silêncio
  setEnabled(group: SoundGroup, on: boolean): void;
}

type AudioContextClass = typeof AudioContext;

// O Safari antigo só tem webkitAudioContext, que não está nos tipos do DOM.
function audioContextClass(): AudioContextClass | null {
  if (typeof window === 'undefined') return null;
  const w = window as typeof window & { webkitAudioContext?: AudioContextClass };
  return w.AudioContext || w.webkitAudioContext || null;
}

export function createSound(initial: SoundGroups = { klick: true, insp: true, pb: true }): Sound {
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

  return {
    klick,
    tick() {
      if (enabled.insp) tone(1320, 0.05, 0.15);
    },
    chord() {
      if (enabled.pb) [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.35, 0.12, i * 0.04));
    },
    unlock() {
      ensure();
    },
    // Fecha o contexto, se algum foi aberto; chamar de novo não faz nada, e um som fechado não abre outro.
    close() {
      closed = true;
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
