import { useCallback, useRef, useState } from 'react';
import { applyMoveToState, createSolvedCube } from './lib/cube-utils';
import { MOVES, type MoveDefinition, parseScramble } from './lib/moves';
import type { CubeState } from './lib/types';

// Move with unique ID for tracking
interface QueuedMove extends MoveDefinition {
  uid: string;
  notation?: string;
}

let moveCounter = 0;
function createQueuedMove(move: MoveDefinition): QueuedMove {
  return { ...move, uid: `move-${++moveCounter}` };
}

export function useCubeState() {
  const [state, setState] = useState<CubeState>(createSolvedCube());
  const [moveQueue, setMoveQueue] = useState<QueuedMove[]>([]);
  const [history, setHistory] = useState<{ id: string; notation: string }[]>([]);

  // Track which move UIDs have been processed to prevent duplicates
  const processedMoves = useRef<Set<string>>(new Set());

  const reset = useCallback(() => {
    setState(createSolvedCube());
    setMoveQueue([]);
    setHistory([]);
    processedMoves.current.clear();
  }, []);

  const applyMove = useCallback((moveStr: string) => {
    const moveDef = MOVES[moveStr];
    if (moveDef) {
      const queuedMove = createQueuedMove(moveDef);
      // Store original notation in the move object for history tracking
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

      // Add to history if it has notation (scramble moves might not need history or handle differently)
      // For now, only track individual moves initiated by user or having notation
      const notation = (finishedMove as QueuedMove).notation;
      if (notation) {
        setHistory((prev) => [...prev, { id: finishedMove.uid, notation }]);
      } else {
        // Find notation from moves map if missing (e.g. from scramble)
        // Reverse lookup or just ignore for history if it's from scramble?
        // Usually scrambles are initial state, but if we want to undo scramble moves...
        // Let's keep history clean for now, only user moves if possible or valid notation
      }

      return remaining;
    });
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
        // Create a move that WON'T be added to history
        const queuedMove = createQueuedMove(moveDef);
        setMoveQueue((q) => [...q, queuedMove]);
      }

      return prev.slice(0, -1);
    });
  }, []);

  return {
    cubies: state.cubies,
    moveQueue: moveQueue as MoveDefinition[], // Cast back for compatibility
    history,
    reset,
    undo,
    applyMove,
    applyScramble,
    completeMove,
  };
}
