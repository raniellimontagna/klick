import type { CubePuzzleType } from '../types';
import { CUBE_PUZZLE_2X2 } from './puzzle-2x2';
import { CUBE_PUZZLE_3X3 } from './puzzle-3x3';
import { CUBE_PUZZLE_4X4 } from './puzzle-4x4';
import type { CubePuzzleDefinition } from './puzzle-definition';

export const CUBE_PUZZLE_DEFINITIONS: Record<CubePuzzleType, CubePuzzleDefinition> = {
  '2x2': CUBE_PUZZLE_2X2,
  '3x3': CUBE_PUZZLE_3X3,
  '4x4': CUBE_PUZZLE_4X4,
};

export function getCubePuzzleDefinition(cubeType: CubePuzzleType): CubePuzzleDefinition {
  return CUBE_PUZZLE_DEFINITIONS[cubeType];
}

export * from './puzzle-definition';
export * from './puzzle-2x2';
export * from './puzzle-3x3';
export * from './puzzle-4x4';
