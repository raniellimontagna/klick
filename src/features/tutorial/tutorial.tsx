import {
  AltArrowRight,
  BookMinimalistic,
  MagicStick3,
  Target,
  UndoLeftRound,
} from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Button, Card, CubePlatform, LearningSurfaceActions, PageHeader } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn, fadeIn, slideUp } from '@/shared/lib';
import { useTutorialGuide } from './hooks/use-tutorial-guide';

function formatTemplate(template: string, values: Record<string, number | string>) {
  return Object.entries(values).reduce((current, [key, value]) => {
    return current.replaceAll(`{${key}}`, String(value));
  }, template);
}

export function Tutorial() {
  const { t } = useTranslation();
  const guide = t.tutorialGuide;

  const {
    methodId,
    methodIds,
    stages,
    stageIndex,
    lessonIndex,
    activeStage,
    activeLesson,
    totalStages,
    totalLessons,
    totalMethodLessons,
    completedMethodLessons,
    overallProgressPercent,
    stageCompletionPercent,
    hasNextLesson,
    nextLesson,
    replaySeed,
    selectMethod,
    selectStage,
    selectLesson,
    replayLesson,
    goToNextLesson,
  } = useTutorialGuide();

  const methodCopy = guide.methods[methodId];
  const stageCopy = methodCopy.stages[activeStage.id];
  const lessonCopy = stageCopy.lessons[lessonIndex] ?? stageCopy.lessons[0];
  const nextStageCopy = nextLesson ? methodCopy.stages[nextLesson.stage.id] : null;
  const nextLessonCopy =
    nextLesson && nextStageCopy ? nextStageCopy.lessons[nextLesson.lessonIndex] : null;

  if (!lessonCopy) {
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
        title={guide.title}
        description={guide.subtitle}
        icon={<BookMinimalistic size={32} />}
        eyebrow={guide.badge}
        actions={<LearningSurfaceActions current="tutorial" />}
      />

      <motion.section variants={slideUp} initial="initial" animate="animate">
        <Card
          variant="surface"
          className="space-y-5 rounded-3xl border border-border/70 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-primary)_8%,transparent),transparent)]"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.method.title}</p>
            <h2 className="text-2xl font-bold text-text-primary">{methodCopy.label}</h2>
            <p className="text-sm text-text-secondary">{methodCopy.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="surface-base rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.method.focus}</p>
              <p className="mt-2 text-sm text-text-primary">{methodCopy.focus}</p>
            </div>
            <div className="surface-base rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                {guide.method.estimatedTime}
              </p>
              <p className="mt-2 text-sm text-text-primary">{methodCopy.estimatedTime}</p>
            </div>
            <div className="surface-base rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.journey.title}</p>
              <p className="mt-2 text-sm text-text-primary">
                {formatTemplate(guide.progress.overall, {
                  current: completedMethodLessons,
                  total: totalMethodLessons,
                })}
              </p>
              <p className="mt-2 text-xs text-text-secondary">
                {formatTemplate(guide.progress.completion, { percent: overallProgressPercent })}
              </p>
            </div>
            <div className="surface-base rounded-2xl p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.journey.nextStep}</p>
              <p className="mt-2 text-sm font-semibold text-text-primary">
                {nextLessonCopy?.title ?? guide.journey.finished}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                {nextStageCopy?.label ?? guide.lesson.finished}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" role="tablist" aria-label={guide.method.ariaLabel}>
            {methodIds.map((candidateMethodId) => {
              const candidateMethod = guide.methods[candidateMethodId];
              return (
                <button
                  key={candidateMethodId}
                  type="button"
                  role="tab"
                  aria-selected={candidateMethodId === methodId}
                  onClick={() => selectMethod(candidateMethodId)}
                  className={cn(
                    'rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    candidateMethodId === methodId
                      ? 'border-primary bg-primary/20 text-primary'
                      : 'surface-interactive text-text-secondary hover:text-text-primary',
                  )}
                >
                  {candidateMethod.label}
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
        <div className="order-1 lg:order-2">
          <Card variant="overlay" className="space-y-5 rounded-[1.75rem] border-white/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                  {formatTemplate(guide.progress.lesson, { current: lessonIndex + 1, total: totalLessons })}
                </p>
                <h3 className="mt-1 text-2xl font-bold text-text-primary">{lessonCopy.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">{lessonCopy.summary}</p>
              </div>
              <span className="surface-base inline-flex h-12 w-12 items-center justify-center rounded-2xl text-primary">
                <MagicStick3 size={18} />
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="surface-base rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                  {formatTemplate(guide.progress.stage, { current: stageIndex + 1, total: totalStages })}
                </p>
                <p className="mt-2 text-sm font-semibold text-text-primary">{stageCopy.label}</p>
              </div>
              <div className="surface-base rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.journey.title}</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">{stageCompletionPercent}%</p>
                <p className="mt-2 text-xs text-text-secondary">
                  {formatTemplate(guide.progress.completion, { percent: stageCompletionPercent })}
                </p>
              </div>
              <div className="surface-base rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.journey.nextStep}</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {nextLessonCopy?.title ?? guide.journey.finished}
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  {nextStageCopy?.label ?? guide.lesson.finished}
                </p>
              </div>
            </div>

            <div className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-black/20">
              <CubePlatform
                key={`${methodId}-${activeStage.id}-${activeLesson.id}-${replaySeed}`}
                initialAlgorithm={activeLesson.setupAlgorithm}
                algorithm={activeLesson.solveAlgorithm}
                mode="step-by-step"
                interactive={false}
                cameraPreset={activeLesson.viewerPreset ?? 'tutorial'}
                telemetryContext="tutorial"
                className="min-h-[22rem] w-full"
              />
            </div>
            <p className="text-xs text-text-secondary">{guide.lesson.cubeHint}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="surface-base space-y-1 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                  {guide.lesson.recognition}
                </p>
                <p className="text-sm text-text-primary">{lessonCopy.recognition}</p>
              </div>
              <div className="surface-base space-y-1 rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                  {guide.lesson.algorithm}
                </p>
                <code className="text-sm font-semibold text-primary">{activeLesson.solveAlgorithm}</code>
              </div>
            </div>

            <div className="surface-base space-y-3 rounded-[1.5rem] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.lesson.checklist}</p>
              <ul className="space-y-2">
                {lessonCopy.checklist.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-text-secondary">
                    <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="feedback-success rounded-[1.5rem] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-success">{guide.lesson.tip}</p>
              <p className="mt-1 text-sm text-text-primary">{lessonCopy.tip}</p>
            </div>

            <div className="grid gap-2 pt-1 sm:grid-cols-2">
              <Button variant="secondary" onClick={replayLesson} className="justify-center rounded-2xl">
                <UndoLeftRound size={18} />
                {guide.lesson.replay}
              </Button>
              <Button
                onClick={goToNextLesson}
                disabled={!hasNextLesson}
                className="justify-center rounded-2xl"
              >
                {hasNextLesson ? guide.lesson.next : guide.lesson.finished}
                {hasNextLesson && <AltArrowRight size={18} />}
              </Button>
            </div>
          </Card>
        </div>

        <div className="order-2 lg:order-1">
          <Card variant="overlay" className="space-y-6 rounded-[1.75rem] border-white/10">
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.stage.title}</p>
                <p className="text-sm text-text-secondary">
                  {formatTemplate(guide.progress.stage, { current: stageIndex + 1, total: totalStages })}
                </p>
              </div>

              <div className="feedback-info space-y-1 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-info">
                  <Target size={16} />
                  <p className="text-[11px] uppercase tracking-[0.2em]">{guide.stage.objective}</p>
                </div>
                <p className="text-sm text-text-primary">{stageCopy.objective}</p>
              </div>

              <div className="surface-base rounded-2xl p-4">
                <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.journey.nextStep}</p>
                <p className="mt-2 text-sm font-semibold text-text-primary">
                  {nextLessonCopy?.title ?? guide.journey.finished}
                </p>
                <p className="mt-2 text-xs text-text-secondary">
                  {nextStageCopy?.description ?? guide.lesson.finished}
                </p>
              </div>
            </div>

            <div className="space-y-2" role="tablist" aria-label={guide.stage.ariaLabel}>
              {stages.map((stage, index) => {
                const candidateStage = methodCopy.stages[stage.id];

                return (
                  <button
                    key={stage.id}
                    type="button"
                    role="tab"
                    aria-selected={index === stageIndex}
                    onClick={() => selectStage(index)}
                    className={cn(
                      'w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      index === stageIndex
                        ? 'border-primary/60 bg-primary/15'
                        : 'surface-interactive hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
                          {formatTemplate(guide.progress.stage, { current: index + 1, total: totalStages })}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">{candidateStage.label}</p>
                      </div>
                      <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                        {candidateStage.lessons.length}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-text-secondary">{candidateStage.description}</p>
                  </button>
                );
              })}
            </div>

            <div className="space-y-2">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.lesson.title}</p>
              {activeStage.lessons.map((lesson, index) => {
                const candidateLesson = stageCopy.lessons[index];
                if (!candidateLesson) {
                  return null;
                }

                return (
                  <button
                    key={lesson.id}
                    type="button"
                    aria-pressed={index === lessonIndex}
                    onClick={() => selectLesson(index)}
                    className={cn(
                      'w-full rounded-[1.5rem] border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                      index === lessonIndex
                        ? 'border-primary/60 bg-primary/15'
                        : 'surface-interactive hover:border-primary/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-text-primary">{candidateLesson.title}</p>
                        <p className="mt-2 text-xs leading-relaxed text-text-secondary">
                          {candidateLesson.summary}
                        </p>
                      </div>
                      <span className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-text-secondary">
                        {index + 1}/{totalLessons}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>
      </motion.section>
    </motion.div>
  );
}
