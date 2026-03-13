import type {
  TrainingCatalog,
  TrainingDrillDefinition,
  TrainingDrillProgress,
  TrainingTrackDefinition,
  TrainingTrackWithDrills,
} from './training-lab-types';

const rawDrills: Array<Omit<TrainingDrillDefinition, 'setupAlgorithm' | 'demoAlgorithm'>> = [
  {
    id: 'f2lPairInsertRight',
    trackId: 'f2l',
    solveAlgorithm: "U R U' R'",
    focusTag: 'lookahead',
    difficulty: 'starter',
    targetAttempts: 36,
  },
  {
    id: 'f2lPairInsertLeft',
    trackId: 'f2l',
    solveAlgorithm: "U' L' U L",
    focusTag: 'lookahead',
    difficulty: 'starter',
    targetAttempts: 36,
  },
  {
    id: 'ollSuneFlow',
    trackId: 'oll',
    solveAlgorithm: "R U R' U R U2 R'",
    focusTag: 'execution',
    difficulty: 'core',
    targetAttempts: 28,
  },
  {
    id: 'ollHeadlights',
    trackId: 'oll',
    solveAlgorithm: "R2 D R' U2 R D' R' U2 R'",
    focusTag: 'recognition',
    difficulty: 'core',
    targetAttempts: 24,
  },
  {
    id: 'pllTPermFlow',
    trackId: 'pll',
    solveAlgorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
    focusTag: 'execution',
    difficulty: 'stretch',
    targetAttempts: 20,
  },
  {
    id: 'pllUaPermFlow',
    trackId: 'pll',
    solveAlgorithm: "R U' R U R U R U' R' U' R2",
    focusTag: 'recognition',
    difficulty: 'stretch',
    targetAttempts: 20,
  },
];

const trackDefinitions: TrainingTrackDefinition[] = [
  {
    id: 'f2l',
    sortOrder: 1,
    drillIds: ['f2lPairInsertRight', 'f2lPairInsertLeft'],
  },
  {
    id: 'oll',
    sortOrder: 2,
    drillIds: ['ollSuneFlow', 'ollHeadlights'],
  },
  {
    id: 'pll',
    sortOrder: 3,
    drillIds: ['pllTPermFlow', 'pllUaPermFlow'],
  },
];

function invertMove(move: string) {
  if (move.endsWith('2')) {
    return move;
  }

  if (move.endsWith("'")) {
    return move.slice(0, -1);
  }

  return `${move}'`;
}

function invertAlgorithm(algorithm: string) {
  return algorithm
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .reverse()
    .map((move) => invertMove(move))
    .join(' ');
}

function createDrill(drill: Omit<TrainingDrillDefinition, 'setupAlgorithm' | 'demoAlgorithm'>) {
  const setupAlgorithm = invertAlgorithm(drill.solveAlgorithm);
  const demoAlgorithm = [setupAlgorithm, drill.solveAlgorithm].join(' ').trim();

  return {
    ...drill,
    setupAlgorithm,
    demoAlgorithm,
  } satisfies TrainingDrillDefinition;
}

const drills = Object.fromEntries(rawDrills.map((drill) => [drill.id, createDrill(drill)])) as Record<
  string,
  TrainingDrillDefinition
>;

export const trainingLabCatalog: TrainingCatalog = {
  methodId: 'cfop',
  tracks: trackDefinitions,
  drills,
};

export function getTrainingTracksWithDrills(): TrainingTrackWithDrills[] {
  return trainingLabCatalog.tracks
    .slice()
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map((track) => ({
      ...track,
      drills: track.drillIds
        .map((drillId) => trainingLabCatalog.drills[drillId])
        .filter((drill): drill is TrainingDrillDefinition => Boolean(drill)),
    }));
}

export function createTrainingLabDefaults(): Record<string, TrainingDrillProgress> {
  return Object.values(trainingLabCatalog.drills).reduce<Record<string, TrainingDrillProgress>>(
    (accumulator, drill) => {
      accumulator[drill.id] = {
        attempts: 0,
        targetAttempts: drill.targetAttempts,
        confidence: 'starting',
      };
      return accumulator;
    },
    {},
  );
}
