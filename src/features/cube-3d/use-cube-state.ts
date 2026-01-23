import { useCallback, useState } from 'react';
import { applyMoveToState, createSolvedCube } from './lib/cube-utils';
import { MOVES, type MoveDefinition, parseScramble } from './lib/moves';
import type { CubeState } from './lib/types';

export function useCubeState() {
  const [state, setState] = useState<CubeState>(createSolvedCube());
  const [moveQueue, setMoveQueue] = useState<MoveDefinition[]>([]);

  const reset = useCallback(() => {
    setState(createSolvedCube());
    setMoveQueue([]);
  }, []);

  const applyMove = useCallback((moveStr: string) => {
    const moveDef = MOVES[moveStr];
    if (moveDef) {
      // For single move button: enqueue it
      setMoveQueue((prev) => [...prev, moveDef]);
    }
  }, []);

  const applyScramble = useCallback((scramble: string, instant = false) => {
    const moves = parseScramble(scramble);
    if (instant) {
      // Apply immediately without animation
      setState((prev) => {
        let currentState = prev;
        for (const move of moves) {
          currentState = applyMoveToState(currentState, move);
        }
        return currentState;
      });
      setMoveQueue([]);
    } else {
      // Enqueue
      setMoveQueue((prev) => [...prev, ...moves]);
    }
  }, []);

  // Called by the visual component when an animation finishes
  const completeMove = useCallback(() => {
    setMoveQueue((prevQueue) => {
      if (prevQueue.length === 0) return prevQueue;

      const [finishedMove, ...remaining] = prevQueue;

      // Update logical state
      setState((current) => applyMoveToState(current, finishedMove));

      return remaining;
    });
  }, []);

  return {
    cubies: state.cubies,
    moveQueue,
    reset,
    applyMove,
    applyScramble,
    completeMove,
  };
}
