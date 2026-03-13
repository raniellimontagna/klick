export type TrainingMethodId = 'cfop';
export type TrainingTrackId = 'f2l' | 'oll' | 'pll';
export type TrainingFocusTag = 'recognition' | 'lookahead' | 'execution';
export type TrainingDifficulty = 'starter' | 'core' | 'stretch';
export type TrainingConfidence = 'starting' | 'building' | 'ready';

export interface TrainingDrillDefinition {
  id: string;
  trackId: TrainingTrackId;
  solveAlgorithm: string;
  setupAlgorithm: string;
  demoAlgorithm: string;
  focusTag: TrainingFocusTag;
  difficulty: TrainingDifficulty;
  targetAttempts: number;
}

export interface TrainingTrackDefinition {
  id: TrainingTrackId;
  sortOrder: number;
  drillIds: string[];
}

export interface TrainingTrackWithDrills extends TrainingTrackDefinition {
  drills: TrainingDrillDefinition[];
}

export interface TrainingCatalog {
  methodId: TrainingMethodId;
  tracks: TrainingTrackDefinition[];
  drills: Record<string, TrainingDrillDefinition>;
}

export interface TrainingDrillProgress {
  attempts: number;
  targetAttempts: number;
  confidence: TrainingConfidence;
}
