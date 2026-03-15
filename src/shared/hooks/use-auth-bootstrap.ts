import { useEffect } from 'react';
import { useAuthStore } from '@/shared/store/auth-store';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useProgressStore } from '@/shared/store/progress-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { useSettingsStore } from '@/shared/store/settings-store';

const SYNC_DEBOUNCE_MS = 1200;

export function useAuthBootstrap() {
  const initialize = useAuthStore((state) => state.initialize);
  const status = useAuthStore((state) => state.status);
  const isConfigured = useAuthStore((state) => state.isConfigured);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  useEffect(() => {
    if (!isConfigured || status !== 'authenticated') {
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleSync = () => {
      const authState = useAuthStore.getState();

      if (authState.status !== 'authenticated' || authState.isSyncing) {
        return;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        return;
      }

      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(() => {
        void useAuthStore.getState().syncNow();
      }, SYNC_DEBOUNCE_MS);
    };

    void useAuthStore.getState().syncNow();

    const unsubscribeSessions = useSessionsStore.subscribe(() => {
      scheduleSync();
    });

    const unsubscribeSettings = useSettingsStore.subscribe(() => {
      scheduleSync();
    });

    const unsubscribeI18n = useI18nStore.subscribe(() => {
      scheduleSync();
    });

    const unsubscribeProgress = useProgressStore.subscribe(() => {
      scheduleSync();
    });

    const handleOnline = () => {
      scheduleSync();
    };

    window.addEventListener('online', handleOnline);

    return () => {
      unsubscribeSessions();
      unsubscribeSettings();
      unsubscribeI18n();
      unsubscribeProgress();

      window.removeEventListener('online', handleOnline);

      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [isConfigured, status]);
}
