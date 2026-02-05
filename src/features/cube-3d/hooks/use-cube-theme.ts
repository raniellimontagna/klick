import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type ColorTheme, THEME_PRESETS } from '../lib/cube-themes';

interface CubeThemeState {
  currentThemeId: string;
  customColors: Record<string, string> | null;

  // Actions
  setTheme: (themeId: string) => void;
  updateFaceColor: (faceKey: string, color: string) => void;
  resetToPreset: () => void;

  // Helpers
  getCurrentPalette: () => ColorTheme['colors'];
}

export const useCubeTheme = create<CubeThemeState>()(
  persist(
    (set, get) => ({
      currentThemeId: 'standard',
      customColors: null,

      setTheme: (themeId) => {
        set({ currentThemeId: themeId, customColors: null });
      },

      updateFaceColor: (faceKey, color) => {
        const currentPalette = get().getCurrentPalette();
        set((state) => ({
          customColors: {
            ...(state.customColors || currentPalette),
            [faceKey]: color,
          },
        }));
      },

      resetToPreset: () => {
        set({ customColors: null });
      },

      getCurrentPalette: () => {
        const { currentThemeId, customColors } = get();
        const preset = THEME_PRESETS.find((p) => p.id === currentThemeId) || THEME_PRESETS[0];

        if (customColors) {
          return { ...preset.colors, ...customColors };
        }

        return preset.colors;
      },
    }),
    {
      name: 'klick-cube-theme',
    },
  ),
);
