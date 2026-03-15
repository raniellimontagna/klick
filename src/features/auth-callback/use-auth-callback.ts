import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useAuthStore } from '@/shared/store/auth-store';

function resolveSafeNext(nextParam: string | null): string {
  if (!nextParam) {
    return '/';
  }

  if (!nextParam.startsWith('/')) {
    return '/';
  }

  if (nextParam.startsWith('//')) {
    return '/';
  }

  return nextParam;
}

export function useAuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18nStore();
  const [error, setError] = useState<string | null>(null);

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return resolveSafeNext(params.get('next'));
  }, [location.search]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const auth = useAuthStore.getState();

      await auth.initialize();
      await auth.refreshSession();

      const syncResult = await useAuthStore.getState().syncNow();

      if (!mounted) {
        return;
      }

      if (!syncResult.success && syncResult.error !== 'auth_required') {
        setError(syncResult.error ?? t.auth.callback.errorUnknown);
        return;
      }

      navigate(nextPath, { replace: true });
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [navigate, nextPath, t.auth.callback.errorUnknown]);

  return {
    error,
    t,
  };
}
