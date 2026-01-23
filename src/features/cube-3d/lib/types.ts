export const CUBE_3D_COLORS = {
  WHITE: '#FFFFFF', // Pure White
  YELLOW: '#FFD500', // Vibrant Yellow
  RED: '#CC0000', // Deep Red
  BLUE: '#0045AD', // Classic Cube Blue
  ORANGE: '#FF9500', // Bright Orange (distinct from Red)
  GREEN: '#009E60', // Classic Cube Green
  BLACK: '#181818', // Inner faces (slightly lighter than pure black for definition)
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
