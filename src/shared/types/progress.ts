export const PROGRESS_CHALLENGE_TYPES = ['solve_count', 'clean_streak', 'ao5_target'] as const;

export type ProgressChallengeType = (typeof PROGRESS_CHALLENGE_TYPES)[number];

export interface ProgressChallenge {
  dateKey: string;
  timezone: string;
  type: ProgressChallengeType;
  targetValue: number;
  targetMs: number | null;
  progressValue: number;
  isCompleted: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressSummary {
  timezone: string;
  todayKey: string;
  weekKey: string;
  totalXp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  currentStreak: number;
  bestStreak: number;
  weeklySolveTarget: number;
  weeklySolveCount: number;
  weeklyGoalCompleted: boolean;
  updatedAt: string;
}

export interface ProgressSnapshot {
  timezone: string;
  challenges: ProgressChallenge[];
  summary: ProgressSummary;
  updatedAt: string;
}
