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
 *
 * This single function is used for BOTH cubie positions AND face normals,
 * ensuring mathematical consistency.
 */
export function rotateVector(vec: Vec3, axis: 'x' | 'y' | 'z', dir: 1 | -1): Vec3 {
  const [x, y, z] = vec;

  // 90° rotation matrices:
  // X-axis: [[1,0,0], [0,0,-1], [0,1,0]] for dir=1
  // Y-axis: [[0,0,1], [0,1,0], [-1,0,0]] for dir=1
  // Z-axis: [[0,-1,0], [1,0,0], [0,0,1]] for dir=1

  if (axis === 'x') {
    // Rotate in YZ plane
    // dir=1 (CCW from +X): (y,z) → (-z, y)
    // dir=-1 (CW from +X): (y,z) → (z, -y)
    return dir === 1 ? [x, -z, y] : [x, z, -y];
  }

  if (axis === 'y') {
    // Rotate in XZ plane
    // dir=1 (CCW from +Y): (x,z) → (z, -x)
    // dir=-1 (CW from +Y): (x,z) → (-z, x)
    return dir === 1 ? [z, y, -x] : [-z, y, x];
  }

  if (axis === 'z') {
    // Rotate in XY plane
    // dir=1 (CCW from +Z): (x,y) → (-y, x)
    // dir=-1 (CW from +Z): (x,y) → (y, -x)
    return dir === 1 ? [-y, x, z] : [y, -x, z];
  }

  return vec;
}

/**
 * Creates the initial face colors for a cubie based on its position.
 * Each face gets a normal vector and a color based on whether it's exposed.
 */
function createCubieFaces(x: number, y: number, z: number): CubieFace[] {
  const { BLACK, RED, ORANGE, YELLOW, WHITE, GREEN, BLUE } = CUBE_3D_COLORS;

  return [
    { id: 'RIGHT', normal: FACE_NORMALS.RIGHT, color: x === 1 ? RED : BLACK },
    { id: 'LEFT', normal: FACE_NORMALS.LEFT, color: x === -1 ? ORANGE : BLACK },
    { id: 'UP', normal: FACE_NORMALS.UP, color: y === 1 ? WHITE : BLACK },
    { id: 'DOWN', normal: FACE_NORMALS.DOWN, color: y === -1 ? YELLOW : BLACK },
    { id: 'FRONT', normal: FACE_NORMALS.FRONT, color: z === 1 ? GREEN : BLACK },
    { id: 'BACK', normal: FACE_NORMALS.BACK, color: z === -1 ? BLUE : BLACK },
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
 * Uses rotateVector for BOTH position AND face normals - no separate logic.
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

    // Rotate ALL face normals using the SAME function
    const newFaces = cubie.faces.map((face) => ({
      id: face.id, // ID is stable
      color: face.color, // Color stays attached to the face
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
