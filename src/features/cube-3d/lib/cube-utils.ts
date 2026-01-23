import type { MoveDefinition } from './moves';
import {
  CUBE_3D_COLORS,
  type CubeState,
  type CubieData,
  type CubieFaces,
  type CubiePosition,
} from './types';

// ... existing getCubieFaceColors and createSolvedCube ...

function getCubieFaceColors(x: number, y: number, z: number): CubieFaces {
  // BoxGeometry face order: Right, Left, Up, Down, Front, Back
  const { BLACK, RED, ORANGE, YELLOW, WHITE, GREEN, BLUE } = CUBE_3D_COLORS;

  const right = x === 1 ? RED : BLACK;
  const left = x === -1 ? ORANGE : BLACK;
  const up = y === 1 ? WHITE : BLACK; // White on Top
  const down = y === -1 ? YELLOW : BLACK; // Yellow on Bottom
  const front = z === 1 ? GREEN : BLACK;
  const back = z === -1 ? BLUE : BLACK;

  return [right, left, up, down, front, back];
}

export function createSolvedCube(): CubeState {
  const cubies: CubieData[] = [];

  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        const position: CubiePosition = [x, y, z];
        const faces = getCubieFaceColors(x, y, z);
        const id = `${x},${y},${z}`;

        cubies.push({
          id,
          position,
          faces,
        });
      }
    }
  }

  return { cubies };
}

// --- Rotation Logic ---

// Rotates a point (x,y) 90 degrees around origin
// dir 1: (x,y) -> (-y, x)
// dir -1: (x,y) -> (y, -x)
function rotate2D(a: number, b: number, dir: -1 | 1): [number, number] {
  return dir === 1 ? [-b, a] : [b, -a];
}

export function rotateCubiePosition(
  pos: CubiePosition,
  axis: 'x' | 'y' | 'z',
  dir: -1 | 1,
): CubiePosition {
  const [x, y, z] = pos;

  if (axis === 'x') {
    const [ny, nz] = rotate2D(y, z, dir);
    return [x, Math.round(ny), Math.round(nz)]; // Round to fix floats
  }
  if (axis === 'y') {
    const [nz, nx] = rotate2D(z, x, dir); // Standard Math: (z,x) -> (-x, z) for +Y?
    // Wait. +Y rotation: Z -> X. (0,1) -> (1,0).
    // rotate2D(0, 1, 1) -> [-1, 0]. This is X->-Z.
    // Let's stick to standard Right Hand Rule for +Y.
    // +Y axis points up. Curl fingers: Z(Front) -> X(Right) -> -Z(Back) -> -X(Left).
    // rotate2D(z, x, 1) -> (-x, z).
    // If z=1(Front), x=0. New = (0, 1) -> x=1(Right). This matches Z->X.
    // So for Y axis, we rotate (z, x).
    return [Math.round(nx), y, Math.round(nz)];
  }
  if (axis === 'z') {
    const [nx, ny] = rotate2D(x, y, dir);
    return [Math.round(nx), Math.round(ny), z];
  }
  return pos;
}

// Faces: [Right(0), Left(1), Up(2), Down(3), Front(4), Back(5)]
export function rotateCubieFaces(
  faces: CubieFaces,
  axis: 'x' | 'y' | 'z',
  dir: -1 | 1,
): CubieFaces {
  const [R, L, U, D, F, B] = faces;
  const newFaces = [...faces] as CubieFaces;

  if (axis === 'x') {
    // Rotation around X (Right face direction)
    // +X (Right) rotation: Front -> Up -> Back -> Down -> Front
    // My previous assumption was backwards?
    // Let's verify standard notation.
    // R move is clockwise around Right face. Right face normal is +X.
    // So R is +X rotation.
    // +X rotation: Y -> Z -> -Y -> -Z.
    // Faces at +Y (Up) moves to +Z (Front)? NO.
    // +X rotation: Up(+Y) -> Back(-Z) -> Down(-Y) -> Front(+Z) -> Up.
    // Wait. R move: Front -> Up -> Back -> Down.
    // Let's visualize R move on a physical cube.
    // Hold cube, Red on Right. Turn R (away from you/up).
    // The Front face piece goes UP. So Front -> Up.
    // The Up face piece goes BACK. So Up -> Back.
    // The Back face piece goes DOWN. So Back -> Down.
    // The Down face piece goes FRONT. So Down -> Front.

    // Cycle for R (+X? direction check later): F -> U -> B -> D -> F
    // R move direction in my moves.ts is -1.

    if (dir === -1) {
      // This matches R move layout
      // F -> U, U -> B, B -> D, D -> F
      newFaces[2] = F; // Up gets Front
      newFaces[5] = U; // Back gets Up
      newFaces[3] = B; // Down gets Back
      newFaces[4] = D; // Front gets Down
    } else {
      // Reversed (R')
      // U -> F, F -> D, D -> B, B -> U
      newFaces[4] = U;
      newFaces[3] = F;
      newFaces[5] = D;
      newFaces[2] = B;
    }
  }

  if (axis === 'y') {
    // Rotation around Y (Up face)
    // U move (Clockwise looking from top): Front -> Left -> Back -> Right -> Front
    // Direction in moves.ts for U is -1.
    if (dir === -1) {
      newFaces[1] = F; // Left gets Front
      newFaces[5] = L; // Back gets Left
      newFaces[0] = B; // Right gets Back
      newFaces[4] = R; // Front gets Right
    } else {
      // U'
      newFaces[0] = F; // Right gets Front
      newFaces[5] = R;
      newFaces[1] = B;
      newFaces[4] = L;
    }
  }

  if (axis === 'z') {
    // Rotation around Z (Front face)
    // F move (Clockwise looking from front): Up -> Right -> Down -> Left -> Up
    // Direction in moves.ts for F is -1.
    if (dir === -1) {
      newFaces[0] = U; // Right gets Up
      newFaces[3] = R; // Down gets Right
      newFaces[1] = D; // Left gets Down
      newFaces[2] = L; // Up gets Left
    } else {
      // F'
      newFaces[1] = U; // Left gets Up
      newFaces[3] = L;
      newFaces[0] = D;
      newFaces[2] = R;
    }
  }

  return newFaces;
}

export function applyMoveToState(state: CubeState, move: MoveDefinition): CubeState {
  const newCubies = state.cubies.map((cubie) => {
    let relevantCoord = 0;
    if (move.axis === 'x') relevantCoord = cubie.position[0];
    if (move.axis === 'y') relevantCoord = cubie.position[1];
    if (move.axis === 'z') relevantCoord = cubie.position[2];

    if (move.layers.includes(relevantCoord)) {
      const newPos = rotateCubiePosition(cubie.position, move.axis, move.direction);
      const newFaces = rotateCubieFaces(cubie.faces, move.axis, move.direction);

      return {
        ...cubie,
        position: newPos,
        faces: newFaces,
      };
    }

    return cubie;
  });

  return { cubies: newCubies };
}
