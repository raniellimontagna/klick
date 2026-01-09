import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { useTutorialContent } from './use-tutorial-content';
import { useI18nStore } from '@/shared/store/i18n-store';
import { translations } from '@/shared/config/i18n/translations';
import type { TutorialStep } from '@/features/tutorial/tutorial-store';
import { CubeVisualizer } from '@/shared/components/cube-visualizer';
import { getTutorialVisualizationConfig } from './tutorial-visualizations';

function TutorialStepContent({ step }: { step: TutorialStep }) {
  const { language } = useI18nStore();
  const tutorial = translations[language].tutorial;

  if (step === 'intro') {
    const intro = tutorial.intro;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-primary/10 rounded-xl">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h3 className="text-2xl font-bold">{intro.title}</h3>
            <p className="text-text-secondary text-sm">{intro.difficulty}</p>
          </div>
        </div>
        <p className="text-text-secondary leading-relaxed">{intro.description}</p>
        <div className="space-y-2">
          <p className="font-semibold text-sm">{intro.whatYouWillLearn}</p>
          <ul className="space-y-2">
            {intro.topics.map((topic: string, index: number) => (
              <li key={`topic-${topic.substring(0, 10)}`} className="flex items-start gap-2">
                <span className="text-primary font-bold mt-0.5">{index + 1}.</span>
                <span className="text-text-secondary text-sm">{topic}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center gap-4 pt-4 border-t border-border">
          <div className="text-sm">
            <span className="text-text-secondary">⏱️ {intro.timeEstimate}</span>
          </div>
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
    <div className="space-y-4">
      {visualizationConfig && <CubeVisualizer config={visualizationConfig} />}
      <div>
        <h3 className="text-xl font-bold mb-2">{stepData.title as string}</h3>
        <p className="text-text-secondary mb-4">{stepData.description as string}</p>

        {stepData.goal && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
            <p className="text-sm">
              <strong className="text-blue-600 dark:text-blue-400">🎯 Objetivo:</strong>{' '}
              {stepData.goal as string}
            </p>
          </div>
        )}

        {stepData.algorithm && (
          <div className="bg-surface rounded-lg p-4 mb-4 border border-border">
            <p className="text-xs text-text-secondary mb-2 font-semibold">Algoritmo:</p>
            <code className="text-base font-mono font-bold text-primary">
              {stepData.algorithm as string}
            </code>
          </div>
        )}

        {stepData.algorithms && typeof stepData.algorithms === 'object' && (
          <div className="space-y-3 mb-4">
            <p className="text-xs text-text-secondary font-semibold">
              {(stepData.algorithms as Record<string, string>).title}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-surface rounded-lg p-3 border border-border">
                <p className="text-xs text-primary font-semibold mb-2">
                  {(stepData.algorithms as Record<string, string>).left}
                </p>
                <code className="text-sm font-mono text-text-secondary">
                  {(stepData.algorithms as Record<string, string>).leftAlg}
                </code>
              </div>
              <div className="bg-surface rounded-lg p-3 border border-border">
                <p className="text-xs text-primary font-semibold mb-2">
                  {(stepData.algorithms as Record<string, string>).right}
                </p>
                <code className="text-sm font-mono text-text-secondary">
                  {(stepData.algorithms as Record<string, string>).rightAlg}
                </code>
              </div>
            </div>
          </div>
        )}

        {stepData.steps && Array.isArray(stepData.steps) && (
          <div className="space-y-2 mb-4">
            <p className="text-xs text-text-secondary font-semibold">Passos:</p>
            <ol className="space-y-2">
              {(stepData.steps as string[]).map((stepText: string, index: number) => (
                <li key={`${step}-${stepText.substring(0, 20)}`} className="flex items-start gap-2">
                  <span className="text-primary font-bold">{index + 1}.</span>
                  <span className="text-sm text-text-secondary">{stepText}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {stepData.tip && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
            <p className="text-sm text-green-600 dark:text-green-400">
              <strong>💡 Dica:</strong> {stepData.tip as string}
            </p>
          </div>
        )}

        {stepData.tips && Array.isArray(stepData.tips) && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4 space-y-2">
            {(stepData.tips as string[]).map((tipText: string) => (
              <p
                key={`${step}-${tipText.substring(0, 20)}`}
                className="text-sm text-green-600 dark:text-green-400"
              >
                <strong>💡 Dica:</strong> {tipText}
              </p>
            ))}
          </div>
        )}

        {stepData.important && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              <strong>⚠️ IMPORTANTE:</strong> {stepData.important as string}
            </p>
          </div>
        )}

        {stepData.congratulations && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
            <p className="text-lg font-bold text-green-600 dark:text-green-400 mb-2">
              🎉 {stepData.congratulations as string}
            </p>
            {stepData.finalMessage && (
              <p className="text-sm text-text-secondary">{stepData.finalMessage as string}</p>
            )}
          </div>
        )}
      </div>
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
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary font-medium">
            Passo {currentStepIndex + 1} de {totalSteps}
          </span>
          <span className="text-primary font-semibold">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Step content */}
      <div className="min-h-[400px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            <TutorialStepContent step={currentStep} />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <Button
          onClick={handlePrevious}
          disabled={isFirstStep}
          variant="ghost"
          className="flex items-center gap-2 px-4 py-2 text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="hidden sm:inline">{t.tutorial.steps.navigation.previous}</span>
          <span className="sm:hidden">Ant.</span>
        </Button>

        <Button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2 font-medium"
        >
          <span>
            {isLastStep ? t.tutorial.steps.navigation.finish : t.tutorial.steps.navigation.next}
          </span>
          {!isLastStep && <ChevronRight className="w-5 h-5" />}
        </Button>
      </div>
    </div>
  );
}
