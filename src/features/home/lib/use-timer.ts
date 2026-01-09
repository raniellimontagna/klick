import { useCallback, useEffect, useRef, useState } from 'react';
import { shouldPlaySound, sounds } from '@/shared/lib';
import type { TimerState } from '@/shared/types';

interface UseTimerReturn {
  state: TimerState;
  timeMs: number;
  inspectionTimeLeft: number;
  startInspection: () => void;
  startTimer: () => void;
  stopTimer: () => void;
  reset: () => void;
}

interface UseTimerOptions {
  inspectionDuration?: number;
  soundsEnabled?: boolean;
  onInspectionEnd?: (timeOverMs: number) => void;
}

export function useTimer({
  inspectionDuration = 15,
  soundsEnabled = false,
  onInspectionEnd,
}: UseTimerOptions = {}): UseTimerReturn {
  const [state, setState] = useState<TimerState>('idle');
  const [timeMs, setTimeMs] = useState(0);
  const [inspectionTimeLeft, setInspectionTimeLeft] = useState(inspectionDuration);

  const startTimeRef = useRef<number>(0);
  const inspectionStartRef = useRef<number>(0);
  const animationFrameRef = useRef<number>(0);
  const inspectionIntervalRef = useRef<number | null>(null);
  const spaceKeyDownRef = useRef<boolean>(false);
  const warningPlayedRef = useRef<boolean>(false);
  const criticalPlayedRef = useRef<boolean>(false);
  const ignoreNextKeyUpRef = useRef<boolean>(false);

  const updateTimer = useCallback(() => {
    if (state === 'running') {
      const now = performance.now();
      setTimeMs(Math.floor(now - startTimeRef.current));
      animationFrameRef.current = requestAnimationFrame(updateTimer);
    }
  }, [state]);

  const startInspection = useCallback(() => {
    setState('inspection');
    inspectionStartRef.current = Date.now();
    setInspectionTimeLeft(inspectionDuration);
    setTimeMs(0);
    warningPlayedRef.current = false;
    criticalPlayedRef.current = false;
  }, [inspectionDuration]);

  const startTimer = useCallback(() => {
    if (state === 'inspection') {
      const inspectionElapsed = (Date.now() - inspectionStartRef.current) / 1000;
      const timeOver = Math.max(0, inspectionElapsed - inspectionDuration);
      if (onInspectionEnd) {
        onInspectionEnd(timeOver * 1000);
      }

      if (inspectionIntervalRef.current) {
        clearInterval(inspectionIntervalRef.current);
        inspectionIntervalRef.current = null;
      }
    }

    setState('running');
    startTimeRef.current = performance.now();
    setTimeMs(0);

    // Play start sound
    if (shouldPlaySound(soundsEnabled)) {
      sounds.timerStart();
    }
  }, [state, inspectionDuration, soundsEnabled, onInspectionEnd]);

  const stopTimer = useCallback(() => {
    if (state === 'running') {
      setState('stopped');
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      ignoreNextKeyUpRef.current = true;

      // Play stop sound
      if (shouldPlaySound(soundsEnabled)) {
        sounds.timerStop();
      }
    }
  }, [state, soundsEnabled]);

  const reset = useCallback(() => {
    setState('idle');
    setTimeMs(0);
    setInspectionTimeLeft(inspectionDuration);
    if (!spaceKeyDownRef.current) {
      ignoreNextKeyUpRef.current = false;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    if (inspectionIntervalRef.current) {
      clearInterval(inspectionIntervalRef.current);
      inspectionIntervalRef.current = null;
    }
  }, [inspectionDuration]);

  useEffect(() => {
    if (state === 'inspection') {
      inspectionIntervalRef.current = setInterval(() => {
        const elapsed = (Date.now() - inspectionStartRef.current) / 1000;
        const timeLeft = Math.max(0, inspectionDuration - elapsed);
        setInspectionTimeLeft(timeLeft);

        // Play warning sound at 15s mark (when timeLeft is between 0 and 0.1)
        if (timeLeft <= 0.1 && timeLeft > 0 && !warningPlayedRef.current) {
          if (shouldPlaySound(soundsEnabled)) {
            sounds.inspectionWarning();
          }
          warningPlayedRef.current = true;
        }

        // Play critical sound at 17s mark (2s overtime)
        if (elapsed >= inspectionDuration + 2 && !criticalPlayedRef.current) {
          if (shouldPlaySound(soundsEnabled)) {
            sounds.inspectionCritical();
          }
          criticalPlayedRef.current = true;
        }
      }, 100);

      return () => {
        if (inspectionIntervalRef.current) {
          clearInterval(inspectionIntervalRef.current);
        }
      };
    }
  }, [state, inspectionDuration, soundsEnabled]);

  useEffect(() => {
    if (state === 'running') {
      updateTimer();
    }
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state, updateTimer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space' && !e.repeat && !spaceKeyDownRef.current) {
        e.preventDefault();
        spaceKeyDownRef.current = true;

        if (state === 'running') {
          stopTimer();
        } else if (state === 'stopped') {
          reset();
          // Optional: sound for reset?
        } else if (state === 'idle') {
          // Play ready sound when holding space
          if (shouldPlaySound(soundsEnabled)) {
            sounds.timerReady();
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space' && spaceKeyDownRef.current) {
        e.preventDefault();
        spaceKeyDownRef.current = false;

        if (ignoreNextKeyUpRef.current) {
          ignoreNextKeyUpRef.current = false;
          return;
        }

        if (state === 'idle') {
          startInspection();
        } else if (state === 'inspection') {
          startTimer();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [state, soundsEnabled, startInspection, startTimer, stopTimer, reset]);

  return {
    state,
    timeMs,
    inspectionTimeLeft,
    startInspection,
    startTimer,
    stopTimer,
    reset,
  };
}
