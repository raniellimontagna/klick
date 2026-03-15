import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Settings } from '@/shared/types';

interface SettingsStore {
  settings: Settings;
  updatedAt: string;
  updateSettings: (settings: Partial<Settings>) => void;
  hydrateSettings: (settings: Settings, updatedAt?: string) => void;
}

const defaultSettings: Settings = {
  inspectionDuration: 15,
  soundsEnabled: false,
  autoInspectionPenalty: true,
  theme: 'dark',
};

function getNowIso(): string {
  return new Date().toISOString();
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: defaultSettings,
      updatedAt: getNowIso(),
      updateSettings: (newSettings): void => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
          updatedAt: getNowIso(),
        }));
      },
      hydrateSettings: (settings, updatedAt): void => {
        set({
          settings,
          updatedAt: updatedAt ?? getNowIso(),
        });
      },
    }),
    {
      name: 'klick-settings',
    },
  ),
);
