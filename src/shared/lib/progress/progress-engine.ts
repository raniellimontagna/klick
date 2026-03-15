import type { ProgressChallenge, ProgressChallengeType, ProgressSummary, Session, Solve } from '@/shared/types';

const DAY_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

const DAILY_HISTORY_RETENTION_DAYS = 45;
const WEEKLY_SOLVE_TARGET = 70;
const XP_PER_VALID_SOLVE = 12;
const XP_PER_COMPLETED_CHALLENGE = 40;
const XP_PER_STREAK_DAY = 15;
const XP_PER_LEVEL = 500;

const DEFAULT_AO5_TARGET_MS = 30000;
const MIN_AO5_TARGET_MS = 12000;
const MAX_AO5_TARGET_MS = 45000;

interface ChallengeBlueprint {
  type: ProgressChallengeType;
  targetValue: number;
  targetMs: number | null;
}

interface EvaluateProgressInput {
  sessions: Session[];
  existingChallenges: ProgressChallenge[];
  now?: Date;
  timezone?: string;
}

interface ProgressEvaluationResult {
  timezone: string;
  challenges: ProgressChallenge[];
  summary: ProgressSummary;
  updatedAt: string;
}

interface ChallengeSignals {
  solveCount: number;
  bestCleanStreak: number;
  bestAo5Ms: number | null;
}

function getNowIso(now = new Date()): string {
  return now.toISOString();
}

function getDayFormatter(timezone: string): Intl.DateTimeFormat {
  const cached = DAY_FORMATTERS.get(timezone);

  if (cached) {
    return cached;
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  DAY_FORMATTERS.set(timezone, formatter);

  return formatter;
}

export function resolveTimeZone(preferred?: string): string {
  if (preferred) {
    try {
      const formatter = getDayFormatter(preferred);
      formatter.format(new Date());
      return preferred;
    } catch {
      // Ignore invalid timezone and fallback to runtime timezone.
    }
  }

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getDayKey(date: Date, timezone: string): string {
  const parts = getDayFormatter(timezone).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }

  return `${year}-${month}-${day}`;
}

function toDayDate(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const dayDate = toDayDate(dayKey);
  dayDate.setUTCDate(dayDate.getUTCDate() + deltaDays);

  return dayDate.toISOString().slice(0, 10);
}

export function getWeekKey(dayKey: string): string {
  const dayDate = toDayDate(dayKey);
  const dayOfWeek = dayDate.getUTCDay();
  const diffToMonday = (dayOfWeek + 6) % 7;

  dayDate.setUTCDate(dayDate.getUTCDate() - diffToMonday);

  return dayDate.toISOString().slice(0, 10);
}

function toDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return new Date(0);
  }

  return parsed;
}

function flattenSolves(sessions: Session[]): Solve[] {
  const solves = sessions.flatMap((session) => session.solves);

  return solves
    .map((solve) => ({
      ...solve,
      createdAt: toDate(solve.createdAt),
    }))
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
}

function calculateAo5FromWindow(window: number[]): number | null {
  if (window.length !== 5) {
    return null;
  }

  const dnfCount = window.filter((value) => !Number.isFinite(value)).length;

  if (dnfCount >= 2) {
    return null;
  }

  const sorted = [...window].sort((left, right) => left - right);
  const trimmed = sorted.slice(1, -1);

  if (trimmed.some((value) => !Number.isFinite(value))) {
    return null;
  }

  const total = trimmed.reduce((sum, value) => sum + value, 0);

  return total / trimmed.length;
}

function calculateBestAo5Ms(solves: Solve[]): number | null {
  if (solves.length < 5) {
    return null;
  }

  let bestAo5Ms = Number.POSITIVE_INFINITY;

  for (let index = 4; index < solves.length; index += 1) {
    const window = solves.slice(index - 4, index + 1).map((solve) => solve.effectiveMs);
    const ao5Value = calculateAo5FromWindow(window);

    if (ao5Value !== null && ao5Value < bestAo5Ms) {
      bestAo5Ms = ao5Value;
    }
  }

  return Number.isFinite(bestAo5Ms) ? bestAo5Ms : null;
}

function calculateBestCleanStreak(solves: Solve[]): number {
  let currentStreak = 0;
  let bestStreak = 0;

  for (const solve of solves) {
    if (Number.isFinite(solve.effectiveMs)) {
      currentStreak += 1;
      bestStreak = Math.max(bestStreak, currentStreak);
      continue;
    }

    currentStreak = 0;
  }

  return bestStreak;
}

function resolveAo5TargetMs(solves: Solve[]): number {
  const bestSingleMs = solves.reduce<number>((best, solve) => {
    if (!Number.isFinite(solve.effectiveMs)) {
      return best;
    }

    return Math.min(best, solve.effectiveMs);
  }, Number.POSITIVE_INFINITY);

  if (!Number.isFinite(bestSingleMs)) {
    return DEFAULT_AO5_TARGET_MS;
  }

  const roundedTarget = Math.round((bestSingleMs * 1.8) / 1000) * 1000;

  return Math.max(MIN_AO5_TARGET_MS, Math.min(MAX_AO5_TARGET_MS, roundedTarget));
}

function createDailyBlueprints(ao5TargetMs: number): ChallengeBlueprint[] {
  return [
    {
      type: 'solve_count',
      targetValue: 12,
      targetMs: null,
    },
    {
      type: 'clean_streak',
      targetValue: 5,
      targetMs: null,
    },
    {
      type: 'ao5_target',
      targetValue: 1,
      targetMs: ao5TargetMs,
    },
  ];
}

function createChallengeFromBlueprint(
  dayKey: string,
  timezone: string,
  nowIso: string,
  blueprint: ChallengeBlueprint,
): ProgressChallenge {
  return {
    dateKey: dayKey,
    timezone,
    type: blueprint.type,
    targetValue: blueprint.targetValue,
    targetMs: blueprint.targetMs,
    progressValue: 0,
    isCompleted: false,
    completedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function retainRecentChallenges(challenges: ProgressChallenge[], todayKey: string): ProgressChallenge[] {
  const minDayKey = shiftDayKey(todayKey, -DAILY_HISTORY_RETENTION_DAYS);

  return challenges.filter((challenge) => challenge.dateKey >= minDayKey);
}

function ensureCurrentDayChallenges(
  challenges: ProgressChallenge[],
  dayKey: string,
  timezone: string,
  nowIso: string,
  ao5TargetMs: number,
): ProgressChallenge[] {
  const blueprints = createDailyBlueprints(ao5TargetMs);
  const byType = new Map<ProgressChallengeType, ProgressChallenge>();

  for (const challenge of challenges) {
    if (challenge.dateKey !== dayKey) {
      continue;
    }

    byType.set(challenge.type, challenge);
  }

  const dayChallenges = blueprints.map((blueprint) => {
    const existing = byType.get(blueprint.type);

    if (!existing) {
      return createChallengeFromBlueprint(dayKey, timezone, nowIso, blueprint);
    }

    if (existing.targetMs === blueprint.targetMs && existing.targetValue === blueprint.targetValue) {
      return existing;
    }

    return {
      ...existing,
      timezone,
      targetMs: blueprint.targetMs,
      targetValue: blueprint.targetValue,
      updatedAt: nowIso,
    };
  });

  const nonTodayChallenges = challenges.filter((challenge) => challenge.dateKey !== dayKey);

  return [...nonTodayChallenges, ...dayChallenges];
}

function getChallengeSignals(solvesToday: Solve[]): ChallengeSignals {
  return {
    solveCount: solvesToday.length,
    bestCleanStreak: calculateBestCleanStreak(solvesToday),
    bestAo5Ms: calculateBestAo5Ms(solvesToday),
  };
}

function resolveChallengeProgress(
  challenge: ProgressChallenge,
  signals: ChallengeSignals,
): { progressValue: number; completed: boolean } {
  if (challenge.type === 'solve_count') {
    return {
      progressValue: signals.solveCount,
      completed: signals.solveCount >= challenge.targetValue,
    };
  }

  if (challenge.type === 'clean_streak') {
    return {
      progressValue: signals.bestCleanStreak,
      completed: signals.bestCleanStreak >= challenge.targetValue,
    };
  }

  const targetMs = typeof challenge.targetMs === 'number' ? challenge.targetMs : null;
  const completed = targetMs !== null && signals.bestAo5Ms !== null && signals.bestAo5Ms <= targetMs;

  return {
    progressValue: completed ? 1 : 0,
    completed,
  };
}

function updateCurrentDayChallenges(
  challenges: ProgressChallenge[],
  dayKey: string,
  nowIso: string,
  signals: ChallengeSignals,
): ProgressChallenge[] {
  return challenges.map((challenge) => {
    if (challenge.dateKey !== dayKey) {
      return challenge;
    }

    const resolved = resolveChallengeProgress(challenge, signals);
    const nextProgressValue = Math.max(challenge.progressValue, resolved.progressValue);
    const nextCompleted = challenge.isCompleted || resolved.completed;
    const nextCompletedAt = challenge.completedAt ?? (resolved.completed ? nowIso : null);

    if (
      nextProgressValue === challenge.progressValue &&
      nextCompleted === challenge.isCompleted &&
      nextCompletedAt === challenge.completedAt
    ) {
      return challenge;
    }

    return {
      ...challenge,
      progressValue: nextProgressValue,
      isCompleted: nextCompleted,
      completedAt: nextCompletedAt,
      updatedAt: nowIso,
    };
  });
}

function calculateCurrentStreak(dayKeys: Set<string>, todayKey: string): number {
  if (!dayKeys.has(todayKey)) {
    return 0;
  }

  let streak = 0;
  let cursor = todayKey;

  while (dayKeys.has(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, -1);
  }

  return streak;
}

function calculateBestStreak(dayKeys: string[]): number {
  if (dayKeys.length === 0) {
    return 0;
  }

  const ordered = [...new Set(dayKeys)].sort();

  let bestStreak = 1;
  let currentStreak = 1;

  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const expected = shiftDayKey(previous, 1);

    if (ordered[index] === expected) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }

    bestStreak = Math.max(bestStreak, currentStreak);
  }

  return bestStreak;
}

function buildProgressSummary(
  solves: Solve[],
  challenges: ProgressChallenge[],
  timezone: string,
  todayKey: string,
  weekKey: string,
  updatedAt: string,
): ProgressSummary {
  const solveDayKeys = solves.map((solve) => getDayKey(solve.createdAt, timezone));
  const dayKeysSet = new Set(solveDayKeys);

  const validSolveCount = solves.filter((solve) => Number.isFinite(solve.effectiveMs)).length;
  const completedChallengeCount = challenges.filter((challenge) => challenge.isCompleted).length;

  const totalXp =
    validSolveCount * XP_PER_VALID_SOLVE +
    completedChallengeCount * XP_PER_COMPLETED_CHALLENGE +
    calculateCurrentStreak(dayKeysSet, todayKey) * XP_PER_STREAK_DAY;

  const level = Math.max(1, Math.floor(totalXp / XP_PER_LEVEL) + 1);
  const xpIntoLevel = totalXp % XP_PER_LEVEL;
  const xpToNextLevel = xpIntoLevel === 0 ? XP_PER_LEVEL : XP_PER_LEVEL - xpIntoLevel;

  const weeklySolveCount = solveDayKeys.filter((dayKey) => getWeekKey(dayKey) === weekKey).length;

  return {
    timezone,
    todayKey,
    weekKey,
    totalXp,
    level,
    xpIntoLevel,
    xpToNextLevel,
    currentStreak: calculateCurrentStreak(dayKeysSet, todayKey),
    bestStreak: calculateBestStreak(solveDayKeys),
    weeklySolveTarget: WEEKLY_SOLVE_TARGET,
    weeklySolveCount,
    weeklyGoalCompleted: weeklySolveCount >= WEEKLY_SOLVE_TARGET,
    updatedAt,
  };
}

export function createDefaultProgressSummary(timezone?: string): ProgressSummary {
  const resolvedTimezone = resolveTimeZone(timezone);
  const now = new Date();
  const todayKey = getDayKey(now, resolvedTimezone);
  const weekKey = getWeekKey(todayKey);
  const updatedAt = getNowIso(now);

  return {
    timezone: resolvedTimezone,
    todayKey,
    weekKey,
    totalXp: 0,
    level: 1,
    xpIntoLevel: 0,
    xpToNextLevel: XP_PER_LEVEL,
    currentStreak: 0,
    bestStreak: 0,
    weeklySolveTarget: WEEKLY_SOLVE_TARGET,
    weeklySolveCount: 0,
    weeklyGoalCompleted: false,
    updatedAt,
  };
}

export function evaluateProgressFromSessions({
  sessions,
  existingChallenges,
  now,
  timezone,
}: EvaluateProgressInput): ProgressEvaluationResult {
  const referenceDate = now ?? new Date();
  const nowIso = getNowIso(referenceDate);
  const resolvedTimezone = resolveTimeZone(timezone);
  const todayKey = getDayKey(referenceDate, resolvedTimezone);

  const allSolves = flattenSolves(sessions);
  const ao5TargetMs = resolveAo5TargetMs(allSolves);

  const retainedChallenges = retainRecentChallenges(existingChallenges, todayKey);
  const withTodayChallenges = ensureCurrentDayChallenges(
    retainedChallenges,
    todayKey,
    resolvedTimezone,
    nowIso,
    ao5TargetMs,
  );

  const solvesToday = allSolves.filter(
    (solve) => getDayKey(solve.createdAt, resolvedTimezone) === todayKey,
  );

  const challengeSignals = getChallengeSignals(solvesToday);

  const updatedChallenges = updateCurrentDayChallenges(
    withTodayChallenges,
    todayKey,
    nowIso,
    challengeSignals,
  );

  const summary = buildProgressSummary(
    allSolves,
    updatedChallenges,
    resolvedTimezone,
    todayKey,
    getWeekKey(todayKey),
    nowIso,
  );

  return {
    timezone: resolvedTimezone,
    challenges: updatedChallenges,
    summary,
    updatedAt: nowIso,
  };
}
