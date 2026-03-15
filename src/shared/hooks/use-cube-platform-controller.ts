import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyMoveToState, createSolvedCubeFromDefinition } from '../lib/cube-platform/cube-utils';
import { type MoveDefinition, resolveMove } from '../lib/cube-platform/moves';
import { getCubePuzzleDefinition } from '../lib/cube-platform/puzzles';
import type {
  CubePlaybackMode,
  CubePlaybackSpeed,
  CubePuzzleType,
  CubeState,
} from '../lib/cube-platform/types';
import type { CubePlatformTelemetryEvent } from '../store/cube-platform-telemetry-store';
import { useCubePlatformTelemetryStore } from '../store/cube-platform-telemetry-store';

interface CubePlatformHistoryItem {
  id: string;
  notation: string;
}

type CubePlatformQueuedMoveSource = 'manual' | 'manual-algorithm' | 'playback';
type CubePlatformPlaybackDirection = 'forward' | 'backward';

interface CubePlatformQueuedMove extends MoveDefinition {
  uid: string;
  notation?: string;
  source: CubePlatformQueuedMoveSource;
  isAlgorithm?: boolean;
  playbackStepIndex?: number;
  playbackDirection?: CubePlatformPlaybackDirection;
}

interface CubePlatformPlaybackStep {
  id: string;
  notation: string;
  inverseNotation: string;
  move: MoveDefinition;
  inverseMove: MoveDefinition;
}

interface UseCubePlatformControllerOptions {
  cubeType?: CubePuzzleType;
  initialAlgorithm?: string;
  algorithm?: string;
  mode?: CubePlaybackMode;
  speed?: CubePlaybackSpeed;
  reducedMotion?: boolean;
  onMoveQueued?: (move: string) => void;
  onAlgorithmComplete?: () => void;
  onTelemetryEvent?: (event: CubePlatformTelemetryEvent) => void;
  telemetryContext?: string;
}

const DEFAULT_MODE: CubePlaybackMode = 'autoplay';
const DEFAULT_SPEED: CubePlaybackSpeed = 'normal';

let moveCounter = 0;
let stepCounter = 0;

function normalizeAlgorithm(input?: string) {
  return input?.trim().replace(/\s+/g, ' ') ?? '';
}

function invertMoveNotation(move: string): string {
  if (move.endsWith('2')) {
    return move;
  }

  if (move.endsWith("'")) {
    return move.slice(0, -1);
  }

  return `${move}'`;
}

function applySequence(state: CubeState, moves: MoveDefinition[]) {
  return moves.reduce((currentState, move) => applyMoveToState(currentState, move), state);
}

function createQueuedMove(
  move: MoveDefinition,
  options: {
    notation?: string;
    source?: CubePlatformQueuedMoveSource;
    isAlgorithm?: boolean;
    playbackStepIndex?: number;
    playbackDirection?: CubePlatformPlaybackDirection;
  } = {},
): CubePlatformQueuedMove {
  return {
    ...move,
    turns: move.turns ?? 1,
    uid: `move-${++moveCounter}`,
    source: options.source ?? 'manual',
    notation: options.notation,
    isAlgorithm: options.isAlgorithm,
    playbackStepIndex: options.playbackStepIndex,
    playbackDirection: options.playbackDirection,
  };
}

function createPlaybackSteps(
  algorithm: string,
  moveMap: Record<string, MoveDefinition>,
): CubePlatformPlaybackStep[] {
  if (!algorithm) {
    return [];
  }

  return algorithm.split(/\s+/).reduce<CubePlatformPlaybackStep[]>((steps, notation) => {
    if (!notation) {
      return steps;
    }

      const move = resolveMove(notation, moveMap);
      const inverseNotation = invertMoveNotation(notation);
      const inverseMove = resolveMove(inverseNotation, moveMap);

      if (!move || !inverseMove) {
        return steps;
      }

      steps.push({
        id: `playback-step-${++stepCounter}`,
        notation,
        inverseNotation,
        move: { ...move, turns: move.turns ?? 1 },
        inverseMove: { ...inverseMove, turns: inverseMove.turns ?? 1 },
      });

      return steps;
    }, []);
}

function getAnimationDuration(speed: CubePlaybackSpeed, reducedMotion: boolean) {
  if (reducedMotion) {
    return 0.14;
  }

  if (speed === 'slow') {
    return 0.42;
  }

  if (speed === 'fast') {
    return 0.16;
  }

  return 0.26;
}

export function useCubePlatformController({
  cubeType = '3x3',
  initialAlgorithm,
  algorithm,
  mode = DEFAULT_MODE,
  speed = DEFAULT_SPEED,
  reducedMotion = false,
  onMoveQueued,
  onAlgorithmComplete,
  onTelemetryEvent,
  telemetryContext,
}: UseCubePlatformControllerOptions = {}) {
  const puzzleDefinition = useMemo(() => getCubePuzzleDefinition(cubeType), [cubeType]);
  const effectiveMode = useMemo<CubePlaybackMode>(() => {
    if (reducedMotion && mode === 'autoplay') {
      return 'step-by-step';
    }

    return mode;
  }, [mode, reducedMotion]);

  const [state, setState] = useState<CubeState>(() => createSolvedCubeFromDefinition(puzzleDefinition));
  const [moveQueue, setMoveQueue] = useState<CubePlatformQueuedMove[]>([]);
  const [history, setHistory] = useState<CubePlatformHistoryItem[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cubeGeneration, setCubeGeneration] = useState(0);
  const [playbackSteps, setPlaybackSteps] = useState<CubePlatformPlaybackStep[]>([]);
  const [playbackStepIndex, setPlaybackStepIndex] = useState(0);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<CubePlaybackSpeed>(speed);

  const processedMoves = useRef<Set<string>>(new Set());
  const playbackStepsRef = useRef<CubePlatformPlaybackStep[]>([]);
  const playbackSignatureRef = useRef<string | null>(null);
  const queuedPlaybackKeyRef = useRef<string | null>(null);
  const completionNotifiedRef = useRef(false);

  const animationDuration = useMemo(
    () => getAnimationDuration(playbackSpeed, reducedMotion),
    [playbackSpeed, reducedMotion],
  );

  useEffect(() => {
    playbackStepsRef.current = playbackSteps;
  }, [playbackSteps]);

  useEffect(() => {
    setPlaybackSpeed(speed);
  }, [speed]);

  const recordTelemetry = useCallback(
    (
      action:
        | 'play'
        | 'pause'
        | 'next-step'
        | 'previous-step'
        | 'restart'
        | 'finish'
        | 'speed-change',
    ) => {
      const event = useCubePlatformTelemetryStore.getState().recordEvent({
        action,
        context: telemetryContext,
        cubeType: puzzleDefinition.type,
        mode: effectiveMode,
        speed: playbackSpeed,
        stepIndex: playbackStepIndex,
        stepCount: playbackStepsRef.current.length,
        reducedMotion,
      });

      onTelemetryEvent?.(event);
    },
    [
      effectiveMode,
      onTelemetryEvent,
      playbackSpeed,
      playbackStepIndex,
      puzzleDefinition.type,
      reducedMotion,
      telemetryContext,
    ],
  );

  const queueMove = useCallback(
    (
      move: MoveDefinition,
      options: {
        notation?: string;
        source?: CubePlatformQueuedMoveSource;
        isAlgorithm?: boolean;
        playbackStepIndex?: number;
        playbackDirection?: CubePlatformPlaybackDirection;
      } = {},
    ) => {
      setMoveQueue((prev) => [...prev, createQueuedMove(move, options)]);
    },
    [],
  );

  const restorePlayback = useCallback(
    (options?: { startRunning?: boolean }) => {
      const normalizedInitialAlgorithm = normalizeAlgorithm(initialAlgorithm);
      const normalizedAlgorithm = normalizeAlgorithm(algorithm);
      const initialState = createSolvedCubeFromDefinition(puzzleDefinition);
      const setupSteps = createPlaybackSteps(normalizedInitialAlgorithm, puzzleDefinition.moveMap);
      const nextPlaybackSteps = createPlaybackSteps(normalizedAlgorithm, puzzleDefinition.moveMap);
      const baseState = applySequence(
        initialState,
        setupSteps.map((step) => step.move),
      );

      processedMoves.current.clear();
      completionNotifiedRef.current = false;
      queuedPlaybackKeyRef.current = null;

      setHistory([]);
      setMoveQueue([]);
      setIsAnimating(false);
      setPlaybackSteps(nextPlaybackSteps);
      setCubeGeneration((generation) => generation + 1);

      if (effectiveMode === 'static') {
        const previewState = applySequence(
          baseState,
          nextPlaybackSteps.map((step) => step.move),
        );

        setState(previewState);
        setPlaybackStepIndex(nextPlaybackSteps.length);
        setIsPlaybackRunning(false);

        if (nextPlaybackSteps.length > 0) {
          completionNotifiedRef.current = true;
          onAlgorithmComplete?.();
        }

        return;
      }

      setState(baseState);
      setPlaybackStepIndex(0);
      setIsPlaybackRunning(Boolean(options?.startRunning ?? (effectiveMode === 'autoplay' && nextPlaybackSteps.length > 0)));
    },
    [algorithm, effectiveMode, initialAlgorithm, onAlgorithmComplete, puzzleDefinition],
  );

  const reset = useCallback(() => {
    restorePlayback();
    recordTelemetry('restart');
  }, [recordTelemetry, restorePlayback]);

  const restartPlayback = useCallback(() => {
    restorePlayback({ startRunning: effectiveMode === 'autoplay' });
    recordTelemetry('restart');
  }, [effectiveMode, recordTelemetry, restorePlayback]);

  const applyMove = useCallback(
    (moveStr: string) => {
      const moveDef = resolveMove(moveStr, puzzleDefinition.moveMap);
      if (!moveDef) {
        return;
      }

      queueMove(moveDef, { notation: moveStr, source: 'manual' });
      onMoveQueued?.(moveStr);
    },
    [onMoveQueued, puzzleDefinition.moveMap, queueMove],
  );

  const applyAlgorithm = useCallback(
    (inputAlgorithm: string, instant = false) => {
      const algorithmSteps = createPlaybackSteps(normalizeAlgorithm(inputAlgorithm), puzzleDefinition.moveMap);

      if (instant) {
        setState((currentState) => applySequence(currentState, algorithmSteps.map((step) => step.move)));
        return;
      }

      for (const step of algorithmSteps) {
        queueMove(step.move, {
          notation: step.notation,
          source: 'manual-algorithm',
          isAlgorithm: true,
        });
      }
    },
    [puzzleDefinition.moveMap, queueMove],
  );

  const queuePlaybackStep = useCallback(
    (stepIndex: number, direction: CubePlatformPlaybackDirection) => {
      const step = playbackStepsRef.current[stepIndex];
      if (!step) {
        return;
      }

      const queueKey = `${step.id}:${direction}`;
      if (queuedPlaybackKeyRef.current === queueKey) {
        return;
      }

      queuedPlaybackKeyRef.current = queueKey;

      queueMove(direction === 'forward' ? step.move : step.inverseMove, {
        notation: direction === 'forward' ? step.notation : step.inverseNotation,
        source: 'playback',
        isAlgorithm: true,
        playbackStepIndex: stepIndex,
        playbackDirection: direction,
      });
    },
    [queueMove],
  );

  const play = useCallback(() => {
    if (effectiveMode === 'static' || playbackStepsRef.current.length === 0) {
      return;
    }

    if (playbackStepIndex >= playbackStepsRef.current.length) {
      restorePlayback({ startRunning: true });
      recordTelemetry('play');
      return;
    }

    setIsPlaybackRunning(true);
    recordTelemetry('play');
  }, [effectiveMode, playbackStepIndex, recordTelemetry, restorePlayback]);

  const pause = useCallback(() => {
    if (effectiveMode === 'static') {
      return;
    }

    setIsPlaybackRunning(false);
    recordTelemetry('pause');
  }, [effectiveMode, recordTelemetry]);

  const nextStep = useCallback(() => {
    if (
      effectiveMode === 'static' ||
      isAnimating ||
      moveQueue.length > 0 ||
      playbackStepIndex >= playbackStepsRef.current.length
    ) {
      return;
    }

    setIsPlaybackRunning(false);
    queuedPlaybackKeyRef.current = null;
    queuePlaybackStep(playbackStepIndex, 'forward');
    recordTelemetry('next-step');
  }, [effectiveMode, isAnimating, moveQueue.length, playbackStepIndex, queuePlaybackStep, recordTelemetry]);

  const previousStep = useCallback(() => {
    if (effectiveMode === 'static' || isAnimating || moveQueue.length > 0 || playbackStepIndex === 0) {
      return;
    }

    setIsPlaybackRunning(false);
    queuedPlaybackKeyRef.current = null;
    queuePlaybackStep(playbackStepIndex - 1, 'backward');
    recordTelemetry('previous-step');
  }, [effectiveMode, isAnimating, moveQueue.length, playbackStepIndex, queuePlaybackStep, recordTelemetry]);

  const finishPlayback = useCallback(() => {
    if (effectiveMode === 'static' || playbackStepIndex >= playbackStepsRef.current.length) {
      return;
    }

    setIsPlaybackRunning(false);
    setMoveQueue([]);
    setState((currentState) =>
      applySequence(
        currentState,
        playbackStepsRef.current.slice(playbackStepIndex).map((step) => step.move),
      ),
    );
    setPlaybackStepIndex(playbackStepsRef.current.length);
    setCubeGeneration((generation) => generation + 1);
    queuedPlaybackKeyRef.current = null;

    if (!completionNotifiedRef.current) {
      completionNotifiedRef.current = true;
      onAlgorithmComplete?.();
    }

    recordTelemetry('finish');
  }, [effectiveMode, onAlgorithmComplete, playbackStepIndex, recordTelemetry]);

  const skipAlgorithm = useCallback(() => {
    finishPlayback();
  }, [finishPlayback]);

  const updatePlaybackSpeed = useCallback(
    (nextSpeed: CubePlaybackSpeed) => {
      setPlaybackSpeed(nextSpeed);
      recordTelemetry('speed-change');
    },
    [recordTelemetry],
  );

  const startMove = useCallback(() => {
    setIsAnimating(true);
  }, []);

  const completeMove = useCallback(() => {
    setIsAnimating(false);
    setMoveQueue((prevQueue) => {
      if (prevQueue.length === 0) {
        return prevQueue;
      }

      const [finishedMove, ...remaining] = prevQueue;

      if (processedMoves.current.has(finishedMove.uid)) {
        return remaining;
      }

      processedMoves.current.add(finishedMove.uid);
      queuedPlaybackKeyRef.current = null;

      if (processedMoves.current.size > 100) {
        const entries = Array.from(processedMoves.current);
        processedMoves.current = new Set(entries.slice(-50));
      }

      setState((currentState) => applyMoveToState(currentState, finishedMove));

      if (
        finishedMove.source === 'playback' &&
        typeof finishedMove.playbackStepIndex === 'number' &&
        finishedMove.playbackDirection
      ) {
        setPlaybackStepIndex(
          finishedMove.playbackDirection === 'backward'
            ? finishedMove.playbackStepIndex
            : finishedMove.playbackStepIndex + 1,
        );
      }

      if (finishedMove.notation && finishedMove.source === 'manual') {
        const notation = finishedMove.notation;
        setHistory((prevHistory) => [...prevHistory, { id: finishedMove.uid, notation }]);
      }

      return remaining;
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((prevHistory) => {
      if (prevHistory.length === 0) {
        return prevHistory;
      }

      const lastMove = prevHistory[prevHistory.length - 1]?.notation;
      if (!lastMove) {
        return prevHistory.slice(0, -1);
      }

      const reverseMove = invertMoveNotation(lastMove);
      const reverseMoveDef = resolveMove(reverseMove, puzzleDefinition.moveMap);
      if (reverseMoveDef) {
        queueMove(reverseMoveDef, { notation: reverseMove, source: 'manual' });
      }

      return prevHistory.slice(0, -1);
    });
  }, [puzzleDefinition.moveMap, queueMove]);

  useEffect(() => {
    const playbackSignature = [
      puzzleDefinition.type,
      effectiveMode,
      normalizeAlgorithm(initialAlgorithm),
      normalizeAlgorithm(algorithm),
    ].join('::');

    if (playbackSignatureRef.current === playbackSignature) {
      return;
    }

    playbackSignatureRef.current = playbackSignature;
    restorePlayback();
  }, [algorithm, effectiveMode, initialAlgorithm, puzzleDefinition.type, restorePlayback]);

  useEffect(() => {
    if (
      !isPlaybackRunning ||
      effectiveMode === 'static' ||
      isAnimating ||
      moveQueue.length > 0 ||
      playbackStepIndex >= playbackSteps.length
    ) {
      return;
    }

    queuePlaybackStep(playbackStepIndex, 'forward');
  }, [
    effectiveMode,
    isAnimating,
    isPlaybackRunning,
    moveQueue.length,
    playbackStepIndex,
    playbackSteps.length,
    queuePlaybackStep,
  ]);

  useEffect(() => {
    if (
      effectiveMode === 'static' ||
      playbackSteps.length === 0 ||
      playbackStepIndex < playbackSteps.length ||
      moveQueue.length > 0 ||
      isAnimating ||
      completionNotifiedRef.current
    ) {
      return;
    }

    completionNotifiedRef.current = true;
    setIsPlaybackRunning(false);
    onAlgorithmComplete?.();
  }, [
    effectiveMode,
    isAnimating,
    moveQueue.length,
    onAlgorithmComplete,
    playbackStepIndex,
    playbackSteps.length,
  ]);

  const canPlay =
    effectiveMode !== 'static' &&
    !isPlaybackRunning &&
    !isAnimating &&
    moveQueue.length === 0 &&
    playbackSteps.length > 0;
  const canPause = effectiveMode !== 'static' && isPlaybackRunning;
  const canStepForward =
    effectiveMode !== 'static' &&
    !isAnimating &&
    moveQueue.length === 0 &&
    playbackStepIndex < playbackSteps.length;
  const canStepBackward =
    effectiveMode !== 'static' && !isAnimating && moveQueue.length === 0 && playbackStepIndex > 0;
  const canRestart =
    (!isAnimating && moveQueue.length === 0 && effectiveMode === 'static'
      ? playbackSteps.length > 0 || Boolean(normalizeAlgorithm(initialAlgorithm))
      : !isAnimating && moveQueue.length === 0 && playbackSteps.length > 0) || history.length > 0;
  const canFinish =
    effectiveMode !== 'static' &&
    !isAnimating &&
    moveQueue.length === 0 &&
    playbackStepIndex < playbackSteps.length;

  return {
    cubeType: puzzleDefinition.type,
    cubies: state.cubies,
    moveQueue,
    history,
    isAnimating,
    cubeGeneration,
    playbackMode: effectiveMode,
    playbackSpeed,
    playbackStepIndex,
    playbackStepCount: playbackSteps.length,
    isApplyingAlgorithm: playbackStepIndex < playbackSteps.length,
    isPlaybackRunning,
    animationDuration,
    canPlay,
    canPause,
    canStepForward,
    canStepBackward,
    canRestart,
    canFinish,
    reset,
    restartPlayback,
    undo,
    applyMove,
    applyAlgorithm,
    play,
    pause,
    nextStep,
    previousStep,
    finishPlayback,
    skipAlgorithm,
    updatePlaybackSpeed,
    completeMove,
    startMove,
  };
}
