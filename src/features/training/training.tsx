import { AltArrowRight, Dumbbell, Target } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { Card, LearningSurfaceActions, PageHeader, cn, fadeIn, slideUp } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { TrainingDrillList, TrainingDrillPanel } from './components';
import { useTrainingLab } from './hooks/use-training-lab';

type TrainingTrackCopy = {
  label: string;
  description: string;
  focus: string;
  drills: Record<string, { title: string; summary: string }>;
};

function formatTemplate(template: string, values: Record<string, number | string>) {
  return Object.entries(values).reduce((current, [key, value]) => {
    return current.replaceAll(`{${key}}`, String(value));
  }, template);
}

function getTrackCopy(
  trackCopies: Record<string, TrainingTrackCopy>,
  trackId: string,
): TrainingTrackCopy | undefined {
  return trackCopies[trackId];
}

function getDrillTitle(
  trackCopy: TrainingTrackCopy | undefined,
  drillId: string,
  fallbackTitle: string,
) {
  return trackCopy?.drills[drillId]?.title ?? fallbackTitle;
}

export function Training() {
  const { t } = useTranslation();
  const copy = t.trainingLab;

  const {
    tracks,
    progress,
    activeTrack,
    activeTrackId,
    activeTrackIndex,
    activeTrackAttempts,
    activeTrackTarget,
    activeTrackCompletionPercent,
    activeDrill,
    activeDrillIndex,
    activeProgress,
    activeCompletionPercent,
    activeRemainingAttempts,
    totalAttempts,
    totalTarget,
    overallCompletionPercent,
    recommendedNextDrill,
    replaySeed,
    selectTrack,
    selectDrill,
    replayDemo,
    addAttemptBatch,
    setActiveConfidence,
    resetActiveDrill,
  } = useTrainingLab();

  const trackCopies = copy.tracks as Record<string, TrainingTrackCopy>;
  const activeTrackCopy = getTrackCopy(trackCopies, activeTrack?.id ?? '');
  const activeDrillTitle = getDrillTitle(activeTrackCopy, activeDrill?.id ?? '', activeDrill?.id ?? '');
  const trackSummary = formatTemplate(copy.progress.trackSummary, {
    attempts: activeTrackAttempts,
    target: activeTrackTarget,
  });
  const overallSummary = formatTemplate(copy.progress.overallSummary, {
    attempts: totalAttempts,
    target: totalTarget,
  });
  const activeTrackLabel = formatTemplate(copy.overview.trackPosition, {
    current: activeTrackIndex + 1,
    total: tracks.length,
  });

  const nextStep = useMemo(() => {
    if (!recommendedNextDrill) {
      return copy.overview.allComplete;
    }

    if (recommendedNextDrill.isActiveDrill) {
      return formatTemplate(copy.overview.finishCurrent, {
        count: activeRemainingAttempts,
      });
    }

    const nextTrackCopy = getTrackCopy(trackCopies, recommendedNextDrill.trackId);

    if (!nextTrackCopy) {
      return copy.overview.allComplete;
    }

    return formatTemplate(copy.overview.goToDrill, {
      track: nextTrackCopy.label,
      drill: getDrillTitle(nextTrackCopy, recommendedNextDrill.drillId, recommendedNextDrill.drillId),
    });
  }, [
    activeRemainingAttempts,
    copy.overview.allComplete,
    copy.overview.finishCurrent,
    copy.overview.goToDrill,
    recommendedNextDrill,
    trackCopies,
  ]);

  if (!activeTrack || !activeDrill || !activeProgress) {
    return null;
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="app-shell-page app-shell-page-wide space-y-5"
    >
      <PageHeader
        title={copy.title}
        description={copy.subtitle}
        icon={<Dumbbell size={32} />}
        eyebrow={copy.badge}
        actions={<LearningSurfaceActions current="training" />}
      />

      <motion.section variants={slideUp} initial="initial" animate="animate">
        <Card
          variant="surface"
          className="space-y-5 rounded-3xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)]"
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{copy.method.label}</p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-black tracking-tight text-text-primary">{copy.method.value}</h2>
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
                  {activeTrackLabel}
                </span>
              </div>
              <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">{copy.method.description}</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="surface-base rounded-2xl border border-border/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.trackFocus}</p>
                <p className="mt-2 text-sm font-medium text-text-primary">{activeTrackCopy?.focus}</p>
              </div>

              <div className="surface-base rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {copy.overview.overallProgress}
                    </p>
                    <p className="mt-2 text-sm font-medium text-text-primary">{overallSummary}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{overallCompletionPercent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${overallCompletionPercent}%` }}
                  />
                </div>
              </div>

              <div className="surface-base rounded-2xl border border-border/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.overview.nextStep}</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-text-primary">{nextStep}</p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy.labels.trackTabs}>
            {tracks.map((track) => {
              const trackCopy = getTrackCopy(trackCopies, track.id);

              return (
                <button
                  key={track.id}
                  type="button"
                  role="tab"
                  aria-selected={track.id === activeTrackId}
                  onClick={() => selectTrack(track.id)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    track.id === activeTrackId
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/40 hover:text-text-primary',
                  )}
                >
                  {trackCopy?.label ?? track.id}
                </button>
              );
            })}
          </div>
        </Card>
      </motion.section>

      <motion.section
        variants={slideUp}
        initial="initial"
        animate="animate"
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"
      >
        <div className="order-1">
          <TrainingDrillPanel
            trackId={activeTrack.id}
            drill={activeDrill}
            progress={activeProgress}
            completionPercent={activeCompletionPercent}
            replaySeed={replaySeed}
            copy={copy}
            onReplay={replayDemo}
            onAddAttempts={addAttemptBatch}
            onSetConfidence={setActiveConfidence}
            onReset={resetActiveDrill}
          />
        </div>

        <div className="order-2 space-y-5">
          <Card variant="overlay" className="space-y-4 rounded-3xl border border-border/70">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.overview.currentDrill}</p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-text-primary">
                  {activeDrillTitle}
                </h3>
                <p className="mt-1 text-sm text-text-secondary">{activeTrackCopy?.description}</p>
              </div>

              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                <Target size={18} />
              </span>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">
                    {copy.labels.trackProgress}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-primary">{trackSummary}</p>
                </div>
                <span className="text-sm font-semibold text-primary">{activeTrackCompletionPercent}%</span>
              </div>

              <div className="h-2 overflow-hidden rounded-full bg-background/80">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${activeTrackCompletionPercent}%` }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{copy.labels.attempts}</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">{activeProgress.attempts}</p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{copy.labels.target}</p>
                  <p className="mt-1 text-lg font-semibold text-text-primary">{activeProgress.targetAttempts}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-info/20 bg-info/8 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-info" aria-hidden="true">
                  <AltArrowRight size={18} />
                </span>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-info">{copy.overview.nextStep}</p>
                  <p className="mt-1 text-sm leading-relaxed text-text-primary">{nextStep}</p>
                </div>
              </div>
            </div>
          </Card>

          <Card variant="overlay" className="space-y-4 rounded-3xl border border-border/70">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.catalogTitle}</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-text-primary">
                {activeTrackCopy?.label ?? activeTrack.id}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">{activeTrackCopy?.description}</p>
            </div>

            <TrainingDrillList
              track={activeTrack}
              activeDrillIndex={activeDrillIndex}
              progress={progress}
              copy={copy}
              onSelectDrill={selectDrill}
            />
          </Card>
        </div>
      </motion.section>
    </motion.div>
  );
}
