import { useEffect, useState } from 'react';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { CubeControls } from './components/cube-controls';
import { CubeScene } from './components/cube-scene';
import { MoveHistory } from './components/move-history';
import { MoveIndicator } from './components/move-indicator';
import { ThemeSelector } from './components/theme-selector';
import { useCubeSound } from './hooks/use-cube-sound';
import { MOVES } from './lib/moves';
import { useCubeKeyboard } from './use-cube-keyboard';
import { useCubeState } from './use-cube-state';
import { DoubleAltArrowRight } from '@solar-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export function Cube3D() {
  const {
    cubies,
    reset,
    applyScramble,
    applyMove,
    moveQueue,
    completeMove,
    history,
    undo,
    isScrambling,
    skipScramble,
    startMove,
    cubeGeneration,
  } = useCubeState();
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
      {/* 1. Canvas Background */}
      <div className="absolute inset-0 z-0">
        <CubeScene
          cubies={cubies}
          moveQueue={moveQueue}
          completeMove={() => {
            completeMove();
            playClick();
          }}
          startMove={startMove}
          applyMove={applyMove}
          cubeGeneration={cubeGeneration}
        />
      </div>

      {/* 2. Top Left - Title & Scramble */}
      <div className="absolute top-4 left-4 md:top-6 md:left-6 z-10 pointer-events-none flex flex-col gap-2">
        <h1 className="text-xl md:text-2xl font-bold text-white/90 drop-shadow-md">
          3D Visualizer
        </h1>
        <div className="pointer-events-auto inline-block">
          <span className="text-xs md:text-sm font-mono text-primary/90 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 shadow-sm">
            {scramble || 'Press Scramble to Start'}
          </span>
        </div>
      </div>

      {/* 3. Top Right - Move Indicator & Help */}
      <MoveIndicator lastMove={lastMove} />
      <div className="absolute top-6 right-6 z-0 text-right pointer-events-none opacity-50 hidden lg:block">
        <p className="text-xs text-white">Drag to rotate • Scroll to zoom</p>
      </div>

      {/* 4. Bottom Center - History */}
      <div className="absolute bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-10 w-full max-w-2xl px-4 flex justify-center pointer-events-none">
        <div className="pointer-events-auto">
          <MoveHistory history={history} onUndo={undo} disabled={isAnimating} />
        </div>
      </div>

      {/* Scramble Overlay */}
      {/* Scramble Status UI - Non-intrusive */}
      <AnimatePresence>
        {isScrambling && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-32 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-3"
          >
            <div className="flex items-center gap-3 px-6 py-3 bg-[#161B22]/90 backdrop-blur-md rounded-full border border-white/10 shadow-2xl">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full"
              />
              <span className="text-sm font-medium text-white/90">Embaralhando...</span>
              <div className="w-px h-4 bg-white/10 mx-1" />
              <button
                type="button"
                onClick={skipScramble}
                className="group flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-hover transition-colors uppercase tracking-wider cursor-pointer"
              >
                SKIP
                <DoubleAltArrowRight
                  size={14}
                  className="group-hover:translate-x-0.5 transition-transform"
                />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. Bottom Right - Controls & Themes */}
      <div className="absolute bottom-4 right-4 md:bottom-6 md:right-6 z-10 pointer-events-auto flex items-center gap-2">
        <ThemeSelector />
        <CubeControls onReset={reset} isAnimating={isAnimating} />
      </div>
    </div>
  );
}
