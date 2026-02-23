import { useEffect, useRef, useState } from 'react';
import { useOnboardingStore } from '@/features/home/lib/onboarding/onboarding-store';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSettingsStore } from '@/shared/store/settings-store';
import type { Penalty, TimerState } from '@/shared/types';
import type { CubeState } from './lib/scramble/cube-solver';
import { useTimer } from './lib/use-timer';

export interface UseHomeReturn {
  scramble: string;
  state: TimerState;
  timeMs: number;
  inspectionTimeLeft: number;
  isFocusMode: boolean;
  showStatsInfo: boolean;
  setShowStatsInfo: (show: boolean) => void;
  generateNewScramble: () => void;
  cubeState: CubeState | null;
  isNewBest: boolean;
  lastPenalty: Penalty;
}

export const useHome = (): UseHomeReturn => {
  const { scramble, generateNewScramble } = useScrambleStore();
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

  const { state, timeMs, inspectionTimeLeft } = useTimer({
    inspectionDuration: settings.inspectionDuration,
    soundsEnabled: settings.soundsEnabled,
    onInspectionEnd: (overtime: number) => {
      setInspectionOvertime(overtime);
    },
  });

  const isFocusMode = state === 'running' || state === 'inspection';

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

  // Feedback state
  const [isNewBest, setIsNewBest] = useState(false);
  const [lastPenalty, setLastPenalty] = useState<Penalty>('NONE');

  // Save solve logic
  const solveProcessedRef = useRef(false);

  useEffect(() => {
    if (state === 'stopped' && timeMs > 0 && scramble && !solveProcessedRef.current) {
      solveProcessedRef.current = true;
      let penalty: Penalty = 'NONE';

      if (settings.autoInspectionPenalty) {
        const overtime = inspectionOvertime;
        if (overtime >= 2000) {
          penalty = 'DNF';
        } else if (overtime > 0) {
          penalty = '+2';
        }
      }

      // Check if it's a new best single
      const currentBest = useSessionsStore.getState().getSingle();
      const isPB = penalty !== 'DNF' && (currentBest.value === 0 || timeMs < currentBest.value);
      setIsNewBest(isPB);
      setLastPenalty(penalty);

      addSolve({
        timeMs,
        penalty,
        scramble,
      });

      generateNewScramble();
      setInspectionOvertime(0);
      // reset(); // DON'T RESET to allow feedback to show
    } else if (state !== 'stopped') {
      solveProcessedRef.current = false;

      if (state === 'idle') {
        // Reset feedback when starting new solve attempt (entering idle)
        setIsNewBest(false);
        setLastPenalty('NONE');
      }
    }
  }, [
    state,
    timeMs,
    scramble,
    inspectionOvertime,
    settings.autoInspectionPenalty,
    addSolve,
    generateNewScramble,
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
          setLastPenalty(lastSolve.penalty === '+2' ? 'NONE' : '+2'); // Update local feedback
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const session = useSessionsStore.getState().getActiveSession();
        const lastSolve = session?.solves.at(-1);
        if (lastSolve) {
          updateSolvePenalty(lastSolve.id, lastSolve.penalty === 'DNF' ? 'NONE' : 'DNF');
          setLastPenalty(lastSolve.penalty === 'DNF' ? 'NONE' : 'DNF'); // Update local feedback
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
    isNewBest,
    lastPenalty,
  };
};
