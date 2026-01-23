import { CUBE_3D_COLORS, type CubieFaces, type CubiePosition, type CubeState } from './types';

function getCubieFaceColors(x: number, y: number, z: number): CubieFaces {
  // BoxGeometry face order: Right, Left, Up, Down, Front, Back
  const { BLACK, RED, ORANGE, YELLOW, WHITE, GREEN, BLUE } = CUBE_3D_COLORS;

  const right = x === 1 ? RED : BLACK;
  const left = x === -1 ? ORANGE : BLACK;
  const up = y === 1 ? YELLOW : BLACK;
  const down = y === -1 ? WHITE : BLACK;
  const front = z === 1 ? GREEN : BLACK;
  const back = z === -1 ? BLUE : BLACK;

  return [right, left, up, down, front, back];
}

export function createSolvedCube(): CubeState {
  const cubies = [];

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
