import { useCallback, useMemo, useState } from 'react';
import {
  tutorialGuideModel,
  tutorialMethodIds,
  type TutorialMethodId,
} from '../lib/tutorial-guide-model';

function clampIndex(index: number, max: number) {
  if (index < 0) {
    return 0;
  }

  if (index > max) {
    return max;
  }

  return index;
}

export function useTutorialGuide() {
  const [methodId, setMethodId] = useState<TutorialMethodId>(tutorialMethodIds[0]);
  const [stageIndex, setStageIndex] = useState(0);
  const [lessonIndex, setLessonIndex] = useState(0);
  const [replaySeed, setReplaySeed] = useState(0);

  const method = tutorialGuideModel[methodId];
  const stages = method.stages;
  const activeStage = stages[clampIndex(stageIndex, stages.length - 1)];
  const lessons = activeStage.lessons;
  const activeLesson = lessons[clampIndex(lessonIndex, lessons.length - 1)];

  const totalStages = stages.length;
  const totalLessons = lessons.length;

  const hasNextLesson = useMemo(() => {
    const hasLessonInStage = lessonIndex < totalLessons - 1;
    const hasNextStage = stageIndex < totalStages - 1;
    return hasLessonInStage || hasNextStage;
  }, [lessonIndex, stageIndex, totalLessons, totalStages]);

  const selectMethod = useCallback((nextMethodId: TutorialMethodId) => {
    setMethodId(nextMethodId);
    setStageIndex(0);
    setLessonIndex(0);
    setReplaySeed((previous) => previous + 1);
  }, []);

  const selectStage = useCallback(
    (nextStageIndex: number) => {
      const safeIndex = clampIndex(nextStageIndex, stages.length - 1);
      setStageIndex(safeIndex);
      setLessonIndex(0);
      setReplaySeed((previous) => previous + 1);
    },
    [stages.length],
  );

  const selectLesson = useCallback(
    (nextLessonIndex: number) => {
      const safeIndex = clampIndex(nextLessonIndex, lessons.length - 1);
      setLessonIndex(safeIndex);
      setReplaySeed((previous) => previous + 1);
    },
    [lessons.length],
  );

  const replayLesson = useCallback(() => {
    setReplaySeed((previous) => previous + 1);
  }, []);

  const goToNextLesson = useCallback(() => {
    if (lessonIndex < totalLessons - 1) {
      setLessonIndex((previous) => previous + 1);
      setReplaySeed((previous) => previous + 1);
      return;
    }

    if (stageIndex < totalStages - 1) {
      setStageIndex((previous) => previous + 1);
      setLessonIndex(0);
      setReplaySeed((previous) => previous + 1);
    }
  }, [lessonIndex, stageIndex, totalLessons, totalStages]);

  return {
    method,
    methodId,
    methodIds: tutorialMethodIds,
    stages,
    activeStage,
    activeLesson,
    stageIndex,
    lessonIndex,
    totalStages,
    totalLessons,
    hasNextLesson,
    replaySeed,
    selectMethod,
    selectStage,
    selectLesson,
    replayLesson,
    goToNextLesson,
  };
}
