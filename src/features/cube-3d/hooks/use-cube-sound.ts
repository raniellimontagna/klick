import { useCallback, useEffect, useRef, useState } from 'react';

// Extend Window interface locally to avoid 'any'
interface WindowWithWebkit extends Window {
  webkitAudioContext?: typeof AudioContext;
}

export function useCubeSound() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const [enabled, setEnabled] = useState(true);

  // Initialize AudioContext on user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioContextRef.current) {
        const AudioContextClass =
          window.AudioContext || (window as WindowWithWebkit).webkitAudioContext;
        if (AudioContextClass) {
          audioContextRef.current = new AudioContextClass();
        }
      }
    };

    window.addEventListener('click', initAudio, { once: true });
    window.addEventListener('keydown', initAudio, { once: true });

    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('keydown', initAudio);
      audioContextRef.current?.close();
    };
  }, []);

  const playClick = useCallback(() => {
    if (!enabled || !audioContextRef.current) return;

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const t = ctx.currentTime;

    // --- High-Pass Noise Burst (Mechanical Click) ---
    // Create a buffer with noise
    const bufferSize = ctx.sampleRate * 0.1; // 0.1 seconds of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // White noise with exponential decay baked in for efficiency
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // High pass to keep only the "click" crisps
    const highPass = ctx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.setValueAtTime(1000, t);
    highPass.frequency.exponentialRampToValueAtTime(500, t + 0.1);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, t); // Reduced from 0.8
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    noiseSource.connect(highPass);
    highPass.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseSource.start(t);

    // --- Low Bump (Thud) ---
    const kickOsc = ctx.createOscillator();
    kickOsc.type = 'sine';
    kickOsc.frequency.setValueAtTime(150, t);
    kickOsc.frequency.exponentialRampToValueAtTime(50, t + 0.1);

    const kickGain = ctx.createGain();
    kickGain.gain.setValueAtTime(0.1, t); // Reduced from 0.3
    kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    kickOsc.connect(kickGain);
    kickGain.connect(ctx.destination);

    kickOsc.start(t);
    kickOsc.stop(t + 0.1);
  }, [enabled]);

  const toggleSound = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  return { playClick, toggleSound, enabled };
}
