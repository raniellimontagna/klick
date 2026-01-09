import type { OnboardingStep } from '@/features/home/lib/onboarding/onboarding-store';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface OnboardingStepConfig {
  id: OnboardingStep;
  targetSelector?: string; // CSS selector for element to highlight
  position: TooltipPosition;
  allowSkip: boolean;
  showProgress: boolean;
}

export const ONBOARDING_STEPS: Record<OnboardingStep, OnboardingStepConfig> = {
  welcome: {
    id: 'welcome',
    position: 'bottom',
    allowSkip: true,
    showProgress: false,
  },
  scramble: {
    id: 'scramble',
    targetSelector: '[data-onboarding="scramble"]',
    position: 'bottom',
    allowSkip: true,
    showProgress: true,
  },
  timer: {
    id: 'timer',
    targetSelector: '[data-onboarding="timer"]',
    position: 'bottom',
    allowSkip: true,
    showProgress: true,
  },
  stats: {
    id: 'stats',
    targetSelector: '[data-onboarding="stats"]',
    position: 'top',
    allowSkip: true,
    showProgress: true,
  },
  shortcuts: {
    id: 'shortcuts',
    targetSelector: '[data-onboarding="shortcuts"]',
    position: 'top',
    allowSkip: true,
    showProgress: true,
  },
  sessions: {
    id: 'sessions',
    targetSelector: '[data-onboarding="sessions"]',
    position: 'bottom',
    allowSkip: true,
    showProgress: true,
  },
  complete: {
    id: 'complete',
    position: 'bottom',
    allowSkip: false,
    showProgress: false,
  },
};
