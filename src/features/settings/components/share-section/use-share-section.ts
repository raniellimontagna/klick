import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPublicShareLink,
  getSharePreferences,
  listOwnShareLinks,
  revokeAllShareLinks,
  revokeShareLink,
  upsertSharePreferences,
  shareDefaults,
} from '@/shared/lib/supabase/share';
import { getSupabaseClient } from '@/shared/lib/supabase/client';
import { useAuthStore } from '@/shared/store/auth-store';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useProgressStore } from '@/shared/store/progress-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type {
  ShareLink,
  SharePayload,
  SharePreferences,
  ShareProfileVisibility,
  ShareRankingVisibility,
} from '@/shared/types';

const visibilityOrder: ShareProfileVisibility[] = ['private', 'friends', 'public'];

function getNextVisibility(currentVisibility: ShareProfileVisibility): ShareProfileVisibility {
  const currentIndex = visibilityOrder.indexOf(currentVisibility);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % visibilityOrder.length;
  return visibilityOrder[nextIndex];
}

type Feedback = {
  type: 'success' | 'error';
  text: string;
} | null;

function createShareTitle(sessionName: string): string {
  const stamp = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return `${sessionName} • ${stamp}`;
}

async function writeClipboard(value: string): Promise<boolean> {
  if (!navigator?.clipboard?.writeText) {
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function useShareSection() {
  const { t, language } = useI18nStore();
  const { isConfigured, status, user } = useAuthStore();
  const sessionsState = useSessionsStore();
  const progressSummary = useProgressStore((state) => state.summary);

  const [preferences, setPreferences] = useState<SharePreferences>(() =>
    shareDefaults.createDefaultPreferences(),
  );
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const client = useMemo(() => getSupabaseClient(), []);

  const isAuthenticated = status === 'authenticated' && !!user;
  const canManageSharing = Boolean(client && isConfigured && isAuthenticated && user);

  const shareUrlBase = useMemo(() => {
    if (typeof window === 'undefined') {
      return '';
    }

    return window.location.origin;
  }, []);

  const activeSession = sessionsState.getActiveSession();

  const resolveShareUrl = useCallback(
    (slug: string): string => {
      return `${shareUrlBase}/share/${slug}`;
    },
    [shareUrlBase],
  );

  const loadSharingState = useCallback(async () => {
    if (!client || !user || !canManageSharing) {
      setLinks([]);
      return;
    }

    setIsLoading(true);

    try {
      const [nextPreferences, nextLinks] = await Promise.all([
        getSharePreferences(client, user.id),
        listOwnShareLinks(client, user.id),
      ]);

      setPreferences(nextPreferences);
      setLinks(nextLinks);
    } catch {
      setFeedback({
        type: 'error',
        text: t.settings.sharing.errors.generic,
      });
    } finally {
      setIsLoading(false);
    }
  }, [canManageSharing, client, t.settings.sharing.errors.generic, user]);

  useEffect(() => {
    void loadSharingState();
  }, [loadSharingState]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 4500);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const savePreferences = useCallback(
    async (
      nextPreferences: Omit<SharePreferences, 'createdAt' | 'updatedAt'>,
      successMessage?: string,
    ) => {
      if (!client || !user || !canManageSharing) {
        return;
      }

      setIsSaving(true);

      try {
        const persisted = await upsertSharePreferences(client, user.id, nextPreferences);
        setPreferences(persisted);

        if (!nextPreferences.sharingEnabled) {
          await revokeAllShareLinks(client, user.id);
          const refreshedLinks = await listOwnShareLinks(client, user.id);
          setLinks(refreshedLinks);
          setFeedback({
            type: 'success',
            text: t.settings.sharing.messages.revokedAll,
          });
          return;
        }

        if (successMessage) {
          setFeedback({ type: 'success', text: successMessage });
        }
      } catch {
        setFeedback({
          type: 'error',
          text: t.settings.sharing.errors.generic,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [canManageSharing, client, t.settings.sharing.errors.generic, t.settings.sharing.messages.revokedAll, user],
  );

  const updateSharingEnabled = useCallback(
    async (enabled: boolean) => {
      await savePreferences(
        {
          sharingEnabled: enabled,
          profileVisibility: preferences.profileVisibility,
          rankingVisibility: preferences.rankingVisibility,
          shareSingle: preferences.shareSingle,
          shareAverages: preferences.shareAverages,
          shareProgress: preferences.shareProgress,
        },
        t.settings.sharing.messages.updated,
      );
    },
    [preferences, savePreferences, t.settings.sharing.messages.updated],
  );

  const updateProfileVisibility = useCallback(
    async (visibility: ShareProfileVisibility) => {
      await savePreferences(
        {
          sharingEnabled: preferences.sharingEnabled,
          profileVisibility: visibility,
          rankingVisibility: preferences.rankingVisibility,
          shareSingle: preferences.shareSingle,
          shareAverages: preferences.shareAverages,
          shareProgress: preferences.shareProgress,
        },
        t.settings.sharing.messages.updated,
      );
    },
    [preferences, savePreferences, t.settings.sharing.messages.updated],
  );

  const cycleProfileVisibility = useCallback(async () => {
    await updateProfileVisibility(getNextVisibility(preferences.profileVisibility));
  }, [preferences.profileVisibility, updateProfileVisibility]);

  const updateRankingVisibility = useCallback(
    async (visibility: ShareRankingVisibility) => {
      await savePreferences(
        {
          sharingEnabled: preferences.sharingEnabled,
          profileVisibility: preferences.profileVisibility,
          rankingVisibility: visibility,
          shareSingle: preferences.shareSingle,
          shareAverages: preferences.shareAverages,
          shareProgress: preferences.shareProgress,
        },
        t.settings.sharing.messages.updated,
      );
    },
    [preferences, savePreferences, t.settings.sharing.messages.updated],
  );

  const cycleRankingVisibility = useCallback(async () => {
    await updateRankingVisibility(getNextVisibility(preferences.rankingVisibility));
  }, [preferences.rankingVisibility, updateRankingVisibility]);

  const updateMetricFlag = useCallback(
    async (field: 'shareSingle' | 'shareAverages' | 'shareProgress', value: boolean) => {
      await savePreferences(
        {
          sharingEnabled: preferences.sharingEnabled,
          profileVisibility: preferences.profileVisibility,
          rankingVisibility: preferences.rankingVisibility,
          shareSingle: field === 'shareSingle' ? value : preferences.shareSingle,
          shareAverages: field === 'shareAverages' ? value : preferences.shareAverages,
          shareProgress: field === 'shareProgress' ? value : preferences.shareProgress,
        },
        t.settings.sharing.messages.updated,
      );
    },
    [preferences, savePreferences, t.settings.sharing.messages.updated],
  );

  const buildPayload = useCallback((): SharePayload | null => {
    const session = sessionsState.getActiveSession();

    if (!session) {
      return null;
    }

    const stats: SharePayload['stats'] = {};

    if (preferences.shareSingle) {
      const single = sessionsState.getSingle();
      stats.single = single.isDNF ? null : single.value;
    }

    if (preferences.shareAverages) {
      const ao5 = sessionsState.getAo5();
      const ao12 = sessionsState.getAo12();
      const bestAo5 = sessionsState.getBestAo5();
      const bestAo12 = sessionsState.getBestAo12();

      stats.ao5 = ao5 ? (ao5.isDNF ? null : ao5.value) : null;
      stats.ao12 = ao12 ? (ao12.isDNF ? null : ao12.value) : null;
      stats.bestAo5 = bestAo5 ? (bestAo5.isDNF ? null : bestAo5.value) : null;
      stats.bestAo12 = bestAo12 ? (bestAo12.isDNF ? null : bestAo12.value) : null;
    }

    const hasStatsToShare = Object.keys(stats).length > 0;
    const hasProgressToShare = preferences.shareProgress;

    if (!hasStatsToShare && !hasProgressToShare) {
      return null;
    }

    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      sessionName: session.name,
      puzzleType: session.puzzleType,
      profileVisibility: preferences.profileVisibility,
      stats,
      ...(hasProgressToShare
        ? {
            progress: {
              level: progressSummary.level,
              xp: progressSummary.totalXp,
              currentStreak: progressSummary.currentStreak,
              bestStreak: progressSummary.bestStreak,
              weeklyGoalProgress: progressSummary.weeklySolveCount,
              weeklyGoalTarget: progressSummary.weeklySolveTarget,
            },
          }
        : {}),
    };
  }, [preferences, progressSummary, sessionsState]);

  const handleCreateShareLink = useCallback(async () => {
    if (!client || !user || !canManageSharing) {
      return;
    }

    if (!preferences.sharingEnabled) {
      setFeedback({
        type: 'error',
        text: t.settings.sharing.errors.sharingDisabled,
      });
      return;
    }

    const payload = buildPayload();

    if (!payload) {
      setFeedback({
        type: 'error',
        text: t.settings.sharing.errors.noData,
      });
      return;
    }

    setIsSaving(true);

    try {
      const created = await createPublicShareLink(
        client,
        user.id,
        createShareTitle(payload.sessionName),
        payload,
      );

      setLinks((previous) => [created, ...previous]);

      const copied = await writeClipboard(resolveShareUrl(created.slug));

      setFeedback({
        type: 'success',
        text: copied ? t.settings.sharing.messages.createdAndCopied : t.settings.sharing.messages.created,
      });
    } catch {
      setFeedback({
        type: 'error',
        text: t.settings.sharing.errors.generic,
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    buildPayload,
    canManageSharing,
    client,
    preferences.sharingEnabled,
    resolveShareUrl,
    t.settings.sharing.errors.generic,
    t.settings.sharing.errors.noData,
    t.settings.sharing.errors.sharingDisabled,
    t.settings.sharing.messages.created,
    t.settings.sharing.messages.createdAndCopied,
    user,
  ]);

  const handleCopyShareLink = useCallback(
    async (slug: string) => {
      const copied = await writeClipboard(resolveShareUrl(slug));

      setFeedback({
        type: copied ? 'success' : 'error',
        text: copied ? t.settings.sharing.messages.copied : t.settings.sharing.errors.copy,
      });
    },
    [resolveShareUrl, t.settings.sharing.errors.copy, t.settings.sharing.messages.copied],
  );

  const handleRevokeShareLink = useCallback(
    async (shareLinkId: string) => {
      if (!client || !user || !canManageSharing) {
        return;
      }

      setIsSaving(true);

      try {
        const revokedLink = await revokeShareLink(client, user.id, shareLinkId);

        setLinks((currentLinks) =>
          currentLinks.map((link) => (link.id === revokedLink.id ? revokedLink : link)),
        );

        setFeedback({
          type: 'success',
          text: t.settings.sharing.messages.revoked,
        });
      } catch {
        setFeedback({
          type: 'error',
          text: t.settings.sharing.errors.generic,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [canManageSharing, client, t.settings.sharing.errors.generic, t.settings.sharing.messages.revoked, user],
  );

  const formatDateTime = useCallback(
    (isoDate: string): string => {
      return new Intl.DateTimeFormat(language, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(isoDate));
    },
    [language],
  );

  return {
    t,
    isConfigured,
    isAuthenticated,
    canManageSharing,
    preferences,
    links,
    feedback,
    isLoading,
    isSaving,
    activeSession,
    resolveShareUrl,
    formatDateTime,
    updateSharingEnabled,
    updateProfileVisibility,
    cycleProfileVisibility,
    updateRankingVisibility,
    cycleRankingVisibility,
    updateMetricFlag,
    handleCreateShareLink,
    handleCopyShareLink,
    handleRevokeShareLink,
  };
}
