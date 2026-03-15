import { AltArrowLeft, AltArrowRight, DoubleAltArrowRight, Restart } from '@solar-icons/react';
import { Button } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn } from '@/shared/lib';
import type { CubePlaybackMode, CubePlaybackSpeed } from '@/shared/lib/cube-platform';

interface CubePlaybackControlsProps {
  mode: CubePlaybackMode;
  speed: CubePlaybackSpeed;
  stepIndex: number;
  stepCount: number;
  reducedMotion?: boolean;
  className?: string;
  canPlay: boolean;
  canPause: boolean;
  canStepForward: boolean;
  canStepBackward: boolean;
  canRestart: boolean;
  canFinish: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNextStep: () => void;
  onPreviousStep: () => void;
  onRestart: () => void;
  onFinish: () => void;
  onSpeedChange: (speed: CubePlaybackSpeed) => void;
}

const speedOrder: CubePlaybackSpeed[] = ['slow', 'normal', 'fast'];

function formatProgress(template: string, current: number, total: number) {
  return template.replace('{current}', String(current)).replace('{total}', String(total));
}

export function CubePlaybackControls({
  mode,
  speed,
  stepIndex,
  stepCount,
  reducedMotion = false,
  className,
  canPlay,
  canPause,
  canStepForward,
  canStepBackward,
  canRestart,
  canFinish,
  onPlay,
  onPause,
  onNextStep,
  onPreviousStep,
  onRestart,
  onFinish,
  onSpeedChange,
}: CubePlaybackControlsProps) {
  const { t } = useTranslation();
  const copy = t.cubeViewer;

  if (mode === 'static' || stepCount === 0) {
    return null;
  }

  return (
    <div className={cn('border-t border-border/65 bg-background/70 px-3 py-3 backdrop-blur-xl', className)}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
              {copy.controls.title}
            </p>
            <p className="mt-1 text-sm text-text-secondary">
              {formatProgress(copy.controls.progress, stepIndex, stepCount)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="min-w-[7rem] justify-center"
              onClick={canPause ? onPause : onPlay}
              disabled={canPause ? false : !canPlay}
            >
              {canPause ? copy.controls.pause : copy.controls.play}
            </Button>
            <Button size="sm" variant="secondary" onClick={onRestart} disabled={!canRestart}>
              <Restart size={16} />
              {copy.controls.restart}
            </Button>
            <Button size="sm" variant="secondary" onClick={onFinish} disabled={!canFinish}>
              <DoubleAltArrowRight size={16} />
              {copy.controls.finish}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onPreviousStep} disabled={!canStepBackward}>
            <AltArrowLeft size={16} />
            {copy.controls.previous}
          </Button>
          <Button size="sm" variant="ghost" onClick={onNextStep} disabled={!canStepForward}>
            {copy.controls.next}
            <AltArrowRight size={16} />
          </Button>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {copy.controls.speed}
            </span>
            {speedOrder.map((speedOption) => (
              <button
                key={speedOption}
                type="button"
                onClick={() => onSpeedChange(speedOption)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                  speed === speedOption
                    ? 'border-primary/60 bg-primary/15 text-primary'
                    : 'border-border/70 text-text-secondary hover:border-primary/40 hover:text-text-primary',
                )}
                aria-pressed={speed === speedOption}
              >
                {copy.controls.speeds[speedOption]}
              </button>
            ))}
          </div>
        </div>

        {reducedMotion ? (
          <p className="text-xs text-text-secondary">{copy.controls.reducedMotion}</p>
        ) : (
          <p className="text-xs text-text-secondary">{copy.controls.modes[mode]}</p>
        )}
      </div>
    </div>
  );
}
