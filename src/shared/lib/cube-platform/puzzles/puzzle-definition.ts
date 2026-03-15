import type { MoveMap } from '../moves';
import type { CubePuzzleType } from '../types';

export interface CubePuzzleLayers {
  outerPositive: number;
  outerNegative: number;
  middle?: number;
}

export interface CubePuzzleDefinition {
  type: CubePuzzleType;
  dimension: 2 | 3 | 4;
  coordinates: number[];
  layers: CubePuzzleLayers;
  moveMap: MoveMap;
  renderScale: number;
}
