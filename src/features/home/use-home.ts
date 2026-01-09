import { useCallback, useEffect, useState } from 'react';
import { useOnboardingStore } from '@/features/home/lib/onboarding/onboarding-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSettingsStore } from '@/shared/store/settings-store';
import type { Penalty } from '@/shared/types';
import type { CubeState } from './lib/scramble/cube-solver';
import { generateScramble } from './lib/scramble/scramble-manager';
import { useTimer } from './lib/use-timer';

export function useHome() {
  const [scramble, setScramble] = useState('');
  const [inspectionOvertime, setInspectionOvertime] = useState(0);
  const [showStatsInfo, setShowStatsInfo] = useState(false);
  const [cubeState, setCubeState] = useState<CubeState | null>(null);

  const { settings } = useSettingsStore();
  const { addSolve, updateSolvePenalty, getActiveSession } = useSessionsStore();

  const activeSession = getActiveSession();
  const currentPuzzle = activeSession?.puzzleType || '3x3';

  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const onboardingActive = useOnboardingStore((state) => state.isActive);
  const startOnboarding = useOnboardingStore((state) => state.startOnboarding);

  const { state, timeMs, inspectionTimeLeft, reset } = useTimer({
    inspectionDuration: settings.inspectionDuration,
    soundsEnabled: settings.soundsEnabled,
    onInspectionEnd: (overtime: number) => {
      setInspectionOvertime(overtime);
    },
  });

  const isFocusMode = state === 'running' || state === 'inspection';

  const generateNewScramble = useCallback(() => {
    const newScramble = generateScramble(currentPuzzle);
    setScramble(newScramble);
  }, [currentPuzzle]);

  // Calculate cube state whenever scramble changes
  useEffect(() => {
    if (currentPuzzle === '3x3' && scramble) {
      import('./lib/scramble/cube-solver').then(({ solveCubeState }) => {
        setCubeState(solveCubeState(scramble));
      });
    } else {
      setCubeState(null);
    }
  }, [scramble, currentPuzzle]);

  // Update scramble when puzzle type changes
  useEffect(() => {
    generateNewScramble();
  }, [generateNewScramble]);

  // Onboarding check
  useEffect(() => {
    if (!hasCompletedOnboarding && !onboardingActive) {
      startOnboarding();
    }
  }, [hasCompletedOnboarding, onboardingActive, startOnboarding]);

  // Save solve logic
  useEffect(() => {
    if (state === 'stopped' && timeMs > 0 && scramble) {
      let penalty: Penalty = 'NONE';

      if (settings.autoInspectionPenalty) {
        const overtime = inspectionOvertime;
        if (overtime >= 2000) {
          penalty = 'DNF';
        } else if (overtime > 0) {
          penalty = '+2';
        }
      }

      addSolve({
        timeMs,
        penalty,
        scramble,
      });

      generateNewScramble();
      setInspectionOvertime(0);
      reset();
    }
  }, [
    state,
    timeMs,
    scramble,
    inspectionOvertime,
    settings.autoInspectionPenalty,
    addSolve,
    generateNewScramble,
    reset,
  ]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Prevent shortcuts when timer is running/inspection
      if (state !== 'idle' && state !== 'stopped') return;

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        generateNewScramble();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        const session = useSessionsStore.getState().getActiveSession();
        const lastSolve = session?.solves.at(-1);
        if (lastSolve) {
          updateSolvePenalty(lastSolve.id, lastSolve.penalty === '+2' ? 'NONE' : '+2');
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const session = useSessionsStore.getState().getActiveSession();
        const lastSolve = session?.solves.at(-1);
        if (lastSolve) {
          updateSolvePenalty(lastSolve.id, lastSolve.penalty === 'DNF' ? 'NONE' : 'DNF');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [generateNewScramble, updateSolvePenalty, state]);

  return {
    scramble,
    state,
    timeMs,
    inspectionTimeLeft,
    isFocusMode,
    showStatsInfo,
    setShowStatsInfo,
    generateNewScramble,
    cubeState,
  };
}
