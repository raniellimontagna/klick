import type { TrainingCase, TrainingCategory } from './types';

export const trainingCategories: TrainingCategory[] = ['pll', 'oll', 'f2l'];

export const trainingCases: TrainingCase[] = [
  {
    id: 'pll-t-perm',
    category: 'pll',
    titleKey: 'training.cases.pll.tPerm.title',
    descriptionKey: 'training.cases.pll.tPerm.description',
    tipKey: 'training.cases.pll.tPerm.tip',
    algorithms: ["R U R' U' R' F R2 U' R' U' R U R' F'"],
  },
  {
    id: 'pll-j-perm',
    category: 'pll',
    titleKey: 'training.cases.pll.jPerm.title',
    descriptionKey: 'training.cases.pll.jPerm.description',
    tipKey: 'training.cases.pll.jPerm.tip',
    algorithms: ["R U R' F' R U R' U' R' F R2 U' R'"],
  },
  {
    id: 'pll-z-perm',
    category: 'pll',
    titleKey: 'training.cases.pll.zPerm.title',
    descriptionKey: 'training.cases.pll.zPerm.description',
    tipKey: 'training.cases.pll.zPerm.tip',
    algorithms: ['M2 U M2 U M\' U2 M2 U2 M\''],
  },
  {
    id: 'oll-sune',
    category: 'oll',
    titleKey: 'training.cases.oll.sune.title',
    descriptionKey: 'training.cases.oll.sune.description',
    tipKey: 'training.cases.oll.sune.tip',
    algorithms: ["R U R' U R U2 R'"],
  },
  {
    id: 'oll-antisune',
    category: 'oll',
    titleKey: 'training.cases.oll.antisune.title',
    descriptionKey: 'training.cases.oll.antisune.description',
    tipKey: 'training.cases.oll.antisune.tip',
    algorithms: ["R' U' R U' R' U2 R"],
  },
  {
    id: 'oll-h',
    category: 'oll',
    titleKey: 'training.cases.oll.hPattern.title',
    descriptionKey: 'training.cases.oll.hPattern.description',
    tipKey: 'training.cases.oll.hPattern.tip',
    algorithms: ["F R U R' U' F' f R U R' U' f'"],
  },
  {
    id: 'f2l-basic-pair',
    category: 'f2l',
    titleKey: 'training.cases.f2l.basicPair.title',
    descriptionKey: 'training.cases.f2l.basicPair.description',
    tipKey: 'training.cases.f2l.basicPair.tip',
    algorithms: ["U R U' R'"],
  },
  {
    id: 'f2l-back-slot',
    category: 'f2l',
    titleKey: 'training.cases.f2l.backSlot.title',
    descriptionKey: 'training.cases.f2l.backSlot.description',
    tipKey: 'training.cases.f2l.backSlot.tip',
    algorithms: ["R U' R'"],
  },
  {
    id: 'f2l-edge-over',
    category: 'f2l',
    titleKey: 'training.cases.f2l.edgeOver.title',
    descriptionKey: 'training.cases.f2l.edgeOver.description',
    tipKey: 'training.cases.f2l.edgeOver.tip',
    algorithms: ["U' F' U F"],
  },
];
