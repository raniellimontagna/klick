import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOnboardingStore } from '@/features/home/lib/onboarding/onboarding-store';
import { shouldPlaySound, sounds } from '@/shared/lib';
import { useProgressStore } from '@/shared/store/progress-store';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSettingsStore } from '@/shared/store/settings-store';
import type {
  Penalty,
  ProgressChallenge,
  ProgressSummary,
  Solve,
  TimerState,
} from '@/shared/types';
import { shouldIgnoreGlobalShortcut } from '../lib/keyboard-shortcuts';
import type { CubeState } from '../lib/scramble/cube-solver';
import { useTimer } from '../lib/use-timer';

export type HomeVisualizationMode = '3d' | '2d';
export type HomeSolveFilter = 5 | 12 | 50;
type SessionsState = ReturnType<typeof useSessionsStore.getState>;

interface HomeShortcutActions {
  generateNewScramble: () => void;
  toggleLastPlus2: () => void;
  toggleLastDNF: () => void;
  undoLastSolve: () => void;
}

interface UseHomeTimerDashboardReturn {
  scramble: string;
  state: TimerState;
  timeMs: number;
  inspectionTimeLeft: number;
  inspectionDuration: number;
  isFocusMode: boolean;
  cubeState: CubeState | null;
  copied: boolean;
  copyScramble: () => Promise<void>;
  visualizationMode: HomeVisualizationMode;
  setVisualizationMode: (mode: HomeVisualizationMode) => void;
  solveFilter: HomeSolveFilter;
  setSolveFilter: (filter: HomeSolveFilter) => void;
  solves: Solve[];
  filteredSolves: Solve[];
  lastPenalty: Penalty;
  isNewBest: boolean;
  generateNewScramble: () => void;
  toggleLastPlus2: () => void;
  toggleLastDNF: () => void;
  undoLastSolve: () => void;
  single: ReturnType<SessionsState['getSingle']>;
  ao5: ReturnType<SessionsState['getAo5']>;
  ao12: ReturnType<SessionsState['getAo12']>;
  bestAo5: ReturnType<SessionsState['getBestAo5']>;
  bestAo12: ReturnType<SessionsState['getBestAo12']>;
  progressSummary: ProgressSummary;
  dailyChallenges: ProgressChallenge[];
}

function resolveLastSolvePenalty(solves: Solve[]): Penalty {
  return solves.at(-1)?.penalty ?? 'NONE';
}

function buildShortcutHandlers(actions: HomeShortcutActions) {
  return (event: KeyboardEvent, state: TimerState) => {
    if (shouldIgnoreGlobalShortcut(event.target)) {
      return;
    }

    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    if (state !== 'idle' && state !== 'stopped') {
      return;
    }

    const key = event.key.toLowerCase();

    if (key === 'n') {
      event.preventDefault();
      actions.generateNewScramble();
      return;
    }

    if (key === 'p') {
      event.preventDefault();
      actions.toggleLastPlus2();
      return;
    }

    if (key === 'd') {
      event.preventDefault();
      actions.toggleLastDNF();
      return;
    }

    if (key === 'u') {
      event.preventDefault();
      actions.undoLastSolve();
    }
  };
}

export function useHomeTimerDashboard(): UseHomeTimerDashboardReturn {
  const { scramble, generateNewScramble: generateScramble } = useScrambleStore();
  const { settings } = useSettingsStore();

  const {
    addSolve,
    updateSolvePenalty,
    deleteSolve,
    getActiveSession,
    getSingle,
    getAo5,
    getAo12,
    getBestAo5,
    getBestAo12,
  } = useSessionsStore();
  const progressSummary = useProgressStore((state) => state.summary);
  const progressChallenges = useProgressStore((state) => state.challenges);
  const dailyChallenges = useMemo(
    () => progressChallenges.filter((challenge) => challenge.dateKey === progressSummary.todayKey),
    [progressChallenges, progressSummary.todayKey],
  );

  const [inspectionOvertime, setInspectionOvertime] = useState(0);
  const [cubeState, setCubeState] = useState<CubeState | null>(null);
  const [copied, setCopied] = useState(false);
  const [visualizationMode, setVisualizationMode] = useState<HomeVisualizationMode>('3d');
  const [solveFilter, setSolveFilter] = useState<HomeSolveFilter>(12);
  const [isNewBest, setIsNewBest] = useState(false);
  const [lastPenalty, setLastPenalty] = useState<Penalty>('NONE');

  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const onboardingActive = useOnboardingStore((state) => state.isActive);
  const startOnboarding = useOnboardingStore((state) => state.startOnboarding);

  const solveProcessedRef = useRef(false);

  const activeSession = getActiveSession();
  const solves = activeSession?.solves ?? [];
  const currentPuzzle = activeSession?.puzzleType ?? '3x3';

  const { state, timeMs, inspectionTimeLeft } = useTimer({
    inspectionDuration: settings.inspectionDuration,
    soundsEnabled: settings.soundsEnabled,
    onInspectionEnd: setInspectionOvertime,
  });

  const isFocusMode = state === 'running' || state === 'inspection';

  const filteredSolves = useMemo(() => {
    return [...solves].reverse().slice(0, solveFilter);
  }, [solves, solveFilter]);

  const copyScramble = useCallback(async () => {
    if (!scramble) {
      return;
    }

    await navigator.clipboard.writeText(scramble);
    setCopied(true);

    if (shouldPlaySound(settings.soundsEnabled)) {
      sounds.success();
    }

    window.setTimeout(() => setCopied(false), 1800);
  }, [scramble, settings.soundsEnabled]);

  const generateNewScramble = useCallback(() => {
    generateScramble(currentPuzzle);
  }, [currentPuzzle, generateScramble]);

  const toggleLastPlus2 = useCallback(() => {
    const session = useSessionsStore.getState().getActiveSession();
    const lastSolve = session?.solves.at(-1);

    if (!lastSolve) {
      return;
    }

    const nextPenalty: Penalty = lastSolve.penalty === '+2' ? 'NONE' : '+2';
    updateSolvePenalty(lastSolve.id, nextPenalty);
    setLastPenalty(nextPenalty);
    setIsNewBest(false);
  }, [updateSolvePenalty]);

  const toggleLastDNF = useCallback(() => {
    const session = useSessionsStore.getState().getActiveSession();
    const lastSolve = session?.solves.at(-1);

    if (!lastSolve) {
      return;
    }

    const nextPenalty: Penalty = lastSolve.penalty === 'DNF' ? 'NONE' : 'DNF';
    updateSolvePenalty(lastSolve.id, nextPenalty);
    setLastPenalty(nextPenalty);
    setIsNewBest(false);
  }, [updateSolvePenalty]);

  const undoLastSolve = useCallback(() => {
    const session = useSessionsStore.getState().getActiveSession();
    const lastSolve = session?.solves.at(-1);

    if (!lastSolve) {
      return;
    }

    deleteSolve(lastSolve.id);

    const updatedSolves = useSessionsStore.getState().getActiveSession()?.solves ?? [];
    setLastPenalty(resolveLastSolvePenalty(updatedSolves));
    setIsNewBest(false);
  }, [deleteSolve]);

  useEffect(() => {
    generateScramble(currentPuzzle);
  }, [currentPuzzle, generateScramble]);

  useEffect(() => {
    if (!hasCompletedOnboarding && !onboardingActive) {
      startOnboarding();
    }
  }, [hasCompletedOnboarding, onboardingActive, startOnboarding]);

  useEffect(() => {
    if (currentPuzzle !== '3x3' || !scramble) {
      setCubeState(null);
      return;
    }

    import('../lib/scramble/cube-solver').then(({ solveCubeState }) => {
      setCubeState(solveCubeState(scramble));
    });
  }, [currentPuzzle, scramble]);

  useEffect(() => {
    if (state === 'stopped' && timeMs > 0 && scramble && !solveProcessedRef.current) {
      solveProcessedRef.current = true;
      let penalty: Penalty = 'NONE';

      if (settings.autoInspectionPenalty) {
        if (inspectionOvertime >= 2000) {
          penalty = 'DNF';
        } else if (inspectionOvertime > 0) {
          penalty = '+2';
        }
      }

      const adjustedTime = penalty === '+2' ? timeMs + 2000 : timeMs;
      const currentBest = useSessionsStore.getState().getSingle();
      const hasPersonalBest =
        penalty !== 'DNF' && (currentBest.value === 0 || adjustedTime < currentBest.value);

      setIsNewBest(hasPersonalBest);
      setLastPenalty(penalty);

      addSolve({
        timeMs,
        penalty,
        scramble,
      });

      generateScramble(currentPuzzle);
      setInspectionOvertime(0);
      return;
    }

    if (state !== 'stopped') {
      solveProcessedRef.current = false;
    }

    if (state === 'idle') {
      setIsNewBest(false);
      setLastPenalty(resolveLastSolvePenalty(solves));
    }
  }, [
    addSolve,
    currentPuzzle,
    generateScramble,
    inspectionOvertime,
    scramble,
    settings.autoInspectionPenalty,
    solves,
    state,
    timeMs,
  ]);

  useEffect(() => {
    const handleShortcuts = buildShortcutHandlers({
      generateNewScramble,
      toggleLastPlus2,
      toggleLastDNF,
      undoLastSolve,
    });

    const onKeyDown = (event: KeyboardEvent) => {
      handleShortcuts(event, state);
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [generateNewScramble, state, toggleLastDNF, toggleLastPlus2, undoLastSolve]);

  return {
    scramble,
    state,
    timeMs,
    inspectionTimeLeft,
    inspectionDuration: settings.inspectionDuration,
    isFocusMode,
    cubeState,
    copied,
    copyScramble,
    visualizationMode,
    setVisualizationMode,
    solveFilter,
    setSolveFilter,
    solves,
    filteredSolves,
    lastPenalty,
    isNewBest,
    generateNewScramble,
    toggleLastPlus2,
    toggleLastDNF,
    undoLastSolve,
    single: getSingle(),
    ao5: getAo5(),
    ao12: getAo12(),
    bestAo5: getBestAo5(),
    bestAo12: getBestAo12(),
    progressSummary,
    dailyChallenges,
  };
}
