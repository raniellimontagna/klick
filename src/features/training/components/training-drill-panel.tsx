import { Button, Card, CubePlatform, cn } from '@/shared';
import type { TrainingDrillDefinition, TrainingDrillProgress } from '../lib/training-lab-types';

interface TrainingDrillPanelProps {
  trackId: string;
  drill: TrainingDrillDefinition;
  progress: TrainingDrillProgress;
  completionPercent: number;
  replaySeed: number;
  copy: {
    labels: {
      setup: string;
      algorithm: string;
      recognition: string;
      coaching: string;
      confidence: string;
      attempts: string;
      target: string;
      focus: string;
      difficulty: string;
      cubeHint: string;
    };
    actions: {
      replay: string;
      add1: string;
      add5: string;
      add10: string;
      reset: string;
    };
    confidence: Record<string, string>;
    difficulty: Record<string, string>;
    focusTags: Record<string, string>;
    tracks: Record<
      string,
      {
        drills: Record<string, { title: string; recognition: string; coaching: string }>;
      }
    >;
  };
  onReplay: () => void;
  onAddAttempts: (amount: number) => void;
  onSetConfidence: (confidence: TrainingDrillProgress['confidence']) => void;
  onReset: () => void;
}

function resolveDrillCopy(
  copy: TrainingDrillPanelProps['copy'],
  trackId: string,
  drillId: string,
  fallbackTitle: string,
) {
  const drillCopy = copy.tracks[trackId]?.drills?.[drillId];

  return {
    title: drillCopy?.title ?? fallbackTitle,
    recognition: drillCopy?.recognition ?? '',
    coaching: drillCopy?.coaching ?? '',
  };
}

const confidenceOrder: Array<TrainingDrillProgress['confidence']> = ['starting', 'building', 'ready'];

export function TrainingDrillPanel({
  trackId,
  drill,
  progress,
  completionPercent,
  replaySeed,
  copy,
  onReplay,
  onAddAttempts,
  onSetConfidence,
  onReset,
}: TrainingDrillPanelProps) {
  const drillCopy = resolveDrillCopy(copy, trackId, drill.id, drill.id);

  return (
    <Card variant="overlay" className="rounded-2xl border-white/10 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.focus}</p>
          <h3 className="mt-1 text-2xl font-bold text-text-primary">{drillCopy.title}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-info/35 bg-info/10 px-2.5 py-1 text-info">
              {copy.focusTags[drill.focusTag]}
            </span>
            <span className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-warning">
              {copy.difficulty[drill.difficulty]}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.attempts}</p>
          <p className="text-2xl font-semibold text-text-primary">{progress.attempts}</p>
        </div>
      </div>

      <div className="h-72 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
        <CubePlatform
          key={`${drill.id}-${replaySeed}`}
          algorithm={drill.demoAlgorithm}
          interactive={false}
          className="h-full w-full"
        />
      </div>
      <p className="text-xs text-text-secondary">{copy.labels.cubeHint}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{copy.labels.recognition}</p>
          <p className="text-sm text-text-primary">{drillCopy.recognition}</p>
        </div>
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{copy.labels.coaching}</p>
          <p className="text-sm text-text-primary">{drillCopy.coaching}</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{copy.labels.setup}</p>
          <code className="block text-sm text-text-primary">{drill.setupAlgorithm}</code>
        </div>
        <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{copy.labels.algorithm}</p>
          <code className="block text-sm font-semibold text-primary">{drill.solveAlgorithm}</code>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-text-primary">
            {copy.labels.target}: {progress.targetAttempts}
          </p>
          <p className="text-xs uppercase tracking-[0.14em] text-text-muted">{completionPercent}%</p>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/30">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${completionPercent}%` }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-text-muted">{copy.labels.confidence}</p>
        <div className="flex flex-wrap gap-2">
          {confidenceOrder.map((confidence) => (
            <button
              key={confidence}
              type="button"
              onClick={() => onSetConfidence(confidence)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                progress.confidence === confidence
                  ? 'border-primary bg-primary/20 text-primary'
                  : 'border-border text-text-secondary hover:border-primary/40 hover:text-text-primary',
              )}
            >
              {copy.confidence[confidence]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="secondary"
          className="rounded-xl border border-white/10 bg-black/20 text-text-primary hover:bg-white/5"
          onClick={onReplay}
        >
          {copy.actions.replay}
        </Button>
        <Button variant="secondary" className="rounded-xl" onClick={() => onAddAttempts(1)}>
          {copy.actions.add1}
        </Button>
        <Button variant="secondary" className="rounded-xl" onClick={() => onAddAttempts(5)}>
          {copy.actions.add5}
        </Button>
        <Button variant="secondary" className="rounded-xl" onClick={() => onAddAttempts(10)}>
          {copy.actions.add10}
        </Button>
        <Button variant="ghost" className="rounded-xl" onClick={onReset}>
          {copy.actions.reset}
        </Button>
      </div>
    </Card>
  );
}
