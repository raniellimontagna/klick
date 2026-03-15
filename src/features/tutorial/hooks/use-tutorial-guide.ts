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
  const totalMethodLessons = useMemo(
    () => stages.reduce((sum, stage) => sum + stage.lessons.length, 0),
    [stages],
  );
  const completedMethodLessons = useMemo(
    () =>
      stages.slice(0, stageIndex).reduce((sum, stage) => sum + stage.lessons.length, 0) + lessonIndex + 1,
    [lessonIndex, stageIndex, stages],
  );
  const overallProgressPercent = useMemo(() => {
    if (totalMethodLessons <= 0) {
      return 0;
    }

    return Math.min(100, Math.round((completedMethodLessons / totalMethodLessons) * 100));
  }, [completedMethodLessons, totalMethodLessons]);
  const stageCompletionPercent = useMemo(() => {
    if (totalLessons <= 0) {
      return 0;
    }

    return Math.min(100, Math.round(((lessonIndex + 1) / totalLessons) * 100));
  }, [lessonIndex, totalLessons]);

  const hasNextLesson = useMemo(() => {
    const hasLessonInStage = lessonIndex < totalLessons - 1;
    const hasNextStage = stageIndex < totalStages - 1;
    return hasLessonInStage || hasNextStage;
  }, [lessonIndex, stageIndex, totalLessons, totalStages]);

  const nextLesson = useMemo(() => {
    if (lessonIndex < totalLessons - 1) {
      return {
        stageIndex,
        lessonIndex: lessonIndex + 1,
        stage: activeStage,
        lesson: lessons[lessonIndex + 1],
      };
    }

    if (stageIndex < totalStages - 1) {
      const nextStage = stages[stageIndex + 1];
      const firstLesson = nextStage?.lessons[0];

      if (!nextStage || !firstLesson) {
        return null;
      }

      return {
        stageIndex: stageIndex + 1,
        lessonIndex: 0,
        stage: nextStage,
        lesson: firstLesson,
      };
    }

    return null;
  }, [activeStage, lessonIndex, lessons, stageIndex, stages, totalLessons, totalStages]);

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
    totalMethodLessons,
    completedMethodLessons,
    overallProgressPercent,
    stageCompletionPercent,
    hasNextLesson,
    nextLesson,
    replaySeed,
    selectMethod,
    selectStage,
    selectLesson,
    replayLesson,
    goToNextLesson,
  };
}
