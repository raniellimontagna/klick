export type Axis = 'x' | 'y' | 'z';
export type Direction = 1 | -1; // 1 = Clockwise (looking at axis), -1 = Counter-clockwise

export interface MoveDefinition {
  axis: Axis;
  layers: number[];
  direction: Direction;
}

export type MoveMap = Record<string, MoveDefinition>;

export interface CreateMoveMapOptions {
  outerPositiveLayer: number;
  outerNegativeLayer: number;
  middleLayer?: number;
}

export const FACE_MOVE_KEYS = ['F', 'L', 'R', 'U', 'D', 'B'] as const;
export type FaceMoveKey = (typeof FACE_MOVE_KEYS)[number];

function withTurns(moveMap: MoveMap, notation: string, move: MoveDefinition) {
  moveMap[notation] = move;
  moveMap[`${notation}'`] = {
    axis: move.axis,
    layers: move.layers,
    direction: move.direction === 1 ? -1 : 1,
  };
  moveMap[`${notation}2`] = move;
}

export function createMoveMap({
  outerPositiveLayer,
  outerNegativeLayer,
  middleLayer,
}: CreateMoveMapOptions): MoveMap {
  const moveMap: MoveMap = {};

  withTurns(moveMap, 'R', { axis: 'x', layers: [outerPositiveLayer], direction: -1 });
  withTurns(moveMap, 'L', { axis: 'x', layers: [outerNegativeLayer], direction: 1 });
  withTurns(moveMap, 'U', { axis: 'y', layers: [outerPositiveLayer], direction: -1 });
  withTurns(moveMap, 'D', { axis: 'y', layers: [outerNegativeLayer], direction: 1 });
  withTurns(moveMap, 'F', { axis: 'z', layers: [outerPositiveLayer], direction: -1 });
  withTurns(moveMap, 'B', { axis: 'z', layers: [outerNegativeLayer], direction: 1 });

  if (middleLayer !== undefined) {
    withTurns(moveMap, 'M', { axis: 'x', layers: [middleLayer], direction: 1 });
    withTurns(moveMap, 'E', { axis: 'y', layers: [middleLayer], direction: 1 });
    withTurns(moveMap, 'S', { axis: 'z', layers: [middleLayer], direction: -1 });
  }

  return moveMap;
}

// Backwards-compatible 3x3 default map used by existing consumers.
export const MOVES = createMoveMap({
  outerPositiveLayer: 1,
  outerNegativeLayer: -1,
  middleLayer: 0,
});

export function parseScramble(scramble: string, moveMap: MoveMap = MOVES): MoveDefinition[] {
  if (!scramble) return [];

  return scramble
    .trim()
    .split(/\s+/)
    .map((moveNotation) => moveMap[moveNotation])
    .filter((move): move is MoveDefinition => !!move);
}

export function resolveMove(moveNotation: string, moveMap: MoveMap = MOVES): MoveDefinition | undefined {
  return moveMap[moveNotation];
}
