import { describe, expect, it } from 'vitest';
import { applyMoveToState, createSolvedCube } from './cube-utils';
import { parseScramble } from './moves';
import { getCubePuzzleDefinition } from './puzzles';
import type { CubeState } from './types';

const PUZZLE_TYPES = ['2x2', '3x3', '4x4'] as const;

function normalizeNumber(value: number): number {
  if (Object.is(value, -0)) {
    return 0;
  }

  return Number(value.toFixed(6));
}

function normalizeState(state: CubeState) {
  return state.cubies.map((cubie) => ({
    uid: cubie.uid,
    position: cubie.position.map((coordinate) => normalizeNumber(coordinate)),
    faces: cubie.faces.map((face) => ({
      id: face.id,
      colorKey: face.colorKey,
      normal: face.normal.map((coordinate) => normalizeNumber(coordinate)),
    })),
  }));
}

describe('cube puzzle definitions', () => {
  it('creates the expected number of cubies for each puzzle', () => {
    expect(createSolvedCube('2x2').cubies).toHaveLength(8);
    expect(createSolvedCube('3x3').cubies).toHaveLength(27);
    expect(createSolvedCube('4x4').cubies).toHaveLength(64);
  });

  it('isolates move layers by puzzle type', () => {
    const puzzle2x2 = getCubePuzzleDefinition('2x2');
    const puzzle3x3 = getCubePuzzleDefinition('3x3');
    const puzzle4x4 = getCubePuzzleDefinition('4x4');

    expect(puzzle2x2.moveMap.R?.layers).toEqual([0.5]);
    expect(puzzle3x3.moveMap.R?.layers).toEqual([1]);
    expect(puzzle4x4.moveMap.R?.layers).toEqual([1.5]);
    expect(puzzle3x3.moveMap.M?.layers).toEqual([0]);
    expect(puzzle2x2.moveMap.M).toBeUndefined();
    expect(puzzle4x4.moveMap.M).toBeUndefined();
  });

  it('applies and reverses a move correctly for every puzzle type', () => {
    for (const puzzleType of PUZZLE_TYPES) {
      const puzzleDefinition = getCubePuzzleDefinition(puzzleType);
      const initialState = createSolvedCube(puzzleType);
      const movedState = applyMoveToState(initialState, puzzleDefinition.moveMap.R);
      const revertedState = applyMoveToState(movedState, puzzleDefinition.moveMap["R'"]);

      expect(normalizeState(revertedState)).toEqual(normalizeState(initialState));
    }
  });

  it('parses only supported move notations for each puzzle', () => {
    const puzzle2x2 = getCubePuzzleDefinition('2x2');
    const puzzle3x3 = getCubePuzzleDefinition('3x3');
    const puzzle4x4 = getCubePuzzleDefinition('4x4');

    expect(parseScramble('R M U', puzzle2x2.moveMap)).toHaveLength(2);
    expect(parseScramble('R M U', puzzle3x3.moveMap)).toHaveLength(3);
    expect(parseScramble('R M U', puzzle4x4.moveMap)).toHaveLength(2);
  });
});
