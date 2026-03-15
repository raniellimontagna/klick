import { useEffect } from 'react';
import {
  useCubePlatformController,
  type CubePlatformHistoryItem,
  type CubePlatformQueuedMove,
} from '@/shared/hooks/use-cube-platform-controller';
import { useCubePlatformKeyboard } from '@/shared/hooks/use-cube-platform-keyboard';
import type { CubePuzzleType } from '@/shared/lib/cube-platform/types';
import { useCubePlatformThemeStore } from '@/shared/store/cube-platform-theme-store';
import { CubePlatformScene } from './cube-scene';

export interface CubePlatformProps {
  cubeType?: CubePuzzleType;
  algorithm?: string;
  interactive?: boolean;
  keyboardEnabled?: boolean;
  themeId?: string;
  className?: string;
  realignCounter?: number;
  onMoveQueued?: (move: string) => void;
  onAlgorithmComplete?: () => void;
}

export interface CubePlatformStateSnapshot {
  history: CubePlatformHistoryItem[];
  moveQueue: CubePlatformQueuedMove[];
  isApplyingAlgorithm: boolean;
  isAnimating: boolean;
}

export function CubePlatform({
  cubeType = '3x3',
  algorithm,
  interactive = true,
  keyboardEnabled = false,
  themeId,
  className,
  realignCounter,
  onMoveQueued,
  onAlgorithmComplete,
}: CubePlatformProps) {
  const setTheme = useCubePlatformThemeStore((state) => state.setTheme);

  const controller = useCubePlatformController({
    cubeType,
    algorithm,
    autoApplyAlgorithm: true,
    onMoveQueued,
    onAlgorithmComplete,
  });

  useCubePlatformKeyboard({
    applyMove: controller.applyMove,
    enabled: interactive && keyboardEnabled,
  });

  useEffect(() => {
    if (themeId) {
      setTheme(themeId);
    }
  }, [setTheme, themeId]);

  return (
    <div className={className}>
      <CubePlatformScene
        cubies={controller.cubies}
        moveQueue={controller.moveQueue}
        completeMove={controller.completeMove}
        startMove={controller.startMove}
        applyMove={controller.applyMove}
        cubeType={controller.cubeType}
        cubeGeneration={controller.cubeGeneration}
        realignCounter={realignCounter}
        interactive={interactive}
      />
    </div>
  );
}
