import type { Solve } from '@/commons/types';

export type Average = {
  value: number; // in ms, Infinity for DNF
  isDNF: boolean;
};

function resolveEffectiveMs(solve: Solve): number | null {
  const { effectiveMs, timeMs, penalty } = solve;

  if (typeof effectiveMs === 'number' && !Number.isNaN(effectiveMs)) {
    return effectiveMs;
  }

  if (penalty === 'DNF') {
    return Number.POSITIVE_INFINITY;
  }

  if (typeof timeMs === 'number' && !Number.isNaN(timeMs)) {
    if (penalty === '+2') {
      return timeMs + 2000;
    }
    return timeMs;
  }

  return null;
}

function getEffectiveTimes(solves: Solve[]): number[] {
  return solves
    .map((solve) => resolveEffectiveMs(solve))
    .filter((value): value is number => value !== null);
}

/**
 * Calculate single (best solve)
 */
export function calculateSingle(solves: Solve[]): Average {
  if (solves.length === 0) {
    return { value: 0, isDNF: false };
  }

  const times = getEffectiveTimes(solves);

  if (times.length === 0) {
    return { value: 0, isDNF: false };
  }

  const best = Math.min(...times);
  return {
    value: best,
    isDNF: best === Number.POSITIVE_INFINITY,
  };
}

/**
 * Calculate average of N solves (ao5, ao12, etc)
 * Rules:
 * - If 2 or more DNFs in window → average is DNF
 * - Otherwise: discard 1 best and 1 worst, average the rest
 * - +2 is already included in effectiveMs
 */
export function calculateAverageOfN(solves: Solve[], n: number): Average | null {
  if (solves.length < n) {
    return null;
  }

  // Get last N solves
  const window = solves.slice(-n);
  const times = getEffectiveTimes(window);

  if (times.length < n) {
    return null;
  }

  // Count DNFs (Infinity values)
  const dnfCount = times.filter((t) => t === Number.POSITIVE_INFINITY).length;

  // If 2 or more DNFs → average is DNF
  if (dnfCount >= 2) {
    return { value: Number.POSITIVE_INFINITY, isDNF: true };
  }

  // Remove best and worst
  const sorted = [...times].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);

  // Calculate average of remaining times
  const sum = trimmed.reduce((acc, t) => acc + t, 0);
  const avg = sum / trimmed.length;

  return {
    value: avg,
    isDNF: false,
  };
}

/**
 * Calculate ao5 (average of 5)
 */
export function calculateAo5(solves: Solve[]): Average | null {
  return calculateAverageOfN(solves, 5);
}

/**
 * Calculate ao12 (average of 12)
 */
export function calculateAo12(solves: Solve[]): Average | null {
  return calculateAverageOfN(solves, 12);
}

/**
 * Calculate best ao5 from all rolling windows
 */
export function calculateBestAo5(solves: Solve[]): Average | null {
  if (solves.length < 5) {
    return null;
  }

  let best: Average | null = null;

  // Calculate ao5 for each window of 5
  for (let i = 4; i < solves.length; i++) {
    const window = solves.slice(i - 4, i + 1);
    const avg = calculateAverageOfN(window, 5);

    if (!avg) continue;

    // Skip DNF averages when finding best
    if (avg.isDNF) continue;

    if (!best || avg.value < best.value) {
      best = avg;
    }
  }

  return best;
}

/**
 * Calculate best ao12 from all rolling windows
 */
export function calculateBestAo12(solves: Solve[]): Average | null {
  if (solves.length < 12) {
    return null;
  }

  let best: Average | null = null;

  // Calculate ao12 for each window of 12
  for (let i = 11; i < solves.length; i++) {
    const window = solves.slice(i - 11, i + 1);
    const avg = calculateAverageOfN(window, 12);

    if (!avg) continue;

    // Skip DNF averages when finding best
    if (avg.isDNF) continue;

    if (!best || avg.value < best.value) {
      best = avg;
    }
  }

  return best;
}
