import { cn } from '@/shared';
import type { TrainingDrillDefinition, TrainingTrackWithDrills } from '../lib/training-lab-types';

interface TrainingDrillListProps {
  track: TrainingTrackWithDrills;
  activeDrillIndex: number;
  progress: Record<string, { attempts: number; targetAttempts: number }>;
  copy: {
    labels: {
      drill: string;
      attempts: string;
      target: string;
    };
    tracks: Record<
      string,
      {
        drills: Record<string, { title: string; summary: string }>;
      }
    >;
  };
  onSelectDrill: (index: number) => void;
}

function getDrillCopy(
  copy: TrainingDrillListProps['copy'],
  trackId: string,
  drill: TrainingDrillDefinition,
  index: number,
) {
  const trackCopy = copy.tracks[trackId];
  const drillCopy = trackCopy?.drills?.[drill.id];

  return {
    title: drillCopy?.title ?? `${copy.labels.drill} ${index + 1}`,
    summary: drillCopy?.summary ?? '',
  };
}

export function TrainingDrillList({
  track,
  activeDrillIndex,
  progress,
  copy,
  onSelectDrill,
}: TrainingDrillListProps) {
  return (
    <div className="space-y-2" role="listbox" aria-label={copy.labels.drill}>
      {track.drills.map((drill, index) => {
        const drillProgress = progress[drill.id];
        const attempts = drillProgress?.attempts ?? 0;
        const targetAttempts = drillProgress?.targetAttempts ?? drill.targetAttempts;
        const completionPercent = Math.min(100, Math.round((attempts / targetAttempts) * 100));
        const drillCopy = getDrillCopy(copy, track.id, drill, index);

        return (
          <button
            key={drill.id}
            type="button"
            role="option"
            aria-selected={index === activeDrillIndex}
            onClick={() => onSelectDrill(index)}
            className={cn(
              'w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
              index === activeDrillIndex
                ? 'border-primary/60 bg-primary/15'
                : 'surface-interactive hover:border-primary/40',
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                  {copy.labels.drill} {index + 1}
                </p>
                <p className="mt-1 text-sm font-semibold text-text-primary">{drillCopy.title}</p>
              </div>
              <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                {completionPercent}%
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-text-secondary">{drillCopy.summary}</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/80">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-text-muted">
              <span>
                {copy.labels.attempts}: {attempts}
              </span>
              <span>
                {copy.labels.target}: {targetAttempts}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
