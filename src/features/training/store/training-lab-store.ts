import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTrainingLabDefaults, trainingLabCatalog } from '../lib/training-lab-catalog';
import type { TrainingConfidence, TrainingDrillProgress } from '../lib/training-lab-types';

type TrainingProgressMap = Record<string, TrainingDrillProgress>;

interface TrainingLabStore {
  progress: TrainingProgressMap;
  addAttempts: (drillId: string, amount: number) => void;
  setTargetAttempts: (drillId: string, targetAttempts: number) => void;
  setConfidence: (drillId: string, confidence: TrainingConfidence) => void;
  resetDrill: (drillId: string) => void;
  resetAll: () => void;
}

const catalogDefaults = createTrainingLabDefaults();

function getDefaultProgress(drillId: string): TrainingDrillProgress {
  const drill = trainingLabCatalog.drills[drillId];
  return {
    attempts: 0,
    targetAttempts: drill?.targetAttempts ?? 20,
    confidence: 'starting',
  };
}

function mergeWithCatalog(progress?: TrainingProgressMap) {
  const merged: TrainingProgressMap = {};

  for (const drill of Object.values(trainingLabCatalog.drills)) {
    const persisted = progress?.[drill.id];

    merged[drill.id] = {
      attempts: Math.max(0, persisted?.attempts ?? 0),
      targetAttempts: Math.max(1, persisted?.targetAttempts ?? drill.targetAttempts),
      confidence: persisted?.confidence ?? 'starting',
    };
  }

  return merged;
}

export const useTrainingLabStore = create<TrainingLabStore>()(
  persist(
    (set) => ({
      progress: { ...catalogDefaults },
      addAttempts: (drillId, amount) => {
        if (!Number.isFinite(amount) || amount === 0) {
          return;
        }

        set((state) => {
          const current = state.progress[drillId] ?? getDefaultProgress(drillId);
          const nextAttempts = Math.max(0, current.attempts + Math.round(amount));

          if (nextAttempts === current.attempts) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              [drillId]: {
                ...current,
                attempts: nextAttempts,
              },
            },
          };
        });
      },
      setTargetAttempts: (drillId, targetAttempts) => {
        if (!Number.isFinite(targetAttempts)) {
          return;
        }

        const safeTarget = Math.max(1, Math.round(targetAttempts));

        set((state) => {
          const current = state.progress[drillId] ?? getDefaultProgress(drillId);

          if (current.targetAttempts === safeTarget) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              [drillId]: {
                ...current,
                targetAttempts: safeTarget,
              },
            },
          };
        });
      },
      setConfidence: (drillId, confidence) => {
        set((state) => {
          const current = state.progress[drillId] ?? getDefaultProgress(drillId);

          if (current.confidence === confidence) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              [drillId]: {
                ...current,
                confidence,
              },
            },
          };
        });
      },
      resetDrill: (drillId) => {
        set((state) => {
          const defaults = getDefaultProgress(drillId);
          const current = state.progress[drillId];

          if (
            current &&
            current.attempts === defaults.attempts &&
            current.targetAttempts === defaults.targetAttempts &&
            current.confidence === defaults.confidence
          ) {
            return state;
          }

          return {
            progress: {
              ...state.progress,
              [drillId]: defaults,
            },
          };
        });
      },
      resetAll: () => {
        set((state) => {
          const next = createTrainingLabDefaults();
          const hasDifference = Object.entries(next).some(([drillId, defaults]) => {
            const current = state.progress[drillId];
            return (
              !current ||
              current.attempts !== defaults.attempts ||
              current.targetAttempts !== defaults.targetAttempts ||
              current.confidence !== defaults.confidence
            );
          });

          if (!hasDifference) {
            return state;
          }

          return {
            progress: next,
          };
        });
      },
    }),
    {
      name: 'klick-training-lab-v2',
      version: 1,
      merge: (persistedState, currentState) => {
        const persistedProgress = (persistedState as { state?: { progress?: TrainingProgressMap } })
          ?.state?.progress;

        return {
          ...currentState,
          progress: mergeWithCatalog(persistedProgress),
        };
      },
    },
  ),
);
