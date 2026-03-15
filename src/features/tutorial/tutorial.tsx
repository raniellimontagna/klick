import {
  AltArrowRight,
  BookMinimalistic,
  MagicStick3,
  Target,
  UndoLeftRound,
} from '@solar-icons/react';
import { motion } from 'framer-motion';
import { Button, Card, CubePlatform, PageHeader } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn, fadeIn, slideUp } from '@/shared/lib';
import { useTutorialGuide } from './hooks/use-tutorial-guide';

function formatProgress(template: string, current: number, total: number) {
  return template.replace('{current}', String(current)).replace('{total}', String(total));
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
    hasNextLesson,
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

  if (!lessonCopy) {
    return null;
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="initial"
      animate="animate"
      className="app-shell-page space-y-6 sm:space-y-8"
    >
      <PageHeader
        title={guide.title}
        description={guide.subtitle}
        icon={<BookMinimalistic size={32} />}
      />

      <motion.section variants={slideUp} initial="initial" animate="animate">
        <Card
          variant="overlay"
          className="rounded-2xl border-white/10 space-y-5 bg-gradient-to-br from-primary/8 via-white/[0.03] to-accent/8"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.method.title}</p>
            <h2 className="text-2xl font-bold text-text-primary">{methodCopy.label}</h2>
            <p className="text-sm text-text-secondary">{methodCopy.description}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.method.focus}</p>
              <p className="mt-1 text-sm text-text-primary">{methodCopy.focus}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                {guide.method.estimatedTime}
              </p>
              <p className="mt-1 text-sm text-text-primary">{methodCopy.estimatedTime}</p>
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
                      : 'border-border text-text-secondary hover:border-primary/40 hover:text-text-primary',
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
        <Card variant="overlay" className="rounded-2xl border-white/10 space-y-6">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">{guide.stage.title}</p>
            <p className="text-sm text-text-secondary">
              {formatProgress(guide.progress.stage, stageIndex + 1, totalStages)}
            </p>
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
                    'w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    index === stageIndex
                      ? 'border-primary/60 bg-primary/15'
                      : 'border-white/10 bg-black/15 hover:border-primary/40',
                  )}
                >
                  <p className="text-sm font-semibold text-text-primary">{candidateStage.label}</p>
                  <p className="mt-1 text-xs text-text-secondary">{candidateStage.description}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-1 rounded-xl border border-info/30 bg-info/10 p-3">
            <div className="flex items-center gap-2 text-info">
              <Target size={16} />
              <p className="text-[11px] uppercase tracking-[0.2em]">{guide.stage.objective}</p>
            </div>
            <p className="text-sm text-text-primary">{stageCopy.objective}</p>
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
                    'w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                    index === lessonIndex
                      ? 'border-primary/60 bg-primary/15'
                      : 'border-white/10 bg-black/15 hover:border-primary/40',
                  )}
                >
                  <p className="text-sm font-semibold text-text-primary">{candidateLesson.title}</p>
                  <p className="mt-1 text-xs text-text-secondary">{candidateLesson.summary}</p>
                </button>
              );
            })}
          </div>
        </Card>

        <Card variant="overlay" className="rounded-2xl border-white/10 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                {formatProgress(guide.progress.lesson, lessonIndex + 1, totalLessons)}
              </p>
              <h3 className="mt-1 text-2xl font-bold text-text-primary">{lessonCopy.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">{lessonCopy.summary}</p>
            </div>
            <span className="rounded-full border border-primary/40 bg-primary/15 p-2 text-primary">
              <MagicStick3 size={18} />
            </span>
          </div>

          <div className="h-72 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/20">
            <CubePlatform
              key={`${methodId}-${activeStage.id}-${activeLesson.id}-${replaySeed}`}
              algorithm={activeLesson.setupAlgorithm}
              interactive={false}
              className="h-full w-full"
            />
          </div>
          <p className="text-xs text-text-secondary">{guide.lesson.cubeHint}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                {guide.lesson.recognition}
              </p>
              <p className="text-sm text-text-primary">{lessonCopy.recognition}</p>
            </div>
            <div className="space-y-1 rounded-xl border border-white/10 bg-black/20 p-3">
              <p className="text-[11px] uppercase tracking-[0.2em] text-text-muted">
                {guide.lesson.algorithm}
              </p>
              <code className="text-sm font-semibold text-primary">{activeLesson.solveAlgorithm}</code>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-4">
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

          <div className="rounded-xl border border-success/30 bg-success/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-success">{guide.lesson.tip}</p>
            <p className="mt-1 text-sm text-text-primary">{lessonCopy.tip}</p>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="secondary"
              onClick={replayLesson}
              className="rounded-xl border border-white/10 bg-black/20 text-text-primary hover:bg-white/5"
            >
              <UndoLeftRound size={18} />
              {guide.lesson.replay}
            </Button>
            <Button
              onClick={goToNextLesson}
              disabled={!hasNextLesson}
              className="rounded-xl shadow-lg shadow-primary/20"
            >
              {hasNextLesson ? guide.lesson.next : guide.lesson.finished}
              {hasNextLesson && <AltArrowRight size={18} />}
            </Button>
          </div>
        </Card>
      </motion.section>
    </motion.div>
  );
}
