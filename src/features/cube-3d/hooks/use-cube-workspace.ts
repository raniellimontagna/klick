import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCubePlatformKeyboard } from '@/shared/hooks/use-cube-platform-keyboard';
import { useCubePlatformController } from '@/shared/hooks/use-cube-platform-controller';
import { usePrefersReducedMotion } from '@/shared/hooks/use-prefers-reduced-motion';
import { MOVES } from '@/shared/lib/cube-platform/moves';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { useCubeSound } from './use-cube-sound';

type CubeWorkspaceStatus = 'scrambling' | 'playing' | 'animating' | 'complete' | 'ready';

export function useCubeWorkspace() {
  const { scramble, generateNewScramble } = useScrambleStore();
  const prefersReducedMotion = usePrefersReducedMotion();
  const controller = useCubePlatformController({
    algorithm: scramble,
    mode: 'autoplay',
    reducedMotion: prefersReducedMotion,
    telemetryContext: 'cube-3d',
  });
  const [realignCounter, setRealignCounter] = useState(0);
  const { playClick, toggleSound, enabled: soundEnabled } = useCubeSound();
  const [lastMove, setLastMove] = useState<string | null>(null);

  const handleRealign = useCallback(() => {
    setRealignCounter((previous) => previous + 1);
  }, []);

  const handleGenerateScramble = useCallback(() => {
    generateNewScramble();
  }, [generateNewScramble]);

  useCubePlatformKeyboard({ applyMove: controller.applyMove });

  useEffect(() => {
    if (!scramble) {
      generateNewScramble();
    }
  }, [generateNewScramble, scramble]);

  useEffect(() => {
    if (controller.moveQueue.length <= 0) {
      return;
    }

    const currentMove = controller.moveQueue[0];
    const moveNotation = Object.entries(MOVES).find(
      ([, definition]) =>
        definition.axis === currentMove.axis &&
        definition.direction === currentMove.direction &&
        (definition.turns ?? 1) === (currentMove.turns ?? 1) &&
        JSON.stringify(definition.layers) === JSON.stringify(currentMove.layers),
    );

    if (!moveNotation) {
      return;
    }

    setLastMove(moveNotation[0]);
    const timer = window.setTimeout(() => setLastMove(null), 1800);

    return () => window.clearTimeout(timer);
  }, [controller.moveQueue]);

  const isAnimating = controller.moveQueue.length > 0;
  const status = useMemo<CubeWorkspaceStatus>(() => {
    if (controller.isPlaybackRunning && controller.isApplyingAlgorithm) {
      return 'scrambling';
    }

    if (controller.isPlaybackRunning) {
      return 'playing';
    }

    if (isAnimating) {
      return 'animating';
    }

    if (controller.playbackStepCount > 0 && controller.playbackStepIndex >= controller.playbackStepCount) {
      return 'complete';
    }

    return 'ready';
  }, [
    controller.isApplyingAlgorithm,
    controller.isPlaybackRunning,
    controller.playbackStepCount,
    controller.playbackStepIndex,
    isAnimating,
  ]);

  const handleCompleteMove = useCallback(() => {
    controller.completeMove();
    playClick();
  }, [controller.completeMove, playClick]);

  const playbackCompletionPercent = useMemo(() => {
    if (controller.playbackStepCount <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((controller.playbackStepIndex / controller.playbackStepCount) * 100));
  }, [controller.playbackStepCount, controller.playbackStepIndex]);

  return {
    ...controller,
    scramble,
    prefersReducedMotion,
    realignCounter,
    handleRealign,
    handleGenerateScramble,
    handleCompleteMove,
    isAnimating,
    lastMove,
    soundEnabled,
    toggleSound,
    status,
    playbackCompletionPercent,
    historyCount: controller.history.length,
    queuedMoveCount: controller.moveQueue.length,
  };
}
