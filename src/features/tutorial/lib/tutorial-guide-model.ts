export const tutorialMethodIds = ['cfop'] as const;
export type TutorialMethodId = (typeof tutorialMethodIds)[number];

const tutorialStageIds = ['cross', 'f2l', 'oll', 'pll'] as const;
type TutorialStageId = (typeof tutorialStageIds)[number];

interface TutorialLessonModel {
  id: string;
  setupAlgorithm: string;
  solveAlgorithm: string;
}

interface TutorialStageModel {
  id: TutorialStageId;
  lessons: readonly TutorialLessonModel[];
}

interface TutorialMethodModel {
  id: TutorialMethodId;
  stages: readonly TutorialStageModel[];
}

export const tutorialGuideModel: Record<TutorialMethodId, TutorialMethodModel> = {
  cfop: {
    id: 'cfop',
    stages: [
      {
        id: 'cross',
        lessons: [
          {
            id: 'cross-daisy',
            setupAlgorithm: "R U R' U' F2",
            solveAlgorithm: "F R U R' U' F'",
          },
          {
            id: 'cross-alignment',
            setupAlgorithm: "U R U' R' F R' F'",
            solveAlgorithm: "R U R' U R U2 R'",
          },
        ],
      },
      {
        id: 'f2l',
        lessons: [
          {
            id: 'f2l-front-slot',
            setupAlgorithm: "U R U' R' U' F' U F",
            solveAlgorithm: "U R U' R'",
          },
          {
            id: 'f2l-back-slot',
            setupAlgorithm: "R U2 R' U' R U R'",
            solveAlgorithm: "U' L' U L U F U' F'",
          },
        ],
      },
      {
        id: 'oll',
        lessons: [
          {
            id: 'oll-sune',
            setupAlgorithm: "R U2 R' U' R U' R'",
            solveAlgorithm: "R U R' U R U2 R'",
          },
          {
            id: 'oll-antisune',
            setupAlgorithm: "R' U' R U' R' U2 R",
            solveAlgorithm: "R' U' R U' R' U2 R",
          },
        ],
      },
      {
        id: 'pll',
        lessons: [
          {
            id: 'pll-t-perm',
            setupAlgorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
            solveAlgorithm: "R U R' U' R' F R2 U' R' U' R U R' F'",
          },
          {
            id: 'pll-y-perm',
            setupAlgorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
            solveAlgorithm: "F R U' R' U' R U R' F' R U R' U' R' F R F'",
          },
        ],
      },
    ],
  },
};
