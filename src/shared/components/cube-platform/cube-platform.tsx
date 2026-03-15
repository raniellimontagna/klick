import { useEffect } from 'react';
import { useCubePlatformController } from '@/shared/hooks/use-cube-platform-controller';
import { useCubePlatformKeyboard } from '@/shared/hooks/use-cube-platform-keyboard';
import { usePrefersReducedMotion } from '@/shared/hooks/use-prefers-reduced-motion';
import { cn } from '@/shared/lib';
import type {
  CubeCameraPresetId,
  CubePlaybackMode,
  CubePlaybackSpeed,
  CubePuzzleType,
} from '@/shared/lib/cube-platform/types';
import { useCubePlatformThemeStore } from '@/shared/store/cube-platform-theme-store';
import { CubePlaybackControls } from './cube-playback-controls';
import { CubePlatformScene } from './cube-scene';

interface CubePlatformProps {
  cubeType?: CubePuzzleType;
  initialAlgorithm?: string;
  algorithm?: string;
  mode?: CubePlaybackMode;
  interactive?: boolean;
  keyboardEnabled?: boolean;
  defaultSpeed?: CubePlaybackSpeed;
  cameraPreset?: CubeCameraPresetId;
  showPlaybackControls?: boolean;
  telemetryContext?: string;
  themeId?: string;
  className?: string;
  realignCounter?: number;
  onMoveQueued?: (move: string) => void;
  onAlgorithmComplete?: () => void;
}

export function CubePlatform({
  cubeType = '3x3',
  initialAlgorithm,
  algorithm,
  mode = 'autoplay',
  interactive = true,
  keyboardEnabled = false,
  defaultSpeed = 'normal',
  cameraPreset = 'explorer',
  showPlaybackControls = mode !== 'static',
  telemetryContext,
  themeId,
  className,
  realignCounter,
  onMoveQueued,
  onAlgorithmComplete,
}: CubePlatformProps) {
  const setTheme = useCubePlatformThemeStore((state) => state.setTheme);
  const prefersReducedMotion = usePrefersReducedMotion();

  const controller = useCubePlatformController({
    cubeType,
    initialAlgorithm,
    algorithm,
    mode,
    speed: defaultSpeed,
    reducedMotion: prefersReducedMotion,
    onMoveQueued,
    onAlgorithmComplete,
    telemetryContext,
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
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)}>
      <div className="min-h-0 flex-1">
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
          cameraPreset={cameraPreset}
          animationDuration={controller.animationDuration}
        />
      </div>

      {showPlaybackControls ? (
        <CubePlaybackControls
          mode={controller.playbackMode}
          speed={controller.playbackSpeed}
          stepIndex={controller.playbackStepIndex}
          stepCount={controller.playbackStepCount}
          reducedMotion={prefersReducedMotion}
          canPlay={controller.canPlay}
          canPause={controller.canPause}
          canStepForward={controller.canStepForward}
          canStepBackward={controller.canStepBackward}
          canRestart={controller.canRestart}
          canFinish={controller.canFinish}
          onPlay={controller.play}
          onPause={controller.pause}
          onNextStep={controller.nextStep}
          onPreviousStep={controller.previousStep}
          onRestart={controller.restartPlayback}
          onFinish={controller.finishPlayback}
          onSpeedChange={controller.updatePlaybackSpeed}
        />
      ) : null}
    </div>
  );
}
