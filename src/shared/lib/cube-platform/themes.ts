import { CUBE_3D_COLORS } from './types';

export type ColorTheme = {
  id: string;
  name: string;
  colors: {
    UP: string;
    DOWN: string;
    LEFT: string;
    RIGHT: string;
    FRONT: string;
    BACK: string;
    BLACK: string;
  };
};

export const THEME_PRESETS: ColorTheme[] = [
  {
    id: 'standard',
    name: 'Standard',
    colors: {
      UP: CUBE_3D_COLORS.WHITE,
      DOWN: CUBE_3D_COLORS.YELLOW,
      LEFT: CUBE_3D_COLORS.ORANGE,
      RIGHT: CUBE_3D_COLORS.RED,
      FRONT: CUBE_3D_COLORS.GREEN,
      BACK: CUBE_3D_COLORS.BLUE,
      BLACK: CUBE_3D_COLORS.BLACK,
    },
  },
  {
    id: 'pastel',
    name: 'Pastel',
    colors: {
      UP: '#F8F9FA',
      DOWN: '#FFF3BF',
      LEFT: '#FFD8A8',
      RIGHT: '#FFC9C9',
      FRONT: '#D3F9D8',
      BACK: '#D0EBFF',
      BLACK: '#212529',
    },
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    colors: {
      UP: '#00F3FF',
      DOWN: '#FF00FF',
      LEFT: '#FFE600',
      RIGHT: '#FF003C',
      FRONT: '#00FF41',
      BACK: '#3A00FF',
      BLACK: '#080808',
    },
  },
  {
    id: 'high-contrast',
    name: 'High Contrast',
    colors: {
      UP: '#FFFFFF',
      DOWN: '#FFFF00',
      LEFT: '#FF8800',
      RIGHT: '#FF0000',
      FRONT: '#00FF00',
      BACK: '#0000FF',
      BLACK: '#000000',
    },
  },
  {
    id: 'ocean',
    name: 'Ocean Depth',
    colors: {
      UP: '#E0F7FA', // Surface foam
      DOWN: '#006064', // Deep abyss
      LEFT: '#00BCD4', // Cyan water
      RIGHT: '#0288D1', // Medium blue
      FRONT: '#B2EBF2', // Light aqua
      BACK: '#01579B', // Dark blue
      BLACK: '#001015', // Dark sea floor
    },
  },
  {
    id: 'forest',
    name: 'Deep Forest',
    colors: {
      UP: '#DCEDC8', // Light leaves
      DOWN: '#33691E', // Dark moss
      LEFT: '#8BC34A', // Fresh grass
      RIGHT: '#558B2F', // Olive
      FRONT: '#C5E1A5', // Pale green
      BACK: '#2E7D32', // Emerald
      BLACK: '#1B2E05', // Dark bark
    },
  },
  {
    id: 'sunset',
    name: 'Sunset Vibe',
    colors: {
      UP: '#FFECB3', // Late sun
      DOWN: '#3E2723', // Earth
      LEFT: '#FF7043', // Deep Orange
      RIGHT: '#D84315', // Burnt Sienna
      FRONT: '#FFAB91', // Peach
      BACK: '#BF360C', // Dark rust
      BLACK: '#260E04', // Silhouette
    },
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    colors: {
      UP: '#F5F5F5',
      DOWN: '#212121',
      LEFT: '#BDBDBD',
      RIGHT: '#757575',
      FRONT: '#E0E0E0',
      BACK: '#424242',
      BLACK: '#000000',
    },
  },
  {
    id: 'neon',
    name: 'Neon Night',
    colors: {
      UP: '#FFFFFF',
      DOWN: '#F0F',
      LEFT: '#0FF',
      RIGHT: '#F00',
      FRONT: '#0F0',
      BACK: '#00F',
      BLACK: '#111111',
    },
  },
];
