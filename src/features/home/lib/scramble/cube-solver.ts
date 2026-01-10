import { CUBE_COLORS } from '@/shared/components/cube-visualizer/types';

// Standard Color Scheme (White Top, Green Front)
// U: White, D: Yellow, F: Green, B: Blue, L: Orange, R: Red
const SOLVED_STATE = {
  U: Array(9).fill(CUBE_COLORS.WHITE),
  D: Array(9).fill(CUBE_COLORS.YELLOW),
  F: Array(9).fill(CUBE_COLORS.GREEN),
  B: Array(9).fill(CUBE_COLORS.BLUE),
  L: Array(9).fill(CUBE_COLORS.ORANGE),
  R: Array(9).fill(CUBE_COLORS.RED),
};

// Index mapping for face rotation (clockwise)
// 0 1 2
// 3 4 5
// 6 7 8
const ROTATE_FACE_INDICES = [6, 3, 0, 7, 4, 1, 8, 5, 2];

export type CubeState = typeof SOLVED_STATE;

function rotateFace(face: string[]): string[] {
  return ROTATE_FACE_INDICES.map((i) => face[i]);
}

// Side Cycle mappings for each move (Clockwise)
// [Face, indices...]
const MOVES = {
  U: (s: CubeState) => {
    s.U = rotateFace(s.U);
    const temp = [s.F[0], s.F[1], s.F[2]];
    s.F[0] = s.R[0];
    s.F[1] = s.R[1];
    s.F[2] = s.R[2];
    s.R[0] = s.B[0];
    s.R[1] = s.B[1];
    s.R[2] = s.B[2];
    s.B[0] = s.L[0];
    s.B[1] = s.L[1];
    s.B[2] = s.L[2];
    s.L[0] = temp[0];
    s.L[1] = temp[1];
    s.L[2] = temp[2];
  },
  D: (s: CubeState) => {
    s.D = rotateFace(s.D);
    const temp = [s.F[6], s.F[7], s.F[8]];
    s.F[6] = s.L[6];
    s.F[7] = s.L[7];
    s.F[8] = s.L[8];
    s.L[6] = s.B[6];
    s.L[7] = s.B[7];
    s.L[8] = s.B[8];
    s.B[6] = s.R[6];
    s.B[7] = s.R[7];
    s.B[8] = s.R[8];
    s.R[6] = temp[0];
    s.R[7] = temp[1];
    s.R[8] = temp[2];
  },
  F: (s: CubeState) => {
    s.F = rotateFace(s.F);
    const temp = [s.U[6], s.U[7], s.U[8]];
    s.U[6] = s.L[8];
    s.U[7] = s.L[5];
    s.U[8] = s.L[2];
    s.L[2] = s.D[0];
    s.L[5] = s.D[1];
    s.L[8] = s.D[2];
    s.D[0] = s.R[6];
    s.D[1] = s.R[3];
    s.D[2] = s.R[0];
    s.R[0] = temp[0];
    s.R[3] = temp[1];
    s.R[6] = temp[2];
  },
  B: (s: CubeState) => {
    s.B = rotateFace(s.B);
    const temp = [s.U[2], s.U[1], s.U[0]];
    s.U[2] = s.R[8];
    s.U[1] = s.R[5];
    s.U[0] = s.R[2];
    s.R[2] = s.D[8];
    s.R[5] = s.D[7];
    s.R[8] = s.D[6];
    s.D[8] = s.L[6];
    s.D[7] = s.L[3];
    s.D[6] = s.L[0];
    s.L[0] = temp[0];
    s.L[3] = temp[1];
    s.L[6] = temp[2];
  },
  L: (s: CubeState) => {
    s.L = rotateFace(s.L);
    const temp = [s.U[0], s.U[3], s.U[6]];
    s.U[0] = s.B[8];
    s.U[3] = s.B[5];
    s.U[6] = s.B[2];
    s.B[8] = s.D[0];
    s.B[5] = s.D[3];
    s.B[2] = s.D[6];
    s.D[0] = s.F[0];
    s.D[3] = s.F[3];
    s.D[6] = s.F[6];
    s.F[0] = temp[0];
    s.F[3] = temp[1];
    s.F[6] = temp[2];
  },
  R: (s: CubeState) => {
    s.R = rotateFace(s.R);
    const temp = [s.U[8], s.U[5], s.U[2]];
    s.U[8] = s.F[8];
    s.U[5] = s.F[5];
    s.U[2] = s.F[2];
    s.F[8] = s.D[8];
    s.F[5] = s.D[5];
    s.F[2] = s.D[2];
    s.D[8] = s.B[0];
    s.D[5] = s.B[3];
    s.D[2] = s.B[6];
    s.B[0] = temp[0];
    s.B[3] = temp[1];
    s.B[6] = temp[2];
  },
};

export function solveCubeState(scramble: string) {
  // Deep clone solved state
  const state: CubeState = JSON.parse(JSON.stringify(SOLVED_STATE));

  const moves = scramble.trim().split(/\s+/);

  for (const move of moves) {
    const base = move[0] as keyof typeof MOVES;
    const modifier = move.length > 1 ? move[1] : '';

    if (!MOVES[base]) continue;

    if (modifier === '') {
      MOVES[base](state);
    } else if (modifier === '2') {
      MOVES[base](state);
      MOVES[base](state);
    } else if (modifier === "'") {
      MOVES[base](state);
      MOVES[base](state);
      MOVES[base](state);
    }
  }

  return state;
}
