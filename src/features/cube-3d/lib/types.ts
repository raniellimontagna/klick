export const CUBE_3D_COLORS = {
  WHITE: '#f0f0f0',
  YELLOW: '#ffd500',
  RED: '#ff3838',
  BLUE: '#0051ba',
  ORANGE: '#ff8c00',
  GREEN: '#00d800',
  BLACK: '#1a1a1a', // Internal faces
} as const;

// Position of a cubie (x, y, z in -1, 0, 1)
export type CubiePosition = [number, number, number];

// Colors of each face of a cubie (Right, Left, Up, Down, Front, Back)
// The order of the faces in BoxGeometry is: right, left, up, down, front, back
export type CubieFaces = [string, string, string, string, string, string];

export interface CubieData {
  id: string;
  position: CubiePosition;
  faces: CubieFaces;
}

export interface CubeState {
  cubies: CubieData[];
}
