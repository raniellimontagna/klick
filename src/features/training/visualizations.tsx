import type { CubeVisualizationConfig } from '@/shared/components/cube-visualizer';
import { CUBE_COLORS } from '@/shared/components/cube-visualizer';

const { YELLOW } = CUBE_COLORS;

/**
 * Exemplo de configurações de visualização para casos de treino
 * Pode ser expandido com mais casos PLL, OLL, F2L, etc.
 */

export const trainingVisualizations: Record<string, CubeVisualizationConfig> = {
  // PLL Cases
  'pll-t-perm': {
    title: 'T-Perm',
    subtitle: "R U R' U' R' F R2 U' R' U' R U R' F'",
    gradient: 'from-purple-500/10 to-blue-500/10',
    faces: [
      {
        colors: [YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW],
        label: 'Topo',
      },
    ],
    tip: 'Use movimentos amplos com R e mantenha o punho firme para evitar pausas',
  },

  'pll-j-perm': {
    title: 'J-Perm',
    subtitle: "R U R' F' R U R' U' R' F R2 U' R'",
    gradient: 'from-blue-500/10 to-cyan-500/10',
    faces: [
      {
        colors: [YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW],
        label: 'Topo',
      },
    ],
    tip: "O início em F' prepara o bloco; mantenha o ritmo e planeje o U final",
  },

  'pll-z-perm': {
    title: 'Z-Perm',
    subtitle: "M2 U M2 U M' U2 M2 U2 M'",
    gradient: 'from-indigo-500/10 to-purple-500/10',
    faces: [
      {
        colors: [YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW, YELLOW],
        label: 'Topo',
      },
    ],
    tip: 'Priorize camadas M suaves e ritmo constante para não travar a execução',
  },

  // OLL Cases
  'oll-sune': {
    title: 'Sune',
    subtitle: "R U R' U R U2 R'",
    gradient: 'from-yellow-500/10 to-orange-500/10',
    algorithms: [
      { move: 'R', description: '90° horário' },
      { move: 'U', description: 'Topo horário' },
      { move: "R'", description: '90° anti-horário' },
      { move: 'U', description: 'Topo horário' },
      { move: 'R', description: '90° horário' },
      { move: 'U2', description: 'Topo 180°' },
      { move: "R'", description: '90° anti-horário' },
    ],
    tip: "Treine o gatilho R U R' e mantenha o cotovelo parado para ganhar velocidade",
  },

  'oll-antisune': {
    title: 'Anti-Sune',
    subtitle: "R' U' R U' R' U2 R",
    gradient: 'from-orange-500/10 to-red-500/10',
    algorithms: [
      { move: "R'", description: '90° anti-horário' },
      { move: "U'", description: 'Topo anti-horário' },
      { move: 'R', description: '90° horário' },
      { move: "U'", description: 'Topo anti-horário' },
      { move: "R'", description: '90° anti-horário' },
      { move: 'U2', description: 'Topo 180°' },
      { move: 'R', description: '90° horário' },
    ],
    tip: 'Use o polegar esquerdo para estabilizar e visualize o padrão antes de executar',
  },

  'oll-h': {
    title: 'H-Pattern',
    subtitle: "F R U R' U' F' f R U R' U' f'",
    gradient: 'from-pink-500/10 to-purple-500/10',
    tip: "Execute o bloco F...f' sem pausar; pense em duas metades fluidas",
  },

  // F2L Cases
  'f2l-basic-pair': {
    title: 'Par Básico Frontal',
    subtitle: "U R U' R'",
    gradient: 'from-green-500/10 to-emerald-500/10',
    algorithms: [
      { move: 'U', description: 'Setup' },
      { move: 'R', description: 'Inserir' },
      { move: "U'", description: 'Desfazer setup' },
      { move: "R'", description: 'Completar' },
    ],
    tip: 'Use U antes de inserir para alinhar o par e evitar giros desnecessários',
  },

  'f2l-back-slot': {
    title: 'Inserção Slot Traseiro',
    subtitle: "R U' R'",
    gradient: 'from-teal-500/10 to-cyan-500/10',
    algorithms: [
      { move: 'R', description: 'Abrir slot' },
      { move: "U'", description: 'Posicionar' },
      { move: "R'", description: 'Inserir' },
    ],
    tip: "Visualize o slot enquanto executa R U' R'; mantenha o punho solto",
  },

  'f2l-edge-over': {
    title: 'Aresta sobre o Slot',
    subtitle: "U' F' U F",
    gradient: 'from-lime-500/10 to-green-500/10',
    algorithms: [
      { move: "U'", description: 'Setup' },
      { move: "F'", description: 'Trazer aresta' },
      { move: 'U', description: 'Alinhar' },
      { move: 'F', description: 'Inserir' },
    ],
    tip: "Use U' F' para criar o par e devolva a face frontal com controle",
  },
};

/**
 * Obter visualização de treino por ID de caso
 */
export function getTrainingVisualization(caseId: string): CubeVisualizationConfig | null {
  return trainingVisualizations[caseId] || null;
}
