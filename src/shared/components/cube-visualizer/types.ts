export const CUBE_COLORS = {
  WHITE: '#f0f0f0',
  YELLOW: '#ffd500',
  RED: '#ff3838',
  BLUE: '#0051ba',
  ORANGE: '#ff8c00',
  GREEN: '#00d800',
  GRAY: '#404040',
} as const;

export type CubeColor = (typeof CUBE_COLORS)[keyof typeof CUBE_COLORS];

export interface CubeFaceData {
  colors: CubeColor[];
  label?: string;
}

export interface AlgorithmData {
  move: string;
  description?: string;
}

export interface CubeVisualizationConfig {
  title?: string;
  subtitle?: string;
  icon?: string;
  gradient?: string;
  faces?: CubeFaceData[];
  algorithms?: AlgorithmData[];
  tip?: string;
  content?: React.ReactNode;
}
