import { useEffect } from 'react';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { CubeScene } from './components/cube-scene';
import { useCubeState } from './use-cube-state';

export function Cube3D() {
  const { cubies, reset, applyScramble, moveQueue, completeMove } = useCubeState();
  const { scramble } = useScrambleStore();

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

  return (
    <div className="flex flex-col w-full h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex flex-col md:flex-row justify-between items-center gap-4 bg-surface/20">
        <div>
          <h1 className="text-xl font-bold text-white/90">3D Visualizer</h1>
          <p className="text-xs text-white/50">Drag to rotate • Scroll to zoom</p>
        </div>

        <div className="flex gap-2 items-center">
          <span className="text-sm font-mono text-primary/80 bg-surface/50 px-3 py-1 rounded border border-white/5">
            {scramble || 'No Scramble'}
          </span>
        </div>
      </div>

      {/* Canvas Container - fills remaining space */}
      <div className="flex-1 w-full bg-[#0D1117]">
        <CubeScene cubies={cubies} moveQueue={moveQueue} completeMove={completeMove} />
      </div>
    </div>
  );
}
