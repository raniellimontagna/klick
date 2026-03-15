import { Maximize } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import {
  Button,
  Card,
  CubePlaybackControls,
  CubePlatformScene,
  LearningSurfaceActions,
  PageHeader,
  cn,
  fadeIn,
  slideUp,
} from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { CubeActionBar } from './components/cube-action-bar';
import { MoveHistory } from './components/move-history';
import { MoveIndicator } from './components/move-indicator';
import { useCubeWorkspace } from './hooks/use-cube-workspace';

function formatTemplate(template: string, values: Record<string, number | string>) {
  return Object.entries(values).reduce((current, [key, value]) => {
    return current.replaceAll(`{${key}}`, String(value));
  }, template);
}

function getStatusClasses(status: 'scrambling' | 'playing' | 'animating' | 'complete' | 'ready') {
  switch (status) {
    case 'scrambling':
      return 'border-warning/35 bg-warning/10 text-warning';
    case 'playing':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'animating':
      return 'border-info/30 bg-info/10 text-info';
    case 'complete':
      return 'border-success/30 bg-success/10 text-success';
    default:
      return 'border-border/70 bg-background/70 text-text-secondary';
  }
}

export function Cube3D() {
  const { t } = useTranslation();
  const copy = t.cubeViewer;
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const {
    scramble,
    cubeType,
    cubies,
    moveQueue,
    history,
    cubeGeneration,
    realignCounter,
    animationDuration,
    lastMove,
    status,
    soundEnabled,
    prefersReducedMotion,
    isAnimating,
    historyCount,
    playbackStepCount,
    playbackStepIndex,
    playbackCompletionPercent,
    handleGenerateScramble,
    handleCompleteMove,
    handleRealign,
    toggleSound,
    reset,
    undo,
    skipAlgorithm,
    startMove,
    applyMove,
    playbackMode,
    playbackSpeed,
    canPlay,
    canPause,
    canStepForward,
    canStepBackward,
    canRestart,
    canFinish,
    play,
    pause,
    nextStep,
    previousStep,
    restartPlayback,
    finishPlayback,
    updatePlaybackSpeed,
  } = useCubeWorkspace();

  const progressLabel = useMemo(() => {
    if (playbackStepCount <= 0) {
      return copy.overview.progressEmpty;
    }

    return formatTemplate(copy.overview.progressValue, {
      current: playbackStepIndex,
      total: playbackStepCount,
    });
  }, [copy.overview.progressEmpty, copy.overview.progressValue, playbackStepCount, playbackStepIndex]);

  const nextAction = useMemo(() => {
    const nextActionCopy = copy.overview.nextActionStates;

    switch (status) {
      case 'scrambling':
        return nextActionCopy.scrambling;
      case 'playing':
        return nextActionCopy.playing;
      case 'animating':
        return nextActionCopy.animating;
      case 'complete':
        return nextActionCopy.complete;
      default:
        return nextActionCopy.ready;
    }
  }, [copy.overview.nextActionStates, status]);

  const historyToggleLabel = isHistoryVisible
    ? copy.workspace.historyToggleHide
    : copy.workspace.historyToggleShow;

  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="app-shell-page app-shell-page-wide space-y-5"
    >
      <PageHeader
        title={t.navigation.cube3d}
        description={t.pages.cube3d.description}
        icon={<Maximize size={32} />}
        eyebrow={copy.badge}
        actions={<LearningSurfaceActions current="cube3d" />}
      />

      <motion.section variants={slideUp} initial="initial" animate="animate">
        <Card
          variant="surface"
          className="space-y-5 rounded-3xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)]"
        >
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{copy.overview.title}</p>
                <h2 className="text-2xl font-black tracking-tight text-text-primary">{copy.workspace.title}</h2>
                <p className="max-w-2xl text-sm leading-relaxed text-text-secondary">
                  {copy.workspace.description}
                </p>
              </div>

              <div className="surface-base rounded-[1.5rem] border border-border/70 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.overview.scramble}</p>
                <p className="mt-3 font-mono text-sm leading-relaxed break-words text-text-primary sm:text-base">
                  {scramble || copy.overview.emptyScramble}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="surface-base rounded-2xl border border-border/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.overview.status}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span
                    className={cn(
                      'rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]',
                      getStatusClasses(status),
                    )}
                  >
                    {copy.status[status]}
                  </span>
                  <span className="text-xs text-text-secondary">{cubeType.toUpperCase()}</span>
                </div>
              </div>

              <div className="surface-base rounded-2xl border border-border/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                      {copy.overview.progress}
                    </p>
                    <p className="mt-2 text-sm font-medium text-text-primary">{progressLabel}</p>
                  </div>
                  <span className="text-sm font-semibold text-primary">{playbackCompletionPercent}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-background/80">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${playbackCompletionPercent}%` }}
                  />
                </div>
              </div>

              <div className="surface-base rounded-2xl border border-border/70 p-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.overview.nextAction}</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-text-primary">{nextAction}</p>
                <p className="mt-2 text-xs text-text-secondary">
                  {prefersReducedMotion
                    ? copy.overview.reducedMotion
                    : soundEnabled
                      ? copy.overview.soundOn
                      : copy.overview.soundOff}
                </p>
              </div>
            </div>
          </div>
        </Card>
      </motion.section>

      <motion.section
        variants={slideUp}
        initial="initial"
        animate="animate"
        className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,360px)]"
      >
        <Card variant="overlay" className="order-1 space-y-5 rounded-3xl border border-border/70">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.workspace.title}</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-text-primary">{copy.status[status]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{copy.workspace.description}</p>
            </div>

            <MoveIndicator lastMove={lastMove} />
          </div>

          <div className="relative min-h-[26rem] overflow-hidden rounded-[1.75rem] border border-border/70 bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--color-primary)_14%,transparent),transparent_36%),linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_86%,black_14%),color-mix(in_srgb,var(--color-background-elevated)_88%,black_12%))] sm:min-h-[32rem]">
            <div className="absolute inset-0 opacity-80">
              <CubePlatformScene
                cubies={cubies}
                moveQueue={moveQueue}
                completeMove={handleCompleteMove}
                startMove={startMove}
                applyMove={applyMove}
                cubeType={cubeType}
                cubeGeneration={cubeGeneration}
                realignCounter={realignCounter}
                cameraPreset="explorer"
                animationDuration={animationDuration}
              />
            </div>

            {status === 'scrambling' ? (
              <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-warning/30 bg-background/86 px-4 py-3 backdrop-blur-sm">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-warning">{copy.workspace.scrambling}</p>
                  <p className="mt-1 text-sm text-text-secondary">{progressLabel}</p>
                </div>

                <Button variant="secondary" size="sm" onClick={skipAlgorithm}>
                  {copy.workspace.skip}
                </Button>
              </div>
            ) : null}
          </div>

          {playbackStepCount > 0 ? (
            <CubePlaybackControls
              mode={playbackMode}
              speed={playbackSpeed}
              stepIndex={playbackStepIndex}
              stepCount={playbackStepCount}
              reducedMotion={prefersReducedMotion}
              className="rounded-[1.5rem] border border-border/70 bg-background/60"
              canPlay={canPlay}
              canPause={canPause}
              canStepForward={canStepForward}
              canStepBackward={canStepBackward}
              canRestart={canRestart}
              canFinish={canFinish}
              onPlay={play}
              onPause={pause}
              onNextStep={nextStep}
              onPreviousStep={previousStep}
              onRestart={restartPlayback}
              onFinish={finishPlayback}
              onSpeedChange={updatePlaybackSpeed}
            />
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-text-secondary">{copy.workspace.historyToggleHint}</p>
            {historyCount > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIsHistoryVisible((current) => !current)}
              >
                {historyToggleLabel}
              </Button>
            ) : null}
          </div>

          {isHistoryVisible ? <MoveHistory history={history} onUndo={undo} disabled={isAnimating} /> : null}
        </Card>

        <div className="order-2 space-y-5">
          <Card variant="overlay" className="space-y-4 rounded-3xl border border-border/70">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.overview.title}</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-text-primary">
                {copy.overview.controlTitle}
              </h3>
              <p className="mt-1 text-sm text-text-secondary">{copy.overview.controlDescription}</p>
            </div>

            <div className="grid gap-3">
              <div className="surface-base rounded-[1.5rem] border border-border/70 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{copy.overview.sound}</p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  {soundEnabled ? copy.overview.soundOn : copy.overview.soundOff}
                </p>
              </div>

              <div className="surface-base rounded-[1.5rem] border border-border/70 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{copy.history.title}</p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  {formatTemplate(copy.history.count, { count: historyCount })}
                </p>
              </div>

              <div className="surface-base rounded-[1.5rem] border border-border/70 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.16em] text-text-muted">{copy.overview.motion}</p>
                <p className="mt-2 text-sm font-medium text-text-primary">
                  {prefersReducedMotion ? copy.overview.reducedMotion : copy.controls.modes.autoplay}
                </p>
              </div>
            </div>
          </Card>

          <Card variant="overlay" className="rounded-3xl border border-border/70">
            <CubeActionBar
              onGenerateScramble={handleGenerateScramble}
              onUndo={undo}
              onReset={reset}
              onRealign={handleRealign}
              onToggleSound={toggleSound}
              soundEnabled={soundEnabled}
              isAnimating={isAnimating}
              historyLength={historyCount}
            />
          </Card>
        </div>
      </motion.section>
    </motion.div>
  );
}
