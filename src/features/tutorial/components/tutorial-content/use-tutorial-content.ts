import { useCallback, useMemo } from 'react';
import { type TutorialStep, useTutorialStore } from '@/features/tutorial/tutorial-store';
import { useTranslation } from '@/shared/hooks/use-translation';

const STEP_ORDER: TutorialStep[] = [
  'intro',
  'whiteCross',
  'whiteCorners',
  'secondLayer',
  'yellowCross',
  'yellowEdges',
  'yellowCorners',
  'solveCorners',
];

export function useTutorialContent() {
  const { isOpen, currentStep, closeTutorial, nextStep, previousStep } = useTutorialStore();
  const { t } = useTranslation();

  const currentStepIndex = useMemo(() => STEP_ORDER.indexOf(currentStep), [currentStep]);
  const totalSteps = STEP_ORDER.length;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  const handleClose = useCallback(() => {
    closeTutorial();
  }, [closeTutorial]);

  const handleNext = useCallback(() => {
    nextStep();
  }, [nextStep]);

  const handlePrevious = useCallback(() => {
    previousStep();
  }, [previousStep]);

  const progressPercentage = useMemo(
    () => ((currentStepIndex + 1) / totalSteps) * 100,
    [currentStepIndex, totalSteps],
  );

  return {
    isOpen,
    currentStep,
    currentStepIndex,
    totalSteps,
    isFirstStep,
    isLastStep,
    progressPercentage,
    handleClose,
    handleNext,
    handlePrevious,
    t,
  };
}
