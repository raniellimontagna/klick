import { describe, expect, it } from 'vitest';
import type { Solve } from '@/shared/types';
import {
  calculateAo5,
  calculateAo12,
  calculateBestAo5,
  calculateBestAo12,
  calculateSingle,
} from './averages';

// Helper to create a solve
function createSolve(timeMs: number, penalty: 'NONE' | '+2' | 'DNF'): Solve {
  let effectiveMs = timeMs;
  if (penalty === '+2') {
    effectiveMs = timeMs + 2000;
  } else if (penalty === 'DNF') {
    effectiveMs = Number.POSITIVE_INFINITY;
  }

  return {
    id: crypto.randomUUID(),
    timeMs,
    penalty,
    effectiveMs,
    scramble: "R U R' U'",
    createdAt: new Date(),
  };
}

describe('calculateSingle', () => {
  it('should return 0 for empty array', () => {
    const result = calculateSingle([]);
    expect(result.value).toBe(0);
    expect(result.isDNF).toBe(false);
  });

  it('should use timeMs when effectiveMs is missing', () => {
    const legacySolve = {
      ...createSolve(10000, 'NONE'),
      effectiveMs: null as unknown as number,
    };
    const result = calculateSingle([legacySolve, createSolve(12000, 'NONE')]);
    expect(result.value).toBe(10000);
    expect(result.isDNF).toBe(false);
  });

  it('should return best time without penalties', () => {
    const solves = [
      createSolve(10000, 'NONE'),
      createSolve(12000, 'NONE'),
      createSolve(8000, 'NONE'),
    ];
    const result = calculateSingle(solves);
    expect(result.value).toBe(8000);
    expect(result.isDNF).toBe(false);
  });

  it('should return best time considering +2 penalty', () => {
    const solves = [
      createSolve(10000, 'NONE'),
      createSolve(8000, '+2'), // 10000ms effective
      createSolve(9000, 'NONE'),
    ];
    const result = calculateSingle(solves);
    expect(result.value).toBe(9000);
    expect(result.isDNF).toBe(false);
  });

  it('should ignore DNF when finding best', () => {
    const solves = [
      createSolve(10000, 'DNF'),
      createSolve(12000, 'NONE'),
      createSolve(8000, 'NONE'),
    ];
    const result = calculateSingle(solves);
    expect(result.value).toBe(8000);
    expect(result.isDNF).toBe(false);
  });

  it('should return DNF when all solves are DNF', () => {
    const solves = [createSolve(10000, 'DNF'), createSolve(12000, 'DNF')];
    const result = calculateSingle(solves);
    expect(result.value).toBe(Number.POSITIVE_INFINITY);
    expect(result.isDNF).toBe(true);
  });
});

describe('calculateAo5', () => {
  it('should return null when less than 5 solves', () => {
    const solves = [createSolve(10000, 'NONE'), createSolve(11000, 'NONE')];
    expect(calculateAo5(solves)).toBeNull();
  });

  it('should handle legacy solves without effectiveMs', () => {
    const solves = [
      { ...createSolve(10000, 'NONE'), effectiveMs: null as unknown as number },
      { ...createSolve(12000, 'NONE'), effectiveMs: null as unknown as number },
      createSolve(8000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(9000, 'NONE'),
    ];

    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(10000);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should calculate ao5 without penalties', () => {
    const solves = [
      createSolve(10000, 'NONE'),
      createSolve(12000, 'NONE'),
      createSolve(8000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(9000, 'NONE'),
    ];
    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // Should discard 8000 (best) and 12000 (worst)
      // Average of [10000, 11000, 9000] = 10000
      expect(result.value).toBe(10000);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should calculate ao5 with one +2 penalty', () => {
    const solves = [
      createSolve(10000, 'NONE'),
      createSolve(12000, '+2'), // 14000ms effective
      createSolve(8000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(9000, 'NONE'),
    ];
    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // Should discard 8000 (best) and 14000 (worst)
      // Average of [10000, 11000, 9000] = 10000
      expect(result.value).toBe(10000);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should calculate ao5 with multiple +2 penalties', () => {
    const solves = [
      createSolve(10000, '+2'), // 12000ms effective
      createSolve(8000, '+2'), // 10000ms effective
      createSolve(7000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(9000, 'NONE'),
    ];
    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // Effective times: [12000, 10000, 7000, 11000, 9000]
      // Discard 7000 (best) and 12000 (worst)
      // Average of [10000, 11000, 9000] = 10000
      expect(result.value).toBe(10000);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should calculate ao5 with one DNF', () => {
    const solves = [
      createSolve(10000, 'NONE'),
      createSolve(12000, 'DNF'),
      createSolve(8000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(9000, 'NONE'),
    ];
    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // DNF is worst, discard it and 8000 (best)
      // Average of [10000, 11000, 9000] = 10000
      expect(result.value).toBe(10000);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should return DNF when 2 or more DNFs', () => {
    const solves = [
      createSolve(10000, 'DNF'),
      createSolve(12000, 'DNF'),
      createSolve(8000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(9000, 'NONE'),
    ];
    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(Number.POSITIVE_INFINITY);
      expect(result.isDNF).toBe(true);
    }
  });

  it('should validate min/max discard', () => {
    const solves = [
      createSolve(15000, 'NONE'),
      createSolve(13000, 'NONE'),
      createSolve(10000, 'NONE'),
      createSolve(12000, 'NONE'),
      createSolve(11000, 'NONE'),
    ];
    const result = calculateAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // Discard 10000 (best) and 15000 (worst)
      // Average of [13000, 12000, 11000] = 12000
      expect(result.value).toBe(12000);
      expect(result.isDNF).toBe(false);
    }
  });
});

describe('calculateAo12', () => {
  it('should return null when less than 12 solves', () => {
    const solves = Array.from({ length: 10 }, (_, i) => createSolve(10000 + i * 1000, 'NONE'));
    expect(calculateAo12(solves)).toBeNull();
  });

  it('should calculate ao12 without penalties', () => {
    const solves = [
      createSolve(10000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(12000, 'NONE'),
      createSolve(9000, 'NONE'),
      createSolve(13000, 'NONE'),
      createSolve(8000, 'NONE'),
      createSolve(14000, 'NONE'),
      createSolve(10500, 'NONE'),
      createSolve(11500, 'NONE'),
      createSolve(9500, 'NONE'),
      createSolve(12500, 'NONE'),
      createSolve(10200, 'NONE'),
    ];
    const result = calculateAo12(solves);
    expect(result).not.toBeNull();
    if (result) {
      // Discard 8000 (best) and 14000 (worst)
      // Average of remaining 10 values
      const expected =
        (10000 + 11000 + 12000 + 9000 + 13000 + 10500 + 11500 + 9500 + 12500 + 10200) / 10;
      expect(result.value).toBe(expected);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should return DNF when 2 or more DNFs in ao12', () => {
    const solves = [
      createSolve(10000, 'DNF'),
      createSolve(11000, 'DNF'),
      createSolve(12000, 'NONE'),
      createSolve(9000, 'NONE'),
      createSolve(13000, 'NONE'),
      createSolve(8000, 'NONE'),
      createSolve(14000, 'NONE'),
      createSolve(10500, 'NONE'),
      createSolve(11500, 'NONE'),
      createSolve(9500, 'NONE'),
      createSolve(12500, 'NONE'),
      createSolve(10200, 'NONE'),
    ];
    const result = calculateAo12(solves);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.value).toBe(Number.POSITIVE_INFINITY);
      expect(result.isDNF).toBe(true);
    }
  });
});

describe('calculateBestAo5', () => {
  it('should return null when less than 5 solves', () => {
    const solves = [createSolve(10000, 'NONE'), createSolve(11000, 'NONE')];
    expect(calculateBestAo5(solves)).toBeNull();
  });

  it('should find best ao5 from multiple windows', () => {
    const solves = [
      // Window 1: [10000, 11000, 12000, 9000, 13000]
      createSolve(10000, 'NONE'),
      createSolve(11000, 'NONE'),
      createSolve(12000, 'NONE'),
      createSolve(9000, 'NONE'),
      createSolve(13000, 'NONE'),
      // Window 2: [11000, 12000, 9000, 13000, 8000]
      createSolve(8000, 'NONE'),
      // Window 3: [12000, 9000, 13000, 8000, 7000]
      createSolve(7000, 'NONE'),
    ];
    const result = calculateBestAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // Best window should be the last one
      // Discard 7000 and 13000, avg of [12000, 9000, 8000] = 9666.67
      expect(result.value).toBeCloseTo(9666.67, 1);
      expect(result.isDNF).toBe(false);
    }
  });

  it('should skip DNF averages when finding best', () => {
    const solves = [
      createSolve(10000, 'DNF'),
      createSolve(11000, 'DNF'),
      createSolve(12000, 'NONE'),
      createSolve(9000, 'NONE'),
      createSolve(13000, 'NONE'),
      createSolve(8000, 'NONE'),
      createSolve(7000, 'NONE'),
    ];
    const result = calculateBestAo5(solves);
    expect(result).not.toBeNull();
    if (result) {
      // First window has 2 DNFs, so it's skipped
      // Best should be from a window without DNFs
      expect(result.isDNF).toBe(false);
    }
  });
});

describe('calculateBestAo12', () => {
  it('should return null when less than 12 solves', () => {
    const solves = Array.from({ length: 10 }, (_, i) => createSolve(10000 + i * 1000, 'NONE'));
    expect(calculateBestAo12(solves)).toBeNull();
  });

  it('should find best ao12 from multiple windows', () => {
    const solves = Array.from({ length: 15 }, (_, i) =>
      createSolve(10000 + (i % 5) * 1000, 'NONE'),
    );
    const result = calculateBestAo12(solves);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.isDNF).toBe(false);
    }
  });
});
