import { useEffect } from 'react';
import { useProgressStore } from '@/shared/store/progress-store';
import { useSessionsStore } from '@/shared/store/sessions-store';

const PROGRESS_REFRESH_MS = 60_000;

export function useProgressBootstrap() {
  const evaluateFromSessions = useProgressStore((state) => state.evaluateFromSessions);

  useEffect(() => {
    const evaluate = () => {
      const sessions = useSessionsStore.getState().sessions;
      evaluateFromSessions(sessions);
    };

    evaluate();

    const unsubscribeSessions = useSessionsStore.subscribe((state) => {
      evaluateFromSessions(state.sessions);
    });

    const interval = window.setInterval(evaluate, PROGRESS_REFRESH_MS);

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        evaluate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeSessions();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [evaluateFromSessions]);
}
