// Sons sintetizados com Web Audio (sem arquivos). Sem AudioContext (ou se falhar), tudo vira silêncio.
export function createSound(initial = { klick: true, insp: true, pb: true }) {
  const enabled = { ...initial };
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  let ctx = null;

  function ensure() {
    if (!AC) return null;
    try {
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, vol, delay = 0) {
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
  function klick() {
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
    tick: () => enabled.insp && tone(1320, 0.05, 0.15),
    chord: () => enabled.pb && [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.35, 0.12, i * 0.04)),
    unlock: () => {
      ensure();
    },
    setEnabled(group, on) {
      enabled[group] = on;
    },
  };
}
