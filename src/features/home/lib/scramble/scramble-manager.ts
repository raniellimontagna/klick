import type { PuzzleType } from '@/shared/types';
import { generate3x3Scramble } from './generate3x3';

const MOVES_2x2 = ['R', 'U', 'F'];
const MOVES_4x4 = ['R', 'L', 'U', 'D', 'F', 'B', 'Rw', 'Lw', 'Uw', 'Dw', 'Fw', 'Bw'];
const MOIFIERS = ['', "'", '2'];

function getRandomMove(moves: string[], lastMove?: string): string {
  let move = moves[Math.floor(Math.random() * moves.length)];
  // Simple avoidance of same face (not perfect for 4x4 but ok for placeholder)
  while (lastMove && move[0] === lastMove[0]) {
    move = moves[Math.floor(Math.random() * moves.length)];
  }
  return move;
}

function generateGenericScramble(length: number, movesSet: string[]): string {
  const moves: string[] = [];
  let lastMove: string | undefined;

  for (let i = 0; i < length; i++) {
    const move = getRandomMove(movesSet, lastMove);
    const mod = MOIFIERS[Math.floor(Math.random() * MOIFIERS.length)];
    moves.push(`${move}${mod}`);
    lastMove = move;
  }
  return moves.join(' ');
}

export function generateScramble(type: PuzzleType): string {
  switch (type) {
    case '2x2':
      return generateGenericScramble(9, MOVES_2x2); // TNoodle uses ~9-11 moves
    case '3x3':
      return generate3x3Scramble();
    case '4x4':
      return generateGenericScramble(40, MOVES_4x4);
    case '5x5':
      return generateGenericScramble(60, MOVES_4x4); // Similar moves to 4x4
    case 'pyraminx':
      return generateGenericScramble(10, ['U', 'L', 'R', 'B']); // Tips are separate, simplified
    case 'megaminx':
      return 'R++ D++ R-- D-- R++ D++ R-- D-- R++ D++ U'; // Placeholder
    case 'skewb':
      return generateGenericScramble(10, ['R', 'L', 'U', 'B']);
    case 'square1':
      return '(1,0) / (3,0) / (-1,-1) / (1,-2) / (3,0)'; // Placeholder
    default:
      return generate3x3Scramble();
  }
}
