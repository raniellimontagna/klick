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
  hasCompleted: boolean;
  openTutorial: () => void;
  closeTutorial: () => void;
  completeTutorial: () => void;
  nextStep: () => void;
  previousStep: () => void;
  goToStep: (step: TutorialStep) => void;
  resetTutorial: () => void;
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
  hasCompleted: false,

  openTutorial: () => {
    set({ isOpen: true, currentStep: 'intro' });
  },

  closeTutorial: () => {
    set({ isOpen: false });
  },

  completeTutorial: () => {
    set({ isOpen: false, hasCompleted: true });
  },

  nextStep: () => {
    const { currentStep } = get();
    const currentIndex = STEP_ORDER.indexOf(currentStep);

    if (currentIndex < STEP_ORDER.length - 1) {
      set({ currentStep: STEP_ORDER[currentIndex + 1] });
    } else {
      // Last step - mark as completed
      get().completeTutorial();
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

  resetTutorial: () => {
    set({ currentStep: 'intro', hasCompleted: false });
  },
}));
