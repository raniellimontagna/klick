import { describe, expect, it } from 'vitest';
import {
  calculateLeaderboardMetricsFromSolves,
  resolveLeaderboardPeriod,
  sortLeaderboardEntries,
} from './social';

describe('calculateLeaderboardMetricsFromSolves', () => {
  it('computes best single and ao5 with standard trimming rules', () => {
    const metrics = calculateLeaderboardMetricsFromSolves([
      { effective_ms: 10000, penalty: 'NONE', time_ms: 10000 },
      { effective_ms: 12000, penalty: 'NONE', time_ms: 12000 },
      { effective_ms: 8000, penalty: 'NONE', time_ms: 8000 },
      { effective_ms: 11000, penalty: 'NONE', time_ms: 11000 },
      { effective_ms: 9000, penalty: 'NONE', time_ms: 9000 },
    ]);

    expect(metrics.bestSingleMs).toBe(8000);
    expect(metrics.bestAo5Ms).toBe(10000);
    expect(metrics.bestAo12Ms).toBeNull();
    expect(metrics.solveCount).toBe(5);
  });

  it('skips windows with 2 DNFs when searching best ao5/ao12', () => {
    const metrics = calculateLeaderboardMetricsFromSolves([
      { effective_ms: null, penalty: 'DNF', time_ms: 10000 },
      { effective_ms: null, penalty: 'DNF', time_ms: 10000 },
      { effective_ms: 9000, penalty: 'NONE', time_ms: 9000 },
      { effective_ms: 9200, penalty: 'NONE', time_ms: 9200 },
      { effective_ms: 9400, penalty: 'NONE', time_ms: 9400 },
      { effective_ms: 9600, penalty: 'NONE', time_ms: 9600 },
      { effective_ms: 9800, penalty: 'NONE', time_ms: 9800 },
    ]);

    expect(metrics.bestSingleMs).toBe(9000);
    expect(metrics.bestAo5Ms).toBeCloseTo(9400, 5);
  });

  it('uses penalty fallback when effective_ms is null', () => {
    const metrics = calculateLeaderboardMetricsFromSolves([
      { effective_ms: null, penalty: '+2', time_ms: 10000 },
      { effective_ms: 9700, penalty: 'NONE', time_ms: 9700 },
      { effective_ms: 9800, penalty: 'NONE', time_ms: 9800 },
      { effective_ms: 9900, penalty: 'NONE', time_ms: 9900 },
      { effective_ms: 9950, penalty: 'NONE', time_ms: 9950 },
    ]);

    expect(metrics.bestSingleMs).toBe(9700);
    expect(metrics.bestAo5Ms).toBeCloseTo(9883.333333, 3);
  });
});

describe('sortLeaderboardEntries', () => {
  it('orders by single, then ao5, then ao12, then consistency', () => {
    const sorted = sortLeaderboardEntries([
      {
        id: 'entry-3',
        leaderboardId: 'board-1',
        userId: 'c',
        displayName: 'C',
        avatarUrl: null,
        bestSingleMs: 9000,
        bestAo5Ms: 10000,
        bestAo12Ms: 10500,
        consistencyScore: 8,
        solveCount: 20,
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
      },
      {
        id: 'entry-1',
        leaderboardId: 'board-1',
        userId: 'a',
        displayName: 'A',
        avatarUrl: null,
        bestSingleMs: 8500,
        bestAo5Ms: 9800,
        bestAo12Ms: 10000,
        consistencyScore: 7,
        solveCount: 18,
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
      },
      {
        id: 'entry-2',
        leaderboardId: 'board-1',
        userId: 'b',
        displayName: 'B',
        avatarUrl: null,
        bestSingleMs: 8500,
        bestAo5Ms: 9700,
        bestAo12Ms: 10050,
        consistencyScore: 6,
        solveCount: 25,
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T00:00:00.000Z',
      },
    ]);

    expect(sorted.map((entry) => entry.id)).toEqual(['entry-2', 'entry-1', 'entry-3']);
  });
});

describe('resolveLeaderboardPeriod', () => {
  it('returns stable weekly and monthly keys', () => {
    const reference = new Date('2026-03-15T12:00:00.000Z');

    const weekly = resolveLeaderboardPeriod('weekly', reference);
    const monthly = resolveLeaderboardPeriod('monthly', reference);

    expect(weekly.periodKey).toBe('2026-W11');
    expect(monthly.periodKey).toBe('2026-03');
    expect(weekly.startIso < weekly.endExclusiveIso).toBe(true);
    expect(monthly.startIso < monthly.endExclusiveIso).toBe(true);
  });
});
