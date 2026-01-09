// Audio context for generating beep sounds
let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioContext = new AudioContextClass();
    }
  }
  return audioContext as AudioContext;
};

type BeepConfig = {
  frequency: number;
  duration: number;
  volume?: number;
  type?: OscillatorType;
};

const playBeep = ({ frequency, duration, volume = 0.3, type = 'sine' }: BeepConfig): void => {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;
    gainNode.gain.value = volume;

    const now = ctx.currentTime;
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.gain.exponentialRampToValueAtTime(0.01, now + duration);

    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch (error) {
    console.warn('Failed to play sound:', error);
  }
};

// Sound effects for different timer events
export const sounds = {
  // Inspection warning (15s mark) - gentle beep
  inspectionWarning: () => {
    playBeep({ frequency: 800, duration: 0.1, volume: 0.2 });
  },

  // Inspection critical (17s mark) - urgent double beep
  inspectionCritical: () => {
    playBeep({ frequency: 1000, duration: 0.1, volume: 0.3 });
    setTimeout(() => {
      playBeep({ frequency: 1000, duration: 0.1, volume: 0.3 });
    }, 120);
  },

  // Timer ready to start - soft click
  timerReady: () => {
    playBeep({ frequency: 600, duration: 0.05, volume: 0.15, type: 'square' });
  },

  // Timer started - low beep
  timerStart: () => {
    playBeep({ frequency: 400, duration: 0.08, volume: 0.2 });
  },

  // Timer stopped - confirmation beep
  timerStop: () => {
    playBeep({ frequency: 1200, duration: 0.15, volume: 0.25 });
  },

  // Success feedback (for actions like copy, save)
  success: () => {
    playBeep({ frequency: 800, duration: 0.08, volume: 0.2 });
    setTimeout(() => {
      playBeep({ frequency: 1000, duration: 0.08, volume: 0.2 });
    }, 80);
  },

  // Error feedback
  error: () => {
    playBeep({ frequency: 300, duration: 0.2, volume: 0.25, type: 'square' });
  },
};

// Helper to check if sounds should be played
export const shouldPlaySound = (soundsEnabled: boolean): boolean => {
  return soundsEnabled && typeof window !== 'undefined' && 'AudioContext' in window;
};
