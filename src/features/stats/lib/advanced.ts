import type { Solve } from '@/commons/types';

export type AdvancedStats = {
  rollingAverages: {
    ao5: number[];
    ao12: number[];
  };
  consistency: {
    standardDeviation: number;
    coefficientOfVariation: number; // CV = (std / mean) * 100
  };
  performance: {
    averageTPS: number; // Turns Per Second (25 turns / time in seconds)
    distribution: TimeDistribution;
  };
};

export type TimeDistribution = {
  ranges: string[];
  counts: number[];
};

export type ChartDataPoint = {
  index: number;
  single: number | null;
  ao5: number | null;
  ao12: number | null;
};

/**
 * Calculate rolling averages for all solves
 * Returns array of ao5 and ao12 values for each solve
 */
export function calculateRollingAverages(solves: Solve[]): {
  ao5: number[];
  ao12: number[];
} {
  const ao5Values: number[] = [];
  const ao12Values: number[] = [];

  for (let i = 0; i < solves.length; i++) {
    // Calculate ao5 for current window
    if (i >= 4) {
      const window = solves.slice(i - 4, i + 1);
      const ao5 = calculateWindowAverage(window);
      ao5Values.push(ao5);
    } else {
      ao5Values.push(Number.NaN);
    }

    // Calculate ao12 for current window
    if (i >= 11) {
      const window = solves.slice(i - 11, i + 1);
      const ao12 = calculateWindowAverage(window);
      ao12Values.push(ao12);
    } else {
      ao12Values.push(Number.NaN);
    }
  }

  return { ao5: ao5Values, ao12: ao12Values };
}

/**
 * Calculate average for a window of solves (helper for rolling averages)
 */
function calculateWindowAverage(window: Solve[]): number {
  const times = window.map((s) => s.effectiveMs);
  const dnfCount = times.filter((t) => t === Number.POSITIVE_INFINITY).length;

  if (dnfCount >= 2) {
    return Number.POSITIVE_INFINITY;
  }

  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  const sum = trimmed.reduce((acc, t) => acc + t, 0);

  return sum / trimmed.length;
}

/**
 * Calculate standard deviation of solve times
 */
export function calculateStandardDeviation(solves: Solve[]): number {
  const validTimes = solves.map((s) => s.effectiveMs).filter((t) => t !== Number.POSITIVE_INFINITY);

  if (validTimes.length === 0) {
    return 0;
  }

  const mean = validTimes.reduce((acc, t) => acc + t, 0) / validTimes.length;
  const squaredDiffs = validTimes.map((t) => Math.pow(t - mean, 2));
  const variance = squaredDiffs.reduce((acc, d) => acc + d, 0) / validTimes.length;

  return Math.sqrt(variance);
}

/**
 * Calculate coefficient of variation (CV = std / mean * 100)
 * Lower CV = more consistent
 */
export function calculateCoefficientOfVariation(solves: Solve[]): number {
  const validTimes = solves.map((s) => s.effectiveMs).filter((t) => t !== Number.POSITIVE_INFINITY);

  if (validTimes.length === 0) {
    return 0;
  }

  const mean = validTimes.reduce((acc, t) => acc + t, 0) / validTimes.length;
  const std = calculateStandardDeviation(solves);

  if (mean === 0) {
    return 0;
  }

  return (std / mean) * 100;
}

/**
 * Calculate average Turns Per Second (TPS)
 * Assumes 25 turns per scramble (standard 3x3)
 */
export function calculateAverageTPS(solves: Solve[]): number {
  const validTimes = solves
    .map((s) => s.effectiveMs)
    .filter((t) => t !== Number.POSITIVE_INFINITY && Number.isFinite(t) && t > 0);

  if (validTimes.length === 0) {
    return 0;
  }

  const turnsPerScramble = 25;
  const totalTPS = validTimes.reduce((acc, timeMs) => {
    const timeSeconds = timeMs / 1000;
    const tps = turnsPerScramble / timeSeconds;
    return acc + tps;
  }, 0);

  return totalTPS / validTimes.length;
}

/**
 * Calculate time distribution by ranges
 */
export function calculateTimeDistribution(solves: Solve[]): TimeDistribution {
  const validTimes = solves.map((s) => s.effectiveMs).filter((t) => t !== Number.POSITIVE_INFINITY);

  if (validTimes.length === 0) {
    return { ranges: [], counts: [] };
  }

  // Find min and max times
  const min = Math.min(...validTimes);
  const max = Math.max(...validTimes);

  // Create 10 ranges between min and max
  const rangeCount = 10;
  const rangeSize = (max - min) / rangeCount;

  const ranges: string[] = [];
  const counts: number[] = [];

  for (let i = 0; i < rangeCount; i++) {
    const rangeStart = min + i * rangeSize;
    const rangeEnd = min + (i + 1) * rangeSize;

    // Format range label (convert ms to seconds)
    const startSec = (rangeStart / 1000).toFixed(1);
    const endSec = (rangeEnd / 1000).toFixed(1);
    ranges.push(`${startSec}-${endSec}s`);

    // Count solves in this range
    const count = validTimes.filter((t) => t >= rangeStart && t < rangeEnd).length;
    counts.push(count);
  }

  return { ranges, counts };
}

/**
 * Prepare data for evolution chart
 */
export function prepareChartData(solves: Solve[]): ChartDataPoint[] {
  const { ao5, ao12 } = calculateRollingAverages(solves);

  return solves.map((solve, index) => ({
    index: index + 1,
    single: solve.effectiveMs !== Number.POSITIVE_INFINITY ? solve.effectiveMs : null,
    ao5: !Number.isNaN(ao5[index]) && ao5[index] !== Number.POSITIVE_INFINITY ? ao5[index] : null,
    ao12:
      !Number.isNaN(ao12[index]) && ao12[index] !== Number.POSITIVE_INFINITY ? ao12[index] : null,
  }));
}

/**
 * Get all advanced stats for current session
 */
export function calculateAdvancedStats(solves: Solve[]): AdvancedStats {
  const rollingAverages = calculateRollingAverages(solves);
  const standardDeviation = calculateStandardDeviation(solves);
  const coefficientOfVariation = calculateCoefficientOfVariation(solves);
  const averageTPS = calculateAverageTPS(solves);
  const distribution = calculateTimeDistribution(solves);

  return {
    rollingAverages,
    consistency: {
      standardDeviation,
      coefficientOfVariation,
    },
    performance: {
      averageTPS,
      distribution,
    },
  };
}
