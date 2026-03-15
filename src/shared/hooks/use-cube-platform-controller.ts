import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyMoveToState, createSolvedCubeFromDefinition } from '../lib/cube-platform/cube-utils';
import { type MoveDefinition, parseScramble, resolveMove } from '../lib/cube-platform/moves';
import { getCubePuzzleDefinition } from '../lib/cube-platform/puzzles';
import type { CubePuzzleType, CubeState } from '../lib/cube-platform/types';

export interface CubePlatformHistoryItem {
  id: string;
  notation: string;
}

export interface CubePlatformQueuedMove extends MoveDefinition {
  uid: string;
  notation?: string;
  isAlgorithm?: boolean;
}

interface UseCubePlatformControllerOptions {
  cubeType?: CubePuzzleType;
  algorithm?: string;
  autoApplyAlgorithm?: boolean;
  onMoveQueued?: (move: string) => void;
  onAlgorithmComplete?: () => void;
}

let moveCounter = 0;

function createQueuedMove(move: MoveDefinition, isAlgorithm = false): CubePlatformQueuedMove {
  return { ...move, uid: `move-${++moveCounter}`, isAlgorithm };
}

export function useCubePlatformController({
  cubeType = '3x3',
  algorithm,
  autoApplyAlgorithm = false,
  onMoveQueued,
  onAlgorithmComplete,
}: UseCubePlatformControllerOptions = {}) {
  const puzzleDefinition = useMemo(() => getCubePuzzleDefinition(cubeType), [cubeType]);

  const [state, setState] = useState<CubeState>(() => createSolvedCubeFromDefinition(puzzleDefinition));
  const [moveQueue, setMoveQueue] = useState<CubePlatformQueuedMove[]>([]);
  const [history, setHistory] = useState<CubePlatformHistoryItem[]>([]);
  const [isApplyingAlgorithm, setIsApplyingAlgorithm] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cubeGeneration, setCubeGeneration] = useState(0);

  const processedMoves = useRef<Set<string>>(new Set());
  const lastAutoAlgorithm = useRef<string | null>(null);

  const reset = useCallback(() => {
    setState(createSolvedCubeFromDefinition(puzzleDefinition));
    setMoveQueue([]);
    setHistory([]);
    setIsApplyingAlgorithm(false);
    processedMoves.current.clear();
  }, [puzzleDefinition]);

  const applyMove = useCallback(
    (moveStr: string) => {
      const moveDef = resolveMove(moveStr, puzzleDefinition.moveMap);
      if (!moveDef) {
        return;
      }

      const queuedMove = createQueuedMove(moveDef);
      queuedMove.notation = moveStr;
      setMoveQueue((prev) => [...prev, queuedMove]);
      onMoveQueued?.(moveStr);
    },
    [onMoveQueued, puzzleDefinition],
  );

  const applyAlgorithm = useCallback(
    (inputAlgorithm: string, instant = false) => {
      const moves = parseScramble(inputAlgorithm, puzzleDefinition.moveMap);

      if (instant) {
        setState((prev) => {
          let currentState = prev;
          for (const move of moves) {
            currentState = applyMoveToState(currentState, move);
          }
          return currentState;
        });
        setMoveQueue([]);
        setIsApplyingAlgorithm(false);
        onAlgorithmComplete?.();
        return;
      }

      setIsApplyingAlgorithm(moves.length > 0);
      const algorithmMoves = moves.map((move) => createQueuedMove(move, true));
      setMoveQueue((prev) => [...prev, ...algorithmMoves]);
    },
    [onAlgorithmComplete, puzzleDefinition],
  );

  const skipAlgorithm = useCallback(() => {
    const currentQueue = moveQueue;
    const algorithmMoves = currentQueue.filter((move) => move.isAlgorithm);
    const nonAlgorithmMoves = currentQueue.filter((move) => !move.isAlgorithm);

    if (algorithmMoves.length > 0) {
      setState((prev) => {
        let currentState = prev;
        for (const move of algorithmMoves) {
          if (!processedMoves.current.has(move.uid)) {
            currentState = applyMoveToState(currentState, move);
            processedMoves.current.add(move.uid);
          }
        }
        return currentState;
      });
    }

    setIsApplyingAlgorithm(false);
    setMoveQueue(nonAlgorithmMoves);
    setCubeGeneration((generation) => generation + 1);
    onAlgorithmComplete?.();
  }, [moveQueue, onAlgorithmComplete]);

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

      if (processedMoves.current.size > 100) {
        const entries = Array.from(processedMoves.current);
        processedMoves.current = new Set(entries.slice(-50));
      }

      setState((current) => applyMoveToState(current, finishedMove));

      if (finishedMove.isAlgorithm && remaining.every((move) => !move.isAlgorithm)) {
        setIsApplyingAlgorithm(false);
        onAlgorithmComplete?.();
      }

      const notation = finishedMove.notation;
      if (notation && !finishedMove.isAlgorithm) {
        setHistory((prev) => [...prev, { id: finishedMove.uid, notation }]);
      }

      return remaining;
    });
  }, [onAlgorithmComplete]);

  const startMove = useCallback(() => {
    setIsAnimating(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) {
        return prev;
      }

      const lastMove = prev[prev.length - 1]?.notation;
      if (!lastMove) {
        return prev.slice(0, -1);
      }

      const reverseMove = lastMove.endsWith("'")
        ? lastMove.slice(0, -1)
        : lastMove.endsWith('2')
          ? lastMove
          : `${lastMove}'`;

      const reverseDef = resolveMove(reverseMove, puzzleDefinition.moveMap);
      if (reverseDef) {
        setMoveQueue((queue) => [...queue, createQueuedMove(reverseDef)]);
      }

      return prev.slice(0, -1);
    });
  }, [puzzleDefinition]);

  useEffect(() => {
    if (!autoApplyAlgorithm) {
      lastAutoAlgorithm.current = null;
      reset();
    }
  }, [autoApplyAlgorithm, reset]);

  useEffect(() => {
    if (!autoApplyAlgorithm) {
      return;
    }

    const normalizedAlgorithm = algorithm?.trim() ?? '';
    const signature = `${puzzleDefinition.type}:${normalizedAlgorithm}`;
    if (lastAutoAlgorithm.current === signature) {
      return;
    }

    lastAutoAlgorithm.current = signature;
    reset();
    if (normalizedAlgorithm) {
      applyAlgorithm(normalizedAlgorithm);
    }
  }, [algorithm, autoApplyAlgorithm, applyAlgorithm, puzzleDefinition.type, reset]);

  return {
    cubeType: puzzleDefinition.type,
    cubies: state.cubies,
    moveQueue,
    history,
    isApplyingAlgorithm,
    isAnimating,
    cubeGeneration,
    reset,
    undo,
    applyMove,
    applyAlgorithm,
    skipAlgorithm,
    completeMove,
    startMove,
  };
}
