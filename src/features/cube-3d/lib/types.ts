export type FaceColorKey = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'FRONT' | 'BACK' | 'BLACK';

export const CUBE_3D_COLORS = {
  WHITE: '#FFFFFF', // Pure White
  YELLOW: '#FFD500', // Vibrant Yellow
  RED: '#CC0000', // Deep Red
  BLUE: '#0045AD', // Classic Cube Blue
  ORANGE: '#FF9500', // Bright Orange (distinct from Red)
  GREEN: '#009E60', // Classic Cube Green
  BLACK: '#181818', // Inner faces (slightly lighter than pure black for definition)
} as const;

// 3D vector type for positions and normals
export type Vec3 = [number, number, number];

// Position of a cubie (x, y, z in -1, 0, 1)
export type CubiePosition = Vec3;

// A face with a normal vector and its color
export interface CubieFace {
  id: string; // Unique identifier for the face (e.g., 'RIGHT', 'LEFT', etc.)
  normal: Vec3; // Direction this face points: [±1,0,0], [0,±1,0], [0,0,±1]
  colorKey: FaceColorKey;
  color: string; // Current hex color (can be updated by theme)
}

// 6 faces per cubie
export type CubieFaces = CubieFace[];

export interface CubieData {
  uid: string; // Unique ID, immutable - NOT based on position
  position: CubiePosition;
  faces: CubieFaces;
}

export interface CubeState {
  cubies: CubieData[];
}

// Standard face normals for reference
export const FACE_NORMALS: Record<string, Vec3> = {
  RIGHT: [1, 0, 0],
  LEFT: [-1, 0, 0],
  UP: [0, 1, 0],
  DOWN: [0, -1, 0],
  FRONT: [0, 0, 1],
  BACK: [0, 0, -1],
} as const;
