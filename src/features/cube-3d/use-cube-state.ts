import { useState } from 'react';
import { createSolvedCube } from './lib/cube-utils';
import type { CubeState } from './lib/types';

export function useCubeState() {
  // Initial state is a solved cube
  const [state] = useState<CubeState>(createSolvedCube());

  // Future: methods to apply moves (R, U, F, etc.)
  // Future: methods to reset, apply scramble

  return {
    cubies: state.cubies,
    // Add methods here later
  };
}
