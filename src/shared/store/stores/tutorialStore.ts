import { create } from 'zustand';

export type TutorialStep =
  | 'intro'
  | 'whiteCross'
  | 'whiteCorners'
  | 'secondLayer'
  | 'yellowCross'
  | 'yellowEdges'
  | 'yellowCorners'
  | 'solveCorners';

interface TutorialState {
  isOpen: boolean;
  currentStep: TutorialStep;
  openTutorial: () => void;
  closeTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (step: TutorialStep) => void;
}

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

export const useTutorialStore = create<TutorialState>((set, get) => ({
  isOpen: false,
  currentStep: 'intro',

  openTutorial: () => {
    set({ isOpen: true, currentStep: 'intro' });
  },

  closeTutorial: () => {
    set({ isOpen: false });
  },

  nextStep: () => {
    const { currentStep } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentIndex < STEP_ORDER.length - 1) {
      set({ currentStep: STEP_ORDER[currentIndex + 1] });
    } else {
      // Last step, close tutorial
      get().closeTutorial();
    }
  },

  previousStep: () => {
    const { currentStep } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentIndex > 0) {
      set({ currentStep: STEP_ORDER[currentIndex - 1] });
    }
  },

  goToStep: (step: TutorialStep) => {
    set({ currentStep: step });
  },
}));
