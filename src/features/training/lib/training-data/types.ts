export type TrainingCategory = 'pll' | 'oll' | 'f2l';

export type TrainingCase = {
  id: string;
  category: TrainingCategory;
  titleKey: string;
  descriptionKey: string;
  tipKey?: string;
  algorithms: string[];
};
