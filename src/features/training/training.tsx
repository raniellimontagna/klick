import { Dumbbell } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Card, PageHeader, cn, fadeIn, slideUp } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { TrainingDrillList, TrainingDrillPanel } from './components';
import { useTrainingLab } from './hooks/use-training-lab';

function formatTemplate(template: string, values: Record<string, number>) {
  return Object.entries(values).reduce((current, [key, value]) => {
    return current.replaceAll(`{${key}}`, String(value));
  }, template);
}

export function Training() {
  const { t } = useTranslation();
  const copy = t.trainingLab;

  const {
    tracks,
    progress,
    activeTrack,
    activeTrackId,
    activeTrackAttempts,
    activeTrackTarget,
    activeDrill,
    activeDrillIndex,
    activeProgress,
    activeCompletionPercent,
    replaySeed,
    selectTrack,
    selectDrill,
    replayDemo,
    addAttemptBatch,
    setActiveConfidence,
    resetActiveDrill,
  } = useTrainingLab();

  if (!activeTrack || !activeDrill || !activeProgress) {
    return null;
  }

  const activeTrackCopy = copy.tracks[activeTrack.id];
  const summary = formatTemplate(copy.progress.trackSummary, {
    attempts: activeTrackAttempts,
    target: activeTrackTarget,
  });

  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="app-shell-page space-y-6 sm:space-y-8"
    >
      <PageHeader
        title={copy.title}
        description={copy.subtitle}
        icon={<Dumbbell size={32} />}
      />

      <motion.section variants={slideUp} initial="initial" animate="animate">
        <Card
          variant="overlay"
          className="rounded-2xl border-white/10 bg-gradient-to-br from-primary/8 via-white/[0.03] to-accent/8 space-y-5"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{copy.method.label}</p>
            <h2 className="text-2xl font-bold text-text-primary">{copy.method.value}</h2>
            <p className="text-sm text-text-secondary">{copy.method.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.trackFocus}</p>
              <p className="mt-1 text-sm text-text-primary">{activeTrackCopy.focus}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.trackProgress}</p>
              <p className="mt-1 text-sm text-text-primary">{summary}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label={copy.labels.trackTabs}>
            {tracks.map((track) => {
              const trackCopy = copy.tracks[track.id];

              return (
                <button
                  key={track.id}
                  type="button"
                  role="tab"
                  aria-selected={track.id === activeTrackId}
                  onClick={() => selectTrack(track.id)}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    track.id === activeTrackId
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'border-border text-text-secondary hover:border-primary/40 hover:text-text-primary',
                  )}
                >
                  {trackCopy.label}
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
        className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]"
      >
        <Card variant="overlay" className="rounded-2xl border-white/10 space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.labels.catalogTitle}</p>
            <h3 className="mt-1 text-lg font-semibold text-text-primary">{activeTrackCopy.label}</h3>
            <p className="mt-1 text-sm text-text-secondary">{activeTrackCopy.description}</p>
          </div>

          <TrainingDrillList
            track={activeTrack}
            activeDrillIndex={activeDrillIndex}
            progress={progress}
            copy={copy}
            onSelectDrill={selectDrill}
          />
        </Card>

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
      </motion.section>
    </motion.div>
  );
}
