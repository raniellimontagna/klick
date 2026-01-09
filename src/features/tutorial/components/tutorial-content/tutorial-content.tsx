import { AnimatePresence, motion } from 'framer-motion';
import {
  DangerTriangle,
  MedalRibbon,
  BookMinimalistic,
  AltArrowLeft,
  AltArrowRight,
  Lightbulb,
  MagicStick3,
  Target,
} from '@solar-icons/react';
import type { TutorialStep } from '@/features/tutorial/tutorial-store';
import { CubeVisualizer } from '@/shared/components/cube-visualizer';
import { Button } from '@/shared/components/ui';
import { translations } from '@/shared/config/i18n/translations';
import { useI18nStore } from '@/shared/store/i18n-store';
import { getTutorialVisualizationConfig } from './tutorial-visualizations';
import { useTutorialContent } from './use-tutorial-content';

function TutorialStepContent({ step }: { step: TutorialStep }) {
  const { language, t } = useI18nStore();
  const tutorial = translations[language].tutorial;

  if (step === 'intro') {
    const intro = tutorial.intro;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-4 bg-primary/20 rounded-2xl border border-primary/30">
            <BookMinimalistic size={40} className="text-primary" />
          </div>
          <div>
            <h3 className="text-2xl sm:text-3xl font-black text-text-primary">{intro.title}</h3>
            <p className="text-text-muted text-sm font-medium uppercase tracking-widest">
              {intro.difficulty}
            </p>
          </div>
        </div>

        <p className="text-text-secondary leading-relaxed text-base">{intro.description}</p>

        <div className="bg-white/5 rounded-xl p-5 border border-white/10 space-y-4">
          <p className="font-bold text-[10px] uppercase tracking-widest text-text-muted flex items-center gap-2">
            <MagicStick3 size={16} className="text-primary" />
            {intro.whatYouWillLearn}
          </p>
          <ul className="space-y-3">
            {intro.topics.map((topic: string, index: number) => (
              <li key={`topic-${topic.substring(0, 10)}`} className="flex items-start gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">
                  {index + 1}
                </span>
                <span className="text-text-secondary text-sm leading-relaxed">{topic}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 pt-4 border-t border-white/10">
          <span className="text-text-muted text-sm">⏱️</span>
          <span className="text-text-secondary text-sm">{intro.timeEstimate}</span>
        </div>
      </div>
    );
  }

  const stepData = tutorial[step as keyof typeof tutorial] as Record<
    string,
    string | string[] | Record<string, string>
  >;
  const visualizationConfig = getTutorialVisualizationConfig(step, tutorial);

  return (
    <div className="space-y-5">
      {visualizationConfig && <CubeVisualizer config={visualizationConfig} />}

      <div>
        <h3 className="text-xl sm:text-2xl font-black text-text-primary mb-2">
          {stepData.title as string}
        </h3>
        <p className="text-text-secondary leading-relaxed">{stepData.description as string}</p>
      </div>

      {stepData.goal && (
        <div className="bg-info/10 border border-info/30 rounded-xl p-4 flex items-start gap-3">
          <Target size={20} className="text-info shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-info mb-1">
              {t.tutorial.steps.labels.goal}
            </p>
            <p className="text-sm text-text-primary">{stepData.goal as string}</p>
          </div>
        </div>
      )}

      {stepData.algorithm && (
        <div className="bg-white/5 rounded-xl p-4 border border-white/10">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-2">
            {t.tutorial.steps.labels.algorithm}
          </p>
          <code className="text-lg font-mono font-black text-primary tracking-wider">
            {stepData.algorithm as string}
          </code>
        </div>
      )}

      {stepData.algorithms && typeof stepData.algorithms === 'object' && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            {(stepData.algorithms as Record<string, string>).title}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-xs text-primary font-bold mb-2">
                {(stepData.algorithms as Record<string, string>).left}
              </p>
              <code className="text-sm font-mono text-text-primary font-semibold">
                {(stepData.algorithms as Record<string, string>).leftAlg}
              </code>
            </div>
            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
              <p className="text-xs text-primary font-bold mb-2">
                {(stepData.algorithms as Record<string, string>).right}
              </p>
              <code className="text-sm font-mono text-text-primary font-semibold">
                {(stepData.algorithms as Record<string, string>).rightAlg}
              </code>
            </div>
          </div>
        </div>
      )}

      {stepData.steps && Array.isArray(stepData.steps) && (
        <div className="space-y-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            {t.tutorial.steps.labels.steps}
          </p>
          <ol className="space-y-2">
            {(stepData.steps as string[]).map((stepText: string, index: number) => (
              <li
                key={`${step}-${stepText.substring(0, 20)}`}
                className="flex items-start gap-3 bg-white/5 rounded-lg p-3 border border-white/5"
              >
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/20 text-primary text-xs font-bold shrink-0">
                  {index + 1}
                </span>
                <span className="text-sm text-text-secondary leading-relaxed">{stepText}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {stepData.tip && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 flex items-start gap-3">
          <Lightbulb size={20} className="text-success shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-success mb-1">
              {t.tutorial.steps.labels.tip}
            </p>
            <p className="text-sm text-text-primary">{stepData.tip as string}</p>
          </div>
        </div>
      )}

      {stepData.tips && Array.isArray(stepData.tips) && (
        <div className="bg-success/10 border border-success/30 rounded-xl p-4 space-y-3">
          {(stepData.tips as string[]).map((tipText: string) => (
            <div key={`${step}-tip-${tipText.substring(0, 20)}`} className="flex items-start gap-3">
              <Lightbulb size={16} className="text-success shrink-0 mt-0.5" />
              <p className="text-sm text-text-primary">{tipText}</p>
            </div>
          ))}
        </div>
      )}

      {stepData.important && (
        <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 flex items-start gap-3">
          <DangerTriangle size={20} className="text-danger shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-danger mb-1">
              {t.tutorial.steps.labels.important}
            </p>
            <p className="text-sm text-text-primary">{stepData.important as string}</p>
          </div>
        </div>
      )}

      {stepData.congratulations && (
        <div className="bg-success/10 border border-success/30 rounded-2xl p-6 text-center">
          <MedalRibbon size={48} className="text-success mx-auto mb-3" />
          <p className="text-xl font-black text-success mb-2">
            🎉 {stepData.congratulations as string}
          </p>
          {stepData.finalMessage && (
            <p className="text-sm text-text-secondary">{stepData.finalMessage as string}</p>
          )}
        </div>
      )}
    </div>
  );
}

export function TutorialContent() {
  const {
    currentStep,
    currentStepIndex,
    totalSteps,
    isFirstStep,
    isLastStep,
    progressPercentage,
    handleNext,
    handlePrevious,
  } = useTutorialContent();
  const { t } = useI18nStore();

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
            {t.tutorial.steps.progress
              .replace('{current}', String(currentStepIndex + 1))
              .replace('{total}', String(totalSteps))}
          </span>
          <span className="text-primary font-bold text-sm">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-accent rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[420px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            <TutorialStepContent step={currentStep} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-white/10">
        <Button
          onClick={handlePrevious}
          disabled={isFirstStep}
          variant="ghost"
          className="flex items-center gap-2 px-4 py-2.5 text-text-muted hover:text-text-primary hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          <AltArrowLeft size={20} />
          <span className="hidden sm:inline font-medium">
            {t.tutorial.steps.navigation.previous}
          </span>
        </Button>

        <Button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2.5 font-bold shadow-lg shadow-primary/20"
        >
          <span>
            {isLastStep ? t.tutorial.steps.navigation.finish : t.tutorial.steps.navigation.next}
          </span>
          {!isLastStep && <AltArrowRight size={20} />}
        </Button>
      </div>
    </div>
  );
}
