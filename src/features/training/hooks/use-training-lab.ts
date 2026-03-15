import { useCallback, useMemo, useState } from 'react';
import { getTrainingTracksWithDrills } from '../lib/training-lab-catalog';
import type { TrainingConfidence, TrainingTrackId } from '../lib/training-lab-types';
import { useTrainingLabStore } from '../store/training-lab-store';

function clampIndex(index: number, maxIndex: number) {
  if (maxIndex <= 0) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index > maxIndex) {
    return maxIndex;
  }

  return index;
}

export function useTrainingLab() {
  const tracks = useMemo(() => getTrainingTracksWithDrills(), []);
  const [activeTrackId, setActiveTrackId] = useState<TrainingTrackId>(tracks[0]?.id ?? 'f2l');
  const [activeDrillIndex, setActiveDrillIndex] = useState(0);
  const [replaySeed, setReplaySeed] = useState(0);

  const progress = useTrainingLabStore((state) => state.progress);
  const addAttempts = useTrainingLabStore((state) => state.addAttempts);
  const setTargetAttempts = useTrainingLabStore((state) => state.setTargetAttempts);
  const setConfidence = useTrainingLabStore((state) => state.setConfidence);
  const resetDrill = useTrainingLabStore((state) => state.resetDrill);

  const activeTrack = tracks.find((track) => track.id === activeTrackId) ?? tracks[0];
  const activeTrackDrills = activeTrack?.drills ?? [];
  const safeDrillIndex = clampIndex(activeDrillIndex, activeTrackDrills.length - 1);
  const activeDrill = activeTrackDrills[safeDrillIndex];

  const activeProgress = activeDrill
    ? progress[activeDrill.id] ?? {
        attempts: 0,
        targetAttempts: activeDrill.targetAttempts,
        confidence: 'starting' as TrainingConfidence,
      }
    : null;

  const selectTrack = useCallback((trackId: TrainingTrackId) => {
    setActiveTrackId(trackId);
    setActiveDrillIndex(0);
    setReplaySeed((current) => current + 1);
  }, []);

  const selectDrill = useCallback(
    (nextIndex: number) => {
      const safeIndex = clampIndex(nextIndex, activeTrackDrills.length - 1);
      setActiveDrillIndex(safeIndex);
      setReplaySeed((current) => current + 1);
    },
    [activeTrackDrills.length],
  );

  const replayDemo = useCallback(() => {
    setReplaySeed((current) => current + 1);
  }, []);

  const addAttemptBatch = useCallback(
    (amount: number) => {
      if (!activeDrill) {
        return;
      }

      addAttempts(activeDrill.id, amount);
    },
    [activeDrill, addAttempts],
  );

  const setActiveTargetAttempts = useCallback(
    (nextTarget: number) => {
      if (!activeDrill) {
        return;
      }

      setTargetAttempts(activeDrill.id, nextTarget);
    },
    [activeDrill, setTargetAttempts],
  );

  const setActiveConfidence = useCallback(
    (confidence: TrainingConfidence) => {
      if (!activeDrill) {
        return;
      }

      setConfidence(activeDrill.id, confidence);
    },
    [activeDrill, setConfidence],
  );

  const resetActiveDrill = useCallback(() => {
    if (!activeDrill) {
      return;
    }

    resetDrill(activeDrill.id);
  }, [activeDrill, resetDrill]);

  const activeCompletionPercent = useMemo(() => {
    if (!activeProgress || activeProgress.targetAttempts <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((activeProgress.attempts / activeProgress.targetAttempts) * 100));
  }, [activeProgress]);

  const activeTrackAttempts = useMemo(
    () =>
      activeTrackDrills.reduce((sum, drill) => {
        const drillProgress = progress[drill.id];
        return sum + (drillProgress?.attempts ?? 0);
      }, 0),
    [activeTrackDrills, progress],
  );

  const activeTrackTarget = useMemo(
    () =>
      activeTrackDrills.reduce((sum, drill) => {
        const drillProgress = progress[drill.id];
        return sum + (drillProgress?.targetAttempts ?? drill.targetAttempts);
      }, 0),
    [activeTrackDrills, progress],
  );

  return {
    tracks,
    progress,
    activeTrack,
    activeTrackId,
    activeTrackDrills,
    activeDrill,
    activeDrillIndex: safeDrillIndex,
    activeProgress,
    activeCompletionPercent,
    activeTrackAttempts,
    activeTrackTarget,
    replaySeed,
    selectTrack,
    selectDrill,
    replayDemo,
    addAttemptBatch,
    setActiveTargetAttempts,
    setActiveConfidence,
    resetActiveDrill,
  };
}
