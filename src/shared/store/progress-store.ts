import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  createDefaultProgressSummary,
  evaluateProgressFromSessions,
  resolveTimeZone,
} from '@/shared/lib';
import type {
  ProgressChallenge,
  ProgressChallengeType,
  ProgressSnapshot,
  ProgressSummary,
  Session,
} from '@/shared/types';

const CHALLENGE_ORDER: Record<ProgressChallengeType, number> = {
  solve_count: 0,
  clean_streak: 1,
  ao5_target: 2,
};

interface ProgressStore {
  timezone: string;
  challenges: ProgressChallenge[];
  summary: ProgressSummary;
  updatedAt: string;
  evaluateFromSessions: (
    sessions: Session[],
    options?: {
      now?: Date;
      timezone?: string;
    },
  ) => void;
  hydrateProgress: (snapshot: Omit<ProgressSnapshot, 'updatedAt'> & { updatedAt?: string }) => void;
  getTodayChallenges: () => ProgressChallenge[];
}

function getNowIso() {
  return new Date().toISOString();
}

function sortChallenges(challenges: ProgressChallenge[]): ProgressChallenge[] {
  return [...challenges].sort((left, right) => {
    if (left.dateKey === right.dateKey) {
      return CHALLENGE_ORDER[left.type] - CHALLENGE_ORDER[right.type];
    }

    return left.dateKey.localeCompare(right.dateKey);
  });
}

function isChallengeType(value: string): value is ProgressChallengeType {
  return value === 'solve_count' || value === 'clean_streak' || value === 'ao5_target';
}

function normalizeChallenge(challenge: ProgressChallenge): ProgressChallenge {
  const nowIso = getNowIso();

  return {
    dateKey: typeof challenge.dateKey === 'string' ? challenge.dateKey : nowIso.slice(0, 10),
    timezone: resolveTimeZone(challenge.timezone),
    type: isChallengeType(challenge.type) ? challenge.type : 'solve_count',
    targetValue: Number.isFinite(challenge.targetValue) ? Math.max(1, challenge.targetValue) : 1,
    targetMs: Number.isFinite(challenge.targetMs) ? challenge.targetMs : null,
    progressValue: Number.isFinite(challenge.progressValue) ? Math.max(0, challenge.progressValue) : 0,
    isCompleted: Boolean(challenge.isCompleted),
    completedAt: challenge.completedAt ?? null,
    createdAt: challenge.createdAt || nowIso,
    updatedAt: challenge.updatedAt || nowIso,
  };
}

function normalizeSummary(summary: ProgressSummary, fallbackTimezone: string): ProgressSummary {
  const timezone = resolveTimeZone(summary.timezone || fallbackTimezone);
  const fallback = createDefaultProgressSummary(timezone);

  return {
    timezone,
    todayKey: summary.todayKey || fallback.todayKey,
    weekKey: summary.weekKey || fallback.weekKey,
    totalXp: Number.isFinite(summary.totalXp) ? Math.max(0, summary.totalXp) : 0,
    level: Number.isFinite(summary.level) ? Math.max(1, summary.level) : 1,
    xpIntoLevel: Number.isFinite(summary.xpIntoLevel) ? Math.max(0, summary.xpIntoLevel) : 0,
    xpToNextLevel: Number.isFinite(summary.xpToNextLevel)
      ? Math.max(1, summary.xpToNextLevel)
      : fallback.xpToNextLevel,
    currentStreak: Number.isFinite(summary.currentStreak) ? Math.max(0, summary.currentStreak) : 0,
    bestStreak: Number.isFinite(summary.bestStreak) ? Math.max(0, summary.bestStreak) : 0,
    weeklySolveTarget: Number.isFinite(summary.weeklySolveTarget)
      ? Math.max(1, summary.weeklySolveTarget)
      : fallback.weeklySolveTarget,
    weeklySolveCount: Number.isFinite(summary.weeklySolveCount)
      ? Math.max(0, summary.weeklySolveCount)
      : 0,
    weeklyGoalCompleted: Boolean(summary.weeklyGoalCompleted),
    updatedAt: summary.updatedAt || getNowIso(),
  };
}

function areChallengesEquivalent(
  previousChallenges: ProgressChallenge[],
  nextChallenges: ProgressChallenge[],
): boolean {
  if (previousChallenges.length !== nextChallenges.length) {
    return false;
  }

  return previousChallenges.every((previous, index) => {
    const next = nextChallenges[index];

    return (
      previous.dateKey === next.dateKey &&
      previous.timezone === next.timezone &&
      previous.type === next.type &&
      previous.targetValue === next.targetValue &&
      previous.targetMs === next.targetMs &&
      previous.progressValue === next.progressValue &&
      previous.isCompleted === next.isCompleted &&
      previous.completedAt === next.completedAt
    );
  });
}

function areSummariesEquivalent(previous: ProgressSummary, next: ProgressSummary): boolean {
  return (
    previous.timezone === next.timezone &&
    previous.todayKey === next.todayKey &&
    previous.weekKey === next.weekKey &&
    previous.totalXp === next.totalXp &&
    previous.level === next.level &&
    previous.xpIntoLevel === next.xpIntoLevel &&
    previous.xpToNextLevel === next.xpToNextLevel &&
    previous.currentStreak === next.currentStreak &&
    previous.bestStreak === next.bestStreak &&
    previous.weeklySolveTarget === next.weeklySolveTarget &&
    previous.weeklySolveCount === next.weeklySolveCount &&
    previous.weeklyGoalCompleted === next.weeklyGoalCompleted
  );
}

const initialSummary = createDefaultProgressSummary();

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      timezone: initialSummary.timezone,
      challenges: [],
      summary: initialSummary,
      updatedAt: initialSummary.updatedAt,

      evaluateFromSessions: (sessions, options): void => {
        const state = get();

        const result = evaluateProgressFromSessions({
          sessions,
          existingChallenges: state.challenges,
          now: options?.now,
          timezone: options?.timezone ?? state.timezone,
        });

        const sortedChallenges = sortChallenges(result.challenges);
        const hasChallengeChanges = !areChallengesEquivalent(state.challenges, sortedChallenges);
        const hasSummaryChanges = !areSummariesEquivalent(state.summary, result.summary);
        const hasTimezoneChanges = state.timezone !== result.timezone;

        if (!hasChallengeChanges && !hasSummaryChanges && !hasTimezoneChanges) {
          return;
        }

        set({
          timezone: result.timezone,
          challenges: sortedChallenges,
          summary: result.summary,
          updatedAt: result.updatedAt,
        });
      },

      hydrateProgress: (snapshot): void => {
        const timezone = resolveTimeZone(snapshot.timezone);
        const challenges = sortChallenges(snapshot.challenges.map(normalizeChallenge));
        const summary = normalizeSummary(snapshot.summary, timezone);

        set({
          timezone,
          challenges,
          summary,
          updatedAt: snapshot.updatedAt ?? getNowIso(),
        });
      },

      getTodayChallenges: () => {
        const state = get();
        const todayKey = state.summary.todayKey;

        return state.challenges.filter((challenge) => challenge.dateKey === todayKey);
      },
    }),
    {
      name: 'klick-progress-hub-v1',
    },
  ),
);
