const FACES = ['R', 'L', 'U', 'D', 'F', 'B'] as const;
const MODIFIERS = ['', "'", '2'] as const;

type Face = (typeof FACES)[number];
type Modifier = (typeof MODIFIERS)[number];

function getRandomFace(exclude?: Face): Face {
  const available = exclude ? FACES.filter((f) => f !== exclude) : FACES;
  return available[Math.floor(Math.random() * available.length)];
}

function getRandomModifier(): Modifier {
  return MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
}

export function generate3x3Scramble(): string {
  const moves: string[] = [];
  let lastFace: Face | undefined;

  for (let i = 0; i < 25; i++) {
    const face = getRandomFace(lastFace);
    const modifier = getRandomModifier();
    moves.push(`${face}${modifier}`);
    lastFace = face;
  }

  return moves.join(' ');
}
