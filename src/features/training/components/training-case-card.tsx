import { useEffect, useState } from 'react';
import { Check, Clipboard } from 'lucide-react';
import { Card, Button } from '@/shared/components/ui';
import { cn } from '@/shared/lib';
import { useTranslation } from '@/shared/hooks/use-translation';
import type { TrainingCase } from '@/features/training/types';
import { useTrainingStore, type TrainingStatus } from '@/shared/store/training-store';
import { CubeVisualizer } from '@/shared/components/cube-visualizer';
import { getTrainingVisualization } from '@/features/training/visualizations';

interface TrainingCaseCardProps {
  trainingCase: TrainingCase;
}

const statusOrder: TrainingStatus[] = ['learning', 'refining', 'mastered'];

const resolveTranslation = (object: unknown, path: string): string => {
  return path.split('.').reduce<unknown>((accumulator, segment) => {
    if (accumulator && typeof accumulator === 'object' && segment in accumulator) {
      return (accumulator as Record<string, unknown>)[segment];
    }
    return path;
  }, object) as string;
};

export function TrainingCaseCard({ trainingCase }: TrainingCaseCardProps) {
  const { t } = useTranslation();

  const progress = useTrainingStore((state) => state.progress[trainingCase.id]);
  const incrementRepetitions = useTrainingStore((state) => state.incrementRepetitions);
  const setGoal = useTrainingStore((state) => state.setGoal);
  const setStatus = useTrainingStore((state) => state.setStatus);
  const setNotes = useTrainingStore((state) => state.setNotes);
  const resetCase = useTrainingStore((state) => state.resetCase);

  const currentProgress = progress ?? {
    repetitions: 0,
    goal: 50,
    status: 'learning' as TrainingStatus,
    notes: '',
  };

  const [goalDraft, setGoalDraft] = useState<string>(currentProgress.goal.toString());
  const [notesDraft, setNotesDraft] = useState<string>(currentProgress.notes);
  const [copiedAlg, setCopiedAlg] = useState<string | null>(null);

  useEffect(() => {
    const next = currentProgress.goal.toString();
    setGoalDraft((prev) => (prev === next ? prev : next));
  }, [currentProgress.goal]);

  useEffect(() => {
    setNotesDraft(currentProgress.notes);
  }, [currentProgress.notes]);

  useEffect(() => {
    if (!copiedAlg) return;
    const timeout = window.setTimeout(() => setCopiedAlg(null), 1500);
    return () => window.clearTimeout(timeout);
  }, [copiedAlg]);

  const statuses = statusOrder.map((status) => ({
    value: status,
    label: t.training.statuses[status],
  }));

  const goal = currentProgress.goal;
  const repetitions = currentProgress.repetitions;
  const hasGoal = goal > 0;
  const progressPercent = hasGoal ? Math.min(100, Math.round((repetitions / goal) * 100)) : 0;

  const progressLabel = hasGoal
    ? t.training.progress.target
      .replace('{current}', repetitions.toString())
      .replace('{goal}', goal.toString())
    : t.training.progress.noGoal.replace('{current}', repetitions.toString());

  const showGoalReached = hasGoal && repetitions >= goal;

  const handleCopy = async (algorithm: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(algorithm);
        setCopiedAlg(algorithm);
      }
    } catch {
      // noop
    }
  };

  const handleGoalCommit = () => {
    const parsed = Number(goalDraft);
    if (Number.isFinite(parsed) && parsed > 0) {
      setGoal(trainingCase.id, parsed);
    } else {
      setGoalDraft(currentProgress.goal.toString());
    }
  };

  const handleNotesCommit = () => {
    if (notesDraft !== currentProgress.notes) {
      setNotes(trainingCase.id, notesDraft);
    }
  };

  const title = resolveTranslation(t, trainingCase.titleKey);
  const description = resolveTranslation(t, trainingCase.descriptionKey);
  const tip = trainingCase.tipKey ? resolveTranslation(t, trainingCase.tipKey) : null;
  const visualization = getTrainingVisualization(trainingCase.id);

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
          <p className="text-sm text-text-secondary mt-1">{description}</p>
          {tip && <p className="text-xs text-text-tertiary mt-2">{tip}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xs uppercase tracking-wide text-text-tertiary">
            {t.training.actions.repetitionLabel}
          </p>
          <p className="text-2xl font-bold text-text-primary">{repetitions}</p>
        </div>
      </div>

      {/* Cube Visualization */}
      {visualization && <CubeVisualizer config={visualization} className="my-4" />}

      <div className="space-y-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary uppercase tracking-wide">
              {t.training.actions.algorithmLabel}
            </span>
          </div>
          <div className="space-y-2">
            {trainingCase.algorithms.map((algorithm, index) => {
              const isCopied = copiedAlg === algorithm;
              return (
                <div
                  key={`${trainingCase.id}-alg-${index}`}
                  className="flex flex-col gap-3 rounded-lg border border-border/70 bg-surface-secondary/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <code className="font-mono text-sm text-text-primary wrap-break-word">
                    {algorithm}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => handleCopy(algorithm)}
                  >
                    {isCopied ? (
                      <span className="inline-flex items-center gap-2">
                        <Check className="w-4 h-4" />
                        {t.training.actions.copiedAlgorithm}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Clipboard className="w-4 h-4" />
                        {t.training.actions.copyAlgorithm}
                      </span>
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-sm font-medium text-text-primary">{progressLabel}</p>
            {showGoalReached && (
              <span className="text-xs font-medium text-primary uppercase tracking-wide">
                {t.training.progress.goalReached}
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase text-text-tertiary tracking-wide">
            {t.training.actions.repetitionLabel}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => incrementRepetitions(trainingCase.id, 1)}
            >
              {t.training.actions.add1}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => incrementRepetitions(trainingCase.id, 5)}
            >
              {t.training.actions.add5}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => incrementRepetitions(trainingCase.id, 10)}
            >
              {t.training.actions.add10}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => resetCase(trainingCase.id)}
            >
              {t.training.actions.reset}
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase text-text-tertiary tracking-wide">
              {t.training.actions.goalLabel}
            </p>
            <input
              type="number"
              min={1}
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
              onBlur={handleGoalCommit}
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              placeholder={t.training.actions.goalPlaceholder}
            />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-text-tertiary tracking-wide">
              {t.training.actions.statusLabel}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {statuses.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setStatus(trainingCase.id, option.value)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                    currentProgress.status === option.value
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-text-secondary hover:text-text-primary hover:border-primary/40',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase text-text-tertiary tracking-wide">
          {t.training.actions.noteLabel}
        </p>
        <textarea
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={handleNotesCommit}
          rows={3}
          placeholder={t.training.actions.notePlaceholder}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 resize-none"
        />
      </div>
    </Card>
  );
}
