import type { MoveDefinition } from './moves';
import {
  CUBE_3D_COLORS,
  type CubeState,
  type CubieData,
  type CubieFace,
  type CubiePosition,
  FACE_NORMALS,
  type Vec3,
} from './types';

/**
 * Rotates a 3D vector 90° around the specified axis.
 * Uses right-hand rule: dir=1 is CCW when looking from +axis toward origin.
 */
export function rotateVector(vec: Vec3, axis: 'x' | 'y' | 'z', dir: 1 | -1): Vec3 {
  const [x, y, z] = vec;

  if (axis === 'x') {
    // dir=1: (y,z) → (-z, y)
    // dir=-1: (y,z) → (z, -y)
    return dir === 1 ? [x, -z, y] : [x, z, -y];
  }

  if (axis === 'y') {
    // dir=1: (x,z) → (z, -x)
    // dir=-1: (x,z) → (-z, x)
    return dir === 1 ? [z, y, -x] : [-z, y, x];
  }

  if (axis === 'z') {
    // dir=1: (x,y) → (-y, x)
    // dir=-1: (x,y) → (y, -x)
    return dir === 1 ? [-y, x, z] : [y, -x, z];
  }

  return vec;
}

/**
 * Creates the initial face colors for a cubie based on its position.
 */
function createCubieFaces(x: number, y: number, z: number): CubieFace[] {
  const { BLACK, RED, ORANGE, YELLOW, WHITE, GREEN, BLUE } = CUBE_3D_COLORS;

  return [
    {
      id: 'RIGHT',
      normal: FACE_NORMALS.RIGHT,
      colorKey: x === 1 ? 'RIGHT' : 'BLACK',
      color: x === 1 ? RED : BLACK,
    },
    {
      id: 'LEFT',
      normal: FACE_NORMALS.LEFT,
      colorKey: x === -1 ? 'LEFT' : 'BLACK',
      color: x === -1 ? ORANGE : BLACK,
    },
    {
      id: 'UP',
      normal: FACE_NORMALS.UP,
      colorKey: y === 1 ? 'UP' : 'BLACK',
      color: y === 1 ? WHITE : BLACK,
    },
    {
      id: 'DOWN',
      normal: FACE_NORMALS.DOWN,
      colorKey: y === -1 ? 'DOWN' : 'BLACK',
      color: y === -1 ? YELLOW : BLACK,
    },
    {
      id: 'FRONT',
      normal: FACE_NORMALS.FRONT,
      colorKey: z === 1 ? 'FRONT' : 'BLACK',
      color: z === 1 ? GREEN : BLACK,
    },
    {
      id: 'BACK',
      normal: FACE_NORMALS.BACK,
      colorKey: z === -1 ? 'BACK' : 'BLACK',
      color: z === -1 ? BLUE : BLACK,
    },
  ];
}

export function createSolvedCube(): CubeState {
  const cubies: CubieData[] = [];
  let index = 0;

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const position: CubiePosition = [x, y, z];
        const faces = createCubieFaces(x, y, z);
        const uid = `cubie-${index}`;

        cubies.push({ uid, position, faces });
        index++;
      }
    }
  }

  return { cubies };
}

/**
 * Applies a move to the cube state.
 */
export function applyMoveToState(state: CubeState, move: MoveDefinition): CubeState {
  const axisIndex = move.axis === 'x' ? 0 : move.axis === 'y' ? 1 : 2;

  const newCubies = state.cubies.map((cubie) => {
    // Check if this cubie is in the rotating layer
    if (!move.layers.includes(cubie.position[axisIndex])) {
      return cubie;
    }

    // Rotate position
    const newPosition = rotateVector(cubie.position, move.axis, move.direction);

    // Rotate ALL face normals
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
