export type Axis = 'x' | 'y' | 'z';
export type Direction = 1 | -1; // 1 = Clockwise (looking at axis), -1 = Counter-clockwise

export interface MoveDefinition {
  axis: Axis;
  layers: number[]; // Layers involved (1, 0, -1)
  direction: Direction;
}

// Map WCA notation to geometric rotations
// Note: Direction 1 is rotation around positive axis using right-hand rule
export const MOVES: Record<string, MoveDefinition> = {
  // Right Face (x = 1)
  R: { axis: 'x', layers: [1], direction: -1 }, // R is clockwise looking at Right face (which is looking against X axis direction if camera is front? No. R is clockwise relative to the face itself)
  // Let's verify directions:
  // X axis points Right. Rotation around +X (thumb right) -> fingers curl Back->Up->Front->Down.
  // Move R: Right face turns Up->Back->Down->Front. This is -X rotation?
  // Actually, standard math rotation around +X: Y -> Z -> -Y -> -Z (Right hand rule)
  // R move: Front(Z) -> Up(Y) -> Back(-Z) -> Down(-Y). This matches -X rotation direction.
  "R'": { axis: 'x', layers: [1], direction: 1 },
  R2: { axis: 'x', layers: [1], direction: -1 }, // Applied twice

  // Left Face (x = -1)
  L: { axis: 'x', layers: [-1], direction: 1 }, // L follows Left face clock, which is opposite to R
  "L'": { axis: 'x', layers: [-1], direction: -1 },
  L2: { axis: 'x', layers: [-1], direction: 1 },

  // Up Face (y = 1)
  U: { axis: 'y', layers: [1], direction: -1 }, // U: Front -> Left -> Back -> Right. +Y rot: Z -> X -> -Z -> -X.
  "U'": { axis: 'y', layers: [1], direction: 1 },
  U2: { axis: 'y', layers: [1], direction: -1 },

  // Down Face (y = -1)
  D: { axis: 'y', layers: [-1], direction: 1 },
  "D'": { axis: 'y', layers: [-1], direction: -1 },
  D2: { axis: 'y', layers: [-1], direction: 1 },

  // Front Face (z = 1)
  F: { axis: 'z', layers: [1], direction: -1 },
  "F'": { axis: 'z', layers: [1], direction: 1 },
  F2: { axis: 'z', layers: [1], direction: -1 },

  // Back Face (z = -1)
  B: { axis: 'z', layers: [-1], direction: 1 },
  "B'": { axis: 'z', layers: [-1], direction: -1 },
  B2: { axis: 'z', layers: [-1], direction: 1 },
};

export function parseScramble(scramble: string): MoveDefinition[] {
  if (!scramble) return [];
  return scramble
    .trim()
    .split(/\s+/)
    .map((m) => MOVES[m])
    .filter((m): m is MoveDefinition => !!m);
}
