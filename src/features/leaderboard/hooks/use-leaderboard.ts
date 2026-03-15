import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/shared/lib/supabase/client';
import { listLeaderboardEntries, syncOwnLeaderboardEntries } from '@/shared/lib/supabase/social';
import { useAuthStore } from '@/shared/store/auth-store';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { LeaderboardEntry, LeaderboardPeriod } from '@/shared/types';

type Feedback = {
  type: 'success' | 'error';
  text: string;
} | null;

function formatCompactUserId(userId: string): string {
  if (userId.length <= 14) {
    return userId;
  }

  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

export function useLeaderboard() {
  const { t, language } = useI18nStore();
  const { isConfigured, status, user } = useAuthStore();

  const [period, setPeriod] = useState<LeaderboardPeriod>('weekly');
  const [periodKey, setPeriodKey] = useState('');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const client = useMemo(() => getSupabaseClient(), []);

  const isAuthenticated = status === 'authenticated' && !!user;
  const canLoadLeaderboard = Boolean(client && isConfigured && isAuthenticated && user);

  const resolveUserLabel = useCallback(
    (entry: LeaderboardEntry): string => {
      if (user && entry.userId === user.id) {
        return `${t.socialHub.leaderboard.labels.you} • ${entry.displayName ?? formatCompactUserId(entry.userId)}`;
      }

      if (entry.displayName && entry.displayName.trim().length > 0) {
        return entry.displayName;
      }

      return formatCompactUserId(entry.userId);
    },
    [t.socialHub.leaderboard.labels.you, user],
  );

  const refreshLeaderboard = useCallback(async () => {
    if (!client || !user || !canLoadLeaderboard) {
      setEntries([]);
      setPeriodKey('');
      return;
    }

    setIsLoading(true);

    try {
      setIsSyncing(true);
      await syncOwnLeaderboardEntries(client, user.id);
      setIsSyncing(false);

      const response = await listLeaderboardEntries(client, period);
      setEntries(response.entries);
      setPeriodKey(response.leaderboard.periodKey);
    } catch {
      setFeedback({
        type: 'error',
        text: t.socialHub.leaderboard.messages.errorGeneric,
      });
    } finally {
      setIsLoading(false);
      setIsSyncing(false);
    }
  }, [canLoadLeaderboard, client, period, t.socialHub.leaderboard.messages.errorGeneric, user]);

  useEffect(() => {
    void refreshLeaderboard();
  }, [refreshLeaderboard]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const currentUserEntry = useMemo(() => {
    if (!user) {
      return null;
    }

    return entries.find((entry) => entry.userId === user.id) ?? null;
  }, [entries, user]);

  const formatPeriodKey = useCallback(
    (value: string): string => {
      if (!value) {
        return '--';
      }

      if (period === 'weekly') {
        return value;
      }

      const [year, month] = value.split('-');
      if (!year || !month) {
        return value;
      }

      return new Intl.DateTimeFormat(language, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(Date.UTC(Number(year), Number(month) - 1, 1)));
    },
    [language, period],
  );

  return {
    t,
    user,
    isConfigured,
    isAuthenticated,
    canLoadLeaderboard,
    period,
    setPeriod,
    periodKey,
    entries,
    currentUserEntry,
    feedback,
    isLoading,
    isSyncing,
    resolveUserLabel,
    formatPeriodKey,
    refreshLeaderboard,
  };
}
