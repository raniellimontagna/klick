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

  it('keeps guided playback paused until the user advances a step', () => {
    const { result } = renderHook(() =>
      useCubePlatformController({
        algorithm: "R U R'",
        mode: 'step-by-step',
      }),
    );

    expect(result.current.playbackMode).toBe('step-by-step');
    expect(result.current.isPlaybackRunning).toBe(false);
    expect(result.current.playbackStepIndex).toBe(0);
    expect(result.current.canStepForward).toBe(true);

    act(() => {
      result.current.nextStep();
    });

    expect(result.current.moveQueue).toHaveLength(1);
    expect(result.current.moveQueue[0]?.notation).toBe('R');

    act(() => {
      result.current.completeMove();
    });

    expect(result.current.playbackStepIndex).toBe(1);

    act(() => {
      result.current.previousStep();
    });

    expect(result.current.moveQueue[0]?.notation).toBe("R'");

    act(() => {
      result.current.completeMove();
    });

    expect(result.current.playbackStepIndex).toBe(0);
  });

  it('applies static mode instantly without queueing playback', () => {
    const { result } = renderHook(() =>
      useCubePlatformController({
        algorithm: 'R U',
        mode: 'static',
      }),
    );

    expect(result.current.playbackMode).toBe('static');
    expect(result.current.moveQueue).toHaveLength(0);
    expect(result.current.playbackStepIndex).toBe(2);
    expect(result.current.playbackStepCount).toBe(2);
  });

  it('downgrades autoplay to guided playback when reduced motion is enabled', () => {
    const { result } = renderHook(() =>
      useCubePlatformController({
        algorithm: 'R U',
        mode: 'autoplay',
        reducedMotion: true,
      }),
    );

    expect(result.current.playbackMode).toBe('step-by-step');
    expect(result.current.isPlaybackRunning).toBe(false);
  });

  it('keeps double turns distinct from quarter turns', () => {
    const singleTurn = renderHook(() =>
      useCubePlatformController({
        algorithm: 'R',
        mode: 'static',
      }),
    );
    const doubleTurn = renderHook(() =>
      useCubePlatformController({
        algorithm: 'R2',
        mode: 'static',
      }),
    );

    expect(singleTurn.result.current.cubies).not.toEqual(doubleTurn.result.current.cubies);
  });
});
