import { describe, expect, it } from 'vitest';
import type { Session, Solve } from '@/shared/types';
import {
  evaluateProgressFromSessions,
  getDayKey,
  getWeekKey,
  shiftDayKey,
} from './progress-engine';

function createSolve(
  id: string,
  createdAt: string,
  timeMs: number,
  options?: {
    penalty?: Solve['penalty'];
    effectiveMs?: number;
  },
): Solve {
  const penalty = options?.penalty ?? 'NONE';

  return {
    id,
    timeMs,
    penalty,
    effectiveMs:
      options?.effectiveMs ??
      (penalty === 'DNF' ? Number.POSITIVE_INFINITY : penalty === '+2' ? timeMs + 2000 : timeMs),
    scramble: "R U R' U'",
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
  };
}

function createSession(solves: Solve[]): Session {
  return {
    id: 'session-1',
    name: 'Sessão Teste',
    puzzleType: '3x3',
    solves,
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    updatedAt: new Date('2026-03-01T00:00:00.000Z'),
  };
}

describe('progress-engine', () => {
  it('creates daily challenges and rotates by timezone day', () => {
    const timezone = 'America/Sao_Paulo';

    const firstResult = evaluateProgressFromSessions({
      sessions: [],
      existingChallenges: [],
      now: new Date('2026-03-16T02:10:00.000Z'),
      timezone,
    });

    expect(firstResult.challenges).toHaveLength(3);
    expect(firstResult.summary.todayKey).toBe('2026-03-15');

    const secondResult = evaluateProgressFromSessions({
      sessions: [],
      existingChallenges: firstResult.challenges,
      now: new Date('2026-03-16T04:10:00.000Z'),
      timezone,
    });

    expect(secondResult.summary.todayKey).toBe('2026-03-16');
    expect(secondResult.challenges.filter((challenge) => challenge.dateKey === '2026-03-16')).toHaveLength(3);
  });

  it('marks daily challenges as completed when solve signals meet targets', () => {
    const timezone = 'America/Sao_Paulo';
    const day = '2026-03-15';

    const solveTimes = [
      14500, 15200, 14900, 14100, 13800, 14700, 15000, 14600, 14200, 14400, 13900, 14300,
    ];

    const solves = solveTimes.map((timeMs, index) =>
      createSolve(`solve-${index + 1}`, `${day}T12:${String(index).padStart(2, '0')}:00.000Z`, timeMs),
    );

    const result = evaluateProgressFromSessions({
      sessions: [createSession(solves)],
      existingChallenges: [],
      now: new Date(`${day}T18:00:00.000Z`),
      timezone,
    });

    const todayChallenges = result.challenges.filter((challenge) => challenge.dateKey === day);

    expect(todayChallenges).toHaveLength(3);
    expect(todayChallenges.every((challenge) => challenge.isCompleted)).toBe(true);

    const solveCountChallenge = todayChallenges.find((challenge) => challenge.type === 'solve_count');
    const cleanStreakChallenge = todayChallenges.find((challenge) => challenge.type === 'clean_streak');
    const ao5Challenge = todayChallenges.find((challenge) => challenge.type === 'ao5_target');

    expect(solveCountChallenge?.progressValue).toBeGreaterThanOrEqual(12);
    expect(cleanStreakChallenge?.progressValue).toBeGreaterThanOrEqual(5);
    expect(ao5Challenge?.progressValue).toBe(1);

    expect(result.summary.weeklySolveCount).toBe(solves.length);
    expect(result.summary.currentStreak).toBe(1);
    expect(result.summary.totalXp).toBeGreaterThan(0);
  });

  it('computes streak and week key from solved days', () => {
    const timezone = 'America/Sao_Paulo';
    const today = new Date('2026-03-18T12:00:00.000Z');
    const todayKey = getDayKey(today, timezone);
    const yesterdayKey = shiftDayKey(todayKey, -1);
    const twoDaysAgoKey = shiftDayKey(todayKey, -2);

    const solves = [
      createSolve('s-1', `${twoDaysAgoKey}T13:00:00.000Z`, 18000),
      createSolve('s-2', `${yesterdayKey}T13:00:00.000Z`, 17000),
      createSolve('s-3', `${todayKey}T13:00:00.000Z`, 16000),
    ];

    const result = evaluateProgressFromSessions({
      sessions: [createSession(solves)],
      existingChallenges: [],
      now: today,
      timezone,
    });

    expect(result.summary.currentStreak).toBe(3);
    expect(result.summary.bestStreak).toBe(3);
    expect(result.summary.weekKey).toBe(getWeekKey(todayKey));
  });
});
