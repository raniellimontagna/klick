import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings } from '@/commons/types';

interface SettingsStore {
  settings: Settings;
  updateSettings: (settings: Partial<Settings>) => void;
}

const defaultSettings: Settings = {
  inspectionDuration: 15,
  soundsEnabled: false,
  autoInspectionPenalty: true,
  theme: 'dark',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
    }),
    {
      name: 'klick-settings',
    },
  ),
);
