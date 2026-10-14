// Tipos da trilha (spec 5.1): o conteúdo das aulas e os casos do treino. Só tipos; em tempo de execução não sobra nada daqui.

export type TrailStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8; // índice em profile.trail
export type CaseSet = 'oll2' | 'pll2' | 'f2l';

// O que um estado do cubo já cumpre (os testes conferem com o cubing.js). A segunda camada da aula 3 é o 'f2l' (as duas primeiras
// camadas inteiras) e a última camada é o 'solved'. 'llEdges' e 'llCorners' valem com um giro de cima.
export type Stage = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'yellowCross' | 'llEdges' | 'llCorners' | 'oll' | 'solved';

// As peças em destaque; o resto fica apagado ou cinza (maskOrbits, em frame.ts). 'pair' é a figura do treino de F2L.
export type MaskKind = 'daisy' | 'cross' | 'firstLayer' | 'f2l' | 'eoll' | 'oll' | 'pll' | 'll' | 'pair';

// O ângulo do cubo: 3D de cima, a camada de cima chapada ('top') ou 3D por baixo ('below', para ver a cruz branca).
export type CubeAngle = '3D' | 'top' | 'below';

export interface LessonCube {
  setup: string; // do resolvido (amarelo em cima, verde na frente) ao estado que o passo mostra
  alg?: string; // o que o passo toca; sem ele, o cubo só mostra o estado
  view: CubeAngle;
  mask?: MaskKind;
  from?: Stage; // o que o estado do setup já cumpre
  ends?: Stage; // o que setup + alg cumpre, e o setup sozinho não
}

export interface LessonPart {
  title: string;
  text: string; // 2 ou 3 frases
  tip?: string;
  cube?: LessonCube;
}

export interface Lesson {
  step: TrailStep;
  cases?: CaseSet; // etapas 7 a 9: o fim da aula oferece "Treinar os casos"
  parts: LessonPart[]; // de 4 a 8
}

export interface TrainCase {
  id: string; // 'oll2-sune', 'pll2-t', 'f2l-01'…; único em todos os conjuntos
  set: CaseSet;
  name: string;
  recog: string; // dica de reconhecimento
  algs: string[]; // de 1 a 3; o primeiro é o padrão
}
