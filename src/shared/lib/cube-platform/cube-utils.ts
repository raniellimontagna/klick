import type { MoveDefinition } from './moves';
import { getCubePuzzleDefinition, type CubePuzzleDefinition } from './puzzles';
import {
  CUBE_3D_COLORS,
  type CubePuzzleType,
  type CubeState,
  type CubieData,
  type CubieFace,
  type CubiePosition,
  FACE_NORMALS,
  type Vec3,
} from './types';

const LAYER_EPSILON = 0.000001;

function isSameLayer(a: number, b: number): boolean {
  return Math.abs(a - b) < LAYER_EPSILON;
}

/**
 * Rotates a 3D vector 90° around the specified axis.
 * Uses right-hand rule: dir=1 is CCW when looking from +axis toward origin.
 */
export function rotateVector(vec: Vec3, axis: 'x' | 'y' | 'z', dir: 1 | -1): Vec3 {
  const [x, y, z] = vec;

  if (axis === 'x') {
    return dir === 1 ? [x, -z, y] : [x, z, -y];
  }

  if (axis === 'y') {
    return dir === 1 ? [z, y, -x] : [-z, y, x];
  }

  if (axis === 'z') {
    return dir === 1 ? [-y, x, z] : [y, -x, z];
  }

  return vec;
}

function createCubieFaces(
  x: number,
  y: number,
  z: number,
  puzzleDefinition: CubePuzzleDefinition,
): CubieFace[] {
  const { BLACK, RED, ORANGE, YELLOW, WHITE, GREEN, BLUE } = CUBE_3D_COLORS;

  const isRight = isSameLayer(x, puzzleDefinition.layers.outerPositive);
  const isLeft = isSameLayer(x, puzzleDefinition.layers.outerNegative);
  const isUp = isSameLayer(y, puzzleDefinition.layers.outerPositive);
  const isDown = isSameLayer(y, puzzleDefinition.layers.outerNegative);
  const isFront = isSameLayer(z, puzzleDefinition.layers.outerPositive);
  const isBack = isSameLayer(z, puzzleDefinition.layers.outerNegative);

  return [
    {
      id: 'RIGHT',
      normal: FACE_NORMALS.RIGHT,
      colorKey: isRight ? 'RIGHT' : 'BLACK',
      color: isRight ? RED : BLACK,
    },
    {
      id: 'LEFT',
      normal: FACE_NORMALS.LEFT,
      colorKey: isLeft ? 'LEFT' : 'BLACK',
      color: isLeft ? ORANGE : BLACK,
    },
    {
      id: 'UP',
      normal: FACE_NORMALS.UP,
      colorKey: isUp ? 'UP' : 'BLACK',
      color: isUp ? WHITE : BLACK,
    },
    {
      id: 'DOWN',
      normal: FACE_NORMALS.DOWN,
      colorKey: isDown ? 'DOWN' : 'BLACK',
      color: isDown ? YELLOW : BLACK,
    },
    {
      id: 'FRONT',
      normal: FACE_NORMALS.FRONT,
      colorKey: isFront ? 'FRONT' : 'BLACK',
      color: isFront ? GREEN : BLACK,
    },
    {
      id: 'BACK',
      normal: FACE_NORMALS.BACK,
      colorKey: isBack ? 'BACK' : 'BLACK',
      color: isBack ? BLUE : BLACK,
    },
  ];
}

export function createSolvedCubeFromDefinition(puzzleDefinition: CubePuzzleDefinition): CubeState {
  const cubies: CubieData[] = [];
  let index = 0;

  for (const x of puzzleDefinition.coordinates) {
    for (const y of puzzleDefinition.coordinates) {
      for (const z of puzzleDefinition.coordinates) {
        const position: CubiePosition = [x, y, z];
        const faces = createCubieFaces(x, y, z, puzzleDefinition);
        const uid = `${puzzleDefinition.type}-cubie-${index}`;

        cubies.push({ uid, position, faces });
        index++;
      }
    }
  }

  return { cubies };
}

export function createSolvedCube(cubeType: CubePuzzleType = '3x3'): CubeState {
  const puzzleDefinition = getCubePuzzleDefinition(cubeType);
  return createSolvedCubeFromDefinition(puzzleDefinition);
}

/**
 * Applies a move to the cube state.
 */
export function applyMoveToState(state: CubeState, move: MoveDefinition): CubeState {
  const axisIndex = move.axis === 'x' ? 0 : move.axis === 'y' ? 1 : 2;

  const newCubies = state.cubies.map((cubie) => {
    if (!move.layers.some((layer) => isSameLayer(layer, cubie.position[axisIndex]))) {
      return cubie;
    }

    const newPosition = rotateVector(cubie.position, move.axis, move.direction);

    const newFaces = cubie.faces.map((face) => ({
      id: face.id,
      color: face.color,
      colorKey: face.colorKey,
      normal: rotateVector(face.normal, move.axis, move.direction),
    }));

    return {
      ...cubie,
      position: newPosition as CubiePosition,
      faces: newFaces,
    };
  });

  return { cubies: newCubies };
}
