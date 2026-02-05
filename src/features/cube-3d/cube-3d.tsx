import { useEffect, useState } from 'react';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { CubeControls } from './components/cube-controls';
import { CubeScene } from './components/cube-scene';
import { MoveHistory } from './components/move-history';
import { MoveIndicator } from './components/move-indicator';
import { useCubeSound } from './hooks/use-cube-sound';
import { MOVES } from './lib/moves';
import { useCubeKeyboard } from './use-cube-keyboard';
import { useCubeState } from './use-cube-state';

export function Cube3D() {
  const { cubies, reset, applyScramble, applyMove, moveQueue, completeMove, history, undo } =
    useCubeState();
  const { scramble } = useScrambleStore();
  const { playClick } = useCubeSound();

  const [lastMove, setLastMove] = useState<string | null>(null);
  const isAnimating = moveQueue.length > 0;

  // Enable keyboard controls
  useCubeKeyboard({ applyMove });

  // Sync cube state with global scramble
  useEffect(() => {
    if (scramble) {
      // Reset logic state first
      reset();
      // Enqueue moves (animation will play automatically)
      applyScramble(scramble);
    } else {
      reset();
    }
  }, [scramble, reset, applyScramble]);

  // Track last move from queue
  useEffect(() => {
    if (moveQueue.length > 0) {
      const currentMove = moveQueue[0];

      // Find matching notation
      const moveNotation = Object.entries(MOVES).find(
        ([_, def]) =>
          def.axis === currentMove.axis &&
          def.direction === currentMove.direction &&
          JSON.stringify(def.layers) === JSON.stringify(currentMove.layers),
      );

      if (moveNotation) {
        setLastMove(moveNotation[0]);
        const timer = setTimeout(() => setLastMove(null), 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [moveQueue]);

  return (
    <div className="relative w-full h-[calc(100vh-4rem)] bg-[#0D1117] overflow-hidden">
      {/* Immersive Layout - All controls are overlays on the canvas */}

      {/* 1. Canvas Background */}
      <div className="absolute inset-0 z-0">
        <CubeScene
          cubies={cubies}
          moveQueue={moveQueue}
          completeMove={() => {
            completeMove();
            playClick();
          }}
        />
      </div>

      {/* 2. Top Left - Title & Scramble */}
      <div className="absolute top-6 left-6 z-10 pointer-events-none">
        <h1 className="text-2xl font-bold text-white/90 drop-shadow-md mb-2">3D Visualizer</h1>
        <div className="pointer-events-auto inline-block">
          <span className="text-sm font-mono text-primary/90 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shadow-sm">
            {scramble || 'Press Scramble to Start'}
          </span>
        </div>
      </div>

      {/* 3. Top Right - Move Indicator & Help */}
      <MoveIndicator lastMove={lastMove} />
      <div className="absolute top-6 right-6 z-0 text-right pointer-events-none opacity-50 hidden md:block">
        <p className="text-xs text-white">Drag to rotate • Scroll to zoom</p>
      </div>

      {/* 4. Bottom Center - History */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-2xl px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <MoveHistory history={history} onUndo={undo} disabled={isAnimating} />
        </div>
      </div>

      {/* 5. Bottom Right - Controls */}
      <div className="absolute bottom-6 right-6 z-10 pointer-events-auto">
        <CubeControls onReset={reset} isAnimating={isAnimating} />
      </div>
    </div>
  );
}
