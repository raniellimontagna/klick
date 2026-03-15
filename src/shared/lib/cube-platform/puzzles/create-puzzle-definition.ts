import { createMoveMap } from '../moves';
import type { CubePuzzleType } from '../types';
import type { CubePuzzleDefinition } from './puzzle-definition';

function createPuzzleCoordinates(dimension: CubePuzzleDefinition['dimension']): number[] {
  const centerOffset = (dimension - 1) / 2;

  return Array.from({ length: dimension }, (_, index) => index - centerOffset);
}

export function createCubePuzzleDefinition(
  type: CubePuzzleType,
  dimension: CubePuzzleDefinition['dimension'],
): CubePuzzleDefinition {
  const coordinates = createPuzzleCoordinates(dimension);
  const outerNegative = coordinates[0] ?? -1;
  const outerPositive = coordinates[coordinates.length - 1] ?? 1;
  const middle = dimension % 2 === 1 ? coordinates[(dimension - 1) / 2] : undefined;

  return {
    type,
    dimension,
    coordinates,
    layers: {
      outerNegative,
      outerPositive,
      middle,
    },
    moveMap: createMoveMap({
      outerPositiveLayer: outerPositive,
      outerNegativeLayer: outerNegative,
      middleLayer: middle,
    }),
    renderScale: 3 / dimension,
  };
}
