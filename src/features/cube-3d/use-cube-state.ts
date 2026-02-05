import { useCallback, useRef, useState } from 'react';
import { applyMoveToState, createSolvedCube } from './lib/cube-utils';
import { MOVES, type MoveDefinition, parseScramble } from './lib/moves';
import type { CubeState } from './lib/types';

// Move with unique ID for tracking
interface QueuedMove extends MoveDefinition {
  uid: string;
  notation?: string;
  isScramble?: boolean;
}

let moveCounter = 0;
function createQueuedMove(move: MoveDefinition, isScramble = false): QueuedMove {
  return { ...move, uid: `move-${++moveCounter}`, isScramble };
}

export function useCubeState() {
  const [state, setState] = useState<CubeState>(createSolvedCube());
  const [moveQueue, setMoveQueue] = useState<QueuedMove[]>([]);
  const [history, setHistory] = useState<{ id: string; notation: string }[]>([]);
  const [isScrambling, setIsScrambling] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [cubeGeneration, setCubeGeneration] = useState(0);

  // Track which move UIDs have been processed to prevent duplicates
  const processedMoves = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    setState(createSolvedCube());
    setMoveQueue([]);
    setHistory([]);
    setIsScrambling(false);
    processedMoves.current.clear();
  }, []);

  const applyMove = useCallback((moveStr: string) => {
    const moveDef = MOVES[moveStr];
    if (moveDef) {
      const queuedMove = createQueuedMove(moveDef);
      queuedMove.notation = moveStr;
      setMoveQueue((prev) => [...prev, queuedMove]);
    }
  }, []);

  const applyScramble = useCallback((scramble: string, instant = false) => {
    const moves = parseScramble(scramble);
    if (instant) {
      setState((prev) => {
        let currentState = prev;
        for (const move of moves) {
          currentState = applyMoveToState(currentState, move);
        }
        return currentState;
      });
      setMoveQueue([]);
      setIsScrambling(false);
    } else {
      setIsScrambling(true);
      const scrambleMoves = moves.map((m) => createQueuedMove(m, true));
      setMoveQueue((prev) => [...prev, ...scrambleMoves]);
    }
  }, []);

  // Skip remaining scramble moves by applying them instantly
  const skipScramble = useCallback(() => {
    // First, capture the current queue state
    const currentQueue = moveQueue;

    // We apply ALL current moves in the queue, including the one potentially animating.
    // The visual component will abort the animation, so we must apply the logical move here.

    const scrambleMoves = currentQueue.filter((m) => m.isScramble);
    const nonScrambleMoves = currentQueue.filter((m) => !m.isScramble);

    if (scrambleMoves.length > 0) {
      // Apply all remaining scramble moves to state
      setState((prev) => {
        let currentState = prev;
        for (const move of scrambleMoves) {
          // Skip if already processed
          if (!processedMoves.current.has(move.uid)) {
            currentState = applyMoveToState(currentState, move);
            processedMoves.current.add(move.uid);
          }
        }
        return currentState;
      });
    }

    // Clear the queue and scrambling flag
    setIsScrambling(false);
    setMoveQueue(nonScrambleMoves);

    // Increment generation to force visual reset
    setCubeGeneration((g) => g + 1);
  }, [moveQueue]);

  // Called by the visual component when an animation finishes
  const completeMove = useCallback(() => {
    setIsAnimating(false);
    setMoveQueue((prevQueue) => {
      if (prevQueue.length === 0) return prevQueue;

      const [finishedMove, ...remaining] = prevQueue;

      // Check if this move was already processed (StrictMode protection)
      if (processedMoves.current.has(finishedMove.uid)) {
        return remaining;
      }

      // Mark as processed
      processedMoves.current.add(finishedMove.uid);

      // Clean up old entries (keep last 100 to prevent memory leak)
      if (processedMoves.current.size > 100) {
        const entries = Array.from(processedMoves.current);
        processedMoves.current = new Set(entries.slice(-50));
      }

      // Update logical state
      setState((current) => applyMoveToState(current, finishedMove));

      // Check if scrambling just finished
      if (finishedMove.isScramble && remaining.every((m) => !m.isScramble)) {
        setIsScrambling(false);
      }

      // Add to history only for non-scramble moves with notation
      const notation = finishedMove.notation;
      if (notation && !finishedMove.isScramble) {
        setHistory((prev) => [...prev, { id: finishedMove.uid, notation }]);
      }

      return remaining;
    });
  }, []);

  // Called by visual component when animation starts
  const startMove = useCallback(() => {
    setIsAnimating(true);
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const lastItem = prev[prev.length - 1];
      const lastMove = lastItem.notation;

      // Determine reverse move
      let reverseMove = '';
      if (lastMove.endsWith("'")) {
        reverseMove = lastMove.slice(0, -1);
      } else if (lastMove.endsWith('2')) {
        reverseMove = lastMove; // 2 is its own inverse
      } else {
        reverseMove = `${lastMove}'`;
      }

      // Apply reverse move WITHOUT adding to history
      const moveDef = MOVES[reverseMove];
      if (moveDef) {
        const queuedMove = createQueuedMove(moveDef);
        setMoveQueue((q) => [...q, queuedMove]);
      }

      return prev.slice(0, -1);
    });
  }, []);

  return {
    cubies: state.cubies,
    moveQueue: moveQueue as MoveDefinition[],
    history,
    isScrambling,
    isAnimating,
    cubeGeneration,
    reset,
    undo,
    applyMove,
    applyScramble,
    skipScramble,
    completeMove,
    startMove,
  };
}
