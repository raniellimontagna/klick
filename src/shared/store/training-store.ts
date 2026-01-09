import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { trainingCases } from '@/features/training/cases';

export type TrainingStatus = 'learning' | 'refining' | 'mastered';

export type TrainingProgress = {
  repetitions: number;
  goal: number;
  status: TrainingStatus;
  notes: string;
};

type TrainingState = Record<string, TrainingProgress>;

const defaultProgress: TrainingState = trainingCases.reduce((acc, trainingCase) => {
  acc[trainingCase.id] = {
    repetitions: 0,
    goal: 50,
    status: 'learning',
    notes: '',
  };
  return acc;
}, {} as TrainingState);

const withDefaults = (progress: TrainingState | undefined): TrainingState => {
  if (!progress) {
    return { ...defaultProgress };
  }

  const merged: TrainingState = { ...defaultProgress };

  for (const [caseId, value] of Object.entries(progress)) {
    merged[caseId] = {
      repetitions: Math.max(0, value.repetitions ?? 0),
      goal: value.goal && value.goal > 0 ? value.goal : defaultProgress[caseId]?.goal ?? 50,
      status: value.status ?? 'learning',
      notes: value.notes ?? '',
    };
  }

  return merged;
};

interface TrainingStore {
  progress: TrainingState;
  incrementRepetitions: (caseId: string, amount: number) => void;
  setGoal: (caseId: string, goal: number) => void;
  setStatus: (caseId: string, status: TrainingStatus) => void;
  setNotes: (caseId: string, notes: string) => void;
  resetCase: (caseId: string) => void;
  resetAll: () => void;
}

export const useTrainingStore = create<TrainingStore>()(
  persist(
    (set) => ({
      progress: withDefaults(undefined),
      incrementRepetitions: (caseId, amount) => {
        if (!Number.isFinite(amount) || amount === 0) return;

        set((state) => {
          const current = state.progress[caseId] ?? defaultProgress[caseId] ?? {
            repetitions: 0,
            goal: 50,
            status: 'learning' as TrainingStatus,
            notes: '',
          };
          const repetitions = Math.max(0, current.repetitions + amount);

          if (repetitions === current.repetitions) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              [caseId]: { ...current, repetitions },
            },
          };
        });
      },
      setGoal: (caseId, goal) => {
        if (!Number.isFinite(goal)) return;
        const sanitized = Math.max(1, Math.round(goal));
        set((state) => {
          const current = state.progress[caseId] ?? defaultProgress[caseId];
          if (current?.goal === sanitized) {
            return state;
          }
          return {
            progress: {
              ...state.progress,
              [caseId]: { ...current, goal: sanitized },
            },
          };
        });
      },
      setStatus: (caseId, status) => {
        set((state) => {
          const current = state.progress[caseId] ?? defaultProgress[caseId];
          if (current?.status === status) {
            return state;
          }
          return {
            progress: {
              ...state.progress,
              [caseId]: { ...current, status },
            },
          };
        });
      },
      setNotes: (caseId, notes) => {
        set((state) => {
          const current = state.progress[caseId] ?? defaultProgress[caseId];
          if (current?.notes === notes) {
            return state;
          }
          return {
            progress: {
              ...state.progress,
              [caseId]: { ...current, notes },
            },
          };
        });
      },
      resetCase: (caseId) => {
        set((state) => {
          const defaults = defaultProgress[caseId] ?? {
            repetitions: 0,
            goal: 50,
            status: 'learning' as TrainingStatus,
            notes: '',
          };

          const current = state.progress[caseId];

          if (
            current &&
            current.repetitions === defaults.repetitions &&
            current.goal === defaults.goal &&
            current.status === defaults.status &&
            current.notes === defaults.notes
          ) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              [caseId]: { ...defaults },
            },
          };
        });
      },
      resetAll: () => {
        set((state) => {
          const hasDifferences = Object.entries(defaultProgress).some(([caseId, defaults]) => {
            const current = state.progress[caseId];
            return (
              !current ||
              current.repetitions !== defaults.repetitions ||
              current.goal !== defaults.goal ||
              current.status !== defaults.status ||
              current.notes !== defaults.notes
            );
          });

          if (!hasDifferences) {
            return state;
          }

          return {
            progress: {
              ...defaultProgress,
            },
          };
        });
      },
    }),
    {
      name: 'klick-training',
      version: 1,
      merge: (_persistedState, currentState) => {
        const persistedProgress =
          (_persistedState as { state?: { progress?: TrainingState } })?.state?.progress;
        return {
          ...currentState,
          progress: withDefaults(persistedProgress),
        };
      },
    },
  ),
);
