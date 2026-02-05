import { create } from 'zustand';
import { generateScramble } from '@/features/home/lib/scramble/scramble-manager';
import type { PuzzleType } from '@/shared/types';

interface ScrambleStore {
  scramble: string;
  currentPuzzle: PuzzleType;
  generateNewScramble: (puzzleType?: PuzzleType) => void;
  setScramble: (scramble: string) => void;
}

export const useScrambleStore = create<ScrambleStore>((set, get) => ({
  scramble: '',
  currentPuzzle: '3x3',

  generateNewScramble: (puzzleType) => {
    const type = puzzleType || get().currentPuzzle;
    const newScramble = generateScramble(type);
    set({ scramble: newScramble, currentPuzzle: type });
  },

  setScramble: (scramble) => set({ scramble }),
}));
