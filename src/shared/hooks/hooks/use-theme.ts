import { useEffect } from 'react';
import { useSettingsStore } from '@/shared/store/stores/settings-store';

export const useTheme = () => {
  const { settings, updateSettings } = useSettingsStore();

  useEffect(() => {
    const root = document.documentElement;

    if (settings.theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
  }, [settings.theme]);

  const toggleTheme = () => {
    updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' });
  };

  return {
    theme: settings.theme,
    toggleTheme,
    isDark: settings.theme === 'dark',
    isLight: settings.theme === 'light',
  };
};
