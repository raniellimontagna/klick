import { AnimatePresence } from 'framer-motion';
import { ONBOARDING_STEPS } from '@/features/home/lib/onboarding/config';
import { useOnboardingStore } from '@/shared/store/onboarding-store';
import { Spotlight } from './spotlight';
import { OnboardingTooltip } from './onboarding-tooltip';

export function Onboarding() {
  const { isActive, currentStep } = useOnboardingStore();

  if (!isActive) {
    return null;
  }

  const stepConfig = ONBOARDING_STEPS[currentStep];

  return (
    <AnimatePresence mode="wait">
      <Spotlight key="spotlight" targetSelector={stepConfig.targetSelector} isActive={isActive} />
      <OnboardingTooltip key={`tooltip-${currentStep}`} step={currentStep} />
    </AnimatePresence>
  );
}
