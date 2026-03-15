import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useCubePlatformController } from './use-cube-platform-controller';

describe('useCubePlatformController', () => {
  it.each([
    ['2x2', 8],
    ['3x3', 27],
    ['4x4', 64],
  ] as const)('initializes solved state for %s', (cubeType, expectedCubies) => {
    const { result } = renderHook(() => useCubePlatformController({ cubeType }));

    expect(result.current.cubeType).toBe(cubeType);
    expect(result.current.cubies).toHaveLength(expectedCubies);
  });

  it('queues puzzle-specific layers when applying a move', () => {
    const { result } = renderHook(() => useCubePlatformController({ cubeType: '4x4' }));

    act(() => {
      result.current.applyMove('R');
    });

    expect(result.current.moveQueue).toHaveLength(1);
    expect(result.current.moveQueue[0]?.layers).toEqual([1.5]);
  });

  it('ignores unsupported middle-layer moves on 2x2', () => {
    const { result } = renderHook(() => useCubePlatformController({ cubeType: '2x2' }));

    act(() => {
      result.current.applyMove('M');
    });

    expect(result.current.moveQueue).toHaveLength(0);
  });

  it('parses algorithms using the active puzzle move map', () => {
    const { result } = renderHook(() => useCubePlatformController({ cubeType: '2x2' }));

    act(() => {
      result.current.applyAlgorithm('R M U');
    });

    expect(result.current.moveQueue).toHaveLength(2);
    expect(result.current.moveQueue.every((move) => move.isAlgorithm)).toBe(true);
  });
});
