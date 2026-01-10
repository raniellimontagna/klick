import { AnimatePresence } from 'framer-motion';
import { ONBOARDING_STEPS } from '@/features/home/lib/onboarding/config';
import { useOnboardingStore } from '@/features/home/lib/onboarding/onboarding-store';
import { OnboardingTooltip } from './onboarding-tooltip';
import { Spotlight } from './spotlight';

export function Onboarding() {
  const { isActive, currentStep } = useOnboardingStore();

  if (!isActive) {
    return null;
  }

  const stepConfig = ONBOARDING_STEPS[currentStep];

  return (
    <AnimatePresence>
      <Spotlight key="spotlight" targetSelector={stepConfig.targetSelector} isActive={isActive} />
      <OnboardingTooltip key={`tooltip-${currentStep}`} step={currentStep} />
    </AnimatePresence>
  );
}
