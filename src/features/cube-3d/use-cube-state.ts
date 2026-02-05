import { useCallback, useRef, useState } from 'react';
import { applyMoveToState, createSolvedCube } from './lib/cube-utils';
import { MOVES, type MoveDefinition, parseScramble } from './lib/moves';
import type { CubeState } from './lib/types';

// Move with unique ID for tracking
interface QueuedMove extends MoveDefinition {
  uid: string;
}

let moveCounter = 0;
function createQueuedMove(move: MoveDefinition): QueuedMove {
  return { ...move, uid: `move-${++moveCounter}` };
}

export function useCubeState() {
  const [state, setState] = useState<CubeState>(createSolvedCube());
  const [moveQueue, setMoveQueue] = useState<QueuedMove[]>([]);

  // Track which move UIDs have been processed to prevent duplicates
  const processedMoves = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    setState(createSolvedCube());
    setMoveQueue([]);
    processedMoves.current.clear();
  }, []);

  const applyMove = useCallback((moveStr: string) => {
    const moveDef = MOVES[moveStr];
    if (moveDef) {
      setMoveQueue((prev) => [...prev, createQueuedMove(moveDef)]);
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
    } else {
      setMoveQueue((prev) => [...prev, ...moves.map(createQueuedMove)]);
    }
  }, []);

  // Called by the visual component when an animation finishes
  const completeMove = useCallback(() => {
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

      return remaining;
    });
  }, []);

  return {
    cubies: state.cubies,
    moveQueue: moveQueue as MoveDefinition[], // Cast back for compatibility
    reset,
    applyMove,
    applyScramble,
    completeMove,
  };
}
