import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type OnboardingStep =
  | 'welcome'
  | 'scramble'
  | 'timer'
  | 'stats'
  | 'shortcuts'
  | 'sessions'
  | 'complete';

interface OnboardingStore {
  isActive: boolean;
  currentStep: OnboardingStep;
  hasCompletedOnboarding: boolean;
  startOnboarding: () => void;
  nextStep: () => void;
  previousStep: () => void;
  skipOnboarding: () => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

const STEPS: OnboardingStep[] = [
  'welcome',
  'scramble',
  'timer',
  'stats',
  'shortcuts',
  'sessions',
  'complete',
];

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      isActive: false,
      currentStep: 'welcome',
      hasCompletedOnboarding: false,

      startOnboarding: () => {
        set({
          isActive: true,
          currentStep: 'welcome',
        });
      },

      nextStep: () => {
        const { currentStep } = get();
        const currentIndex = STEPS.indexOf(currentStep);

        if (currentIndex < STEPS.length - 1) {
          set({ currentStep: STEPS[currentIndex + 1] });
        }

        if (currentStep === 'complete') {
          get().completeOnboarding();
        }
      },

      previousStep: () => {
        const { currentStep } = get();
        const currentIndex = STEPS.indexOf(currentStep);

        if (currentIndex > 0) {
          set({ currentStep: STEPS[currentIndex - 1] });
        }
      },

      skipOnboarding: () => {
        set({
          isActive: false,
          currentStep: 'welcome',
          hasCompletedOnboarding: true,
        });
      },

      completeOnboarding: () => {
        set({
          isActive: false,
          currentStep: 'welcome',
          hasCompletedOnboarding: true,
        });
      },

      resetOnboarding: () => {
        set({
          isActive: false,
          currentStep: 'welcome',
          hasCompletedOnboarding: false,
        });
      },
    }),
    {
      name: 'klick-onboarding',
    },
  ),
);
