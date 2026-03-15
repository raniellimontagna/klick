export type ShareVisibility = 'private' | 'public';
export type ShareProfileVisibility = 'private' | 'public';
type SharePuzzleType = '3x3' | '2x2' | '4x4' | '5x5' | 'pyraminx' | 'megaminx' | 'skewb' | 'square1';

export interface ShareStatsSnapshot {
  single?: number | null;
  ao5?: number | null;
  ao12?: number | null;
  bestAo5?: number | null;
  bestAo12?: number | null;
}

export interface ShareProgressSnapshot {
  level: number;
  xp: number;
  currentStreak: number;
  bestStreak: number;
  weeklyGoalProgress: number;
  weeklyGoalTarget: number;
}

export interface SharePayload {
  version: 1;
  generatedAt: string;
  sessionName: string;
  puzzleType: SharePuzzleType;
  profileVisibility: ShareProfileVisibility;
  stats: ShareStatsSnapshot;
  progress?: ShareProgressSnapshot;
}

export interface SharePreferences {
  sharingEnabled: boolean;
  profileVisibility: ShareProfileVisibility;
  shareSingle: boolean;
  shareAverages: boolean;
  shareProgress: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShareLink {
  id: string;
  slug: string;
  title: string;
  visibility: ShareVisibility;
  payload: SharePayload;
  isActive: boolean;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
