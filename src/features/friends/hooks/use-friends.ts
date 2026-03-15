import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '@/shared/lib/supabase/client';
import {
  cancelFriendInvite,
  listFriendInvites,
  listFriends,
  removeFriend,
  resolveFriendCounterpart,
  respondToFriendInvite,
  sendFriendInvite,
} from '@/shared/lib/supabase/social';
import { useAuthStore } from '@/shared/store/auth-store';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { FriendInvite, Friendship } from '@/shared/types';

type Feedback = {
  type: 'success' | 'error';
  text: string;
} | null;

type ProfileMap = Map<
  string,
  {
    displayName: string | null;
    avatarUrl: string | null;
  }
>;

function formatCompactUserId(userId: string): string {
  if (userId.length <= 14) {
    return userId;
  }

  return `${userId.slice(0, 8)}…${userId.slice(-4)}`;
}

function getErrorKey(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'unknown';
}

export function useFriends() {
  const { t, language } = useI18nStore();
  const { isConfigured, status, user } = useAuthStore();

  const [invites, setInvites] = useState<FriendInvite[]>([]);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [profilesById, setProfilesById] = useState<ProfileMap>(new Map());
  const [targetUserId, setTargetUserId] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const client = useMemo(() => getSupabaseClient(), []);

  const isAuthenticated = status === 'authenticated' && !!user;
  const canManageFriends = Boolean(client && isConfigured && isAuthenticated && user);

  const fetchProfiles = useCallback(
    async (userIds: string[]): Promise<ProfileMap> => {
      if (!client || userIds.length === 0) {
        return new Map();
      }

      const { data, error } = await client
        .from('profiles')
        .select('user_id, display_name, avatar_url')
        .in('user_id', userIds);

      if (error) {
        return new Map();
      }

      return new Map(
        (data ?? []).map((profile) => [
          profile.user_id,
          {
            displayName: profile.display_name,
            avatarUrl: profile.avatar_url,
          },
        ]),
      );
    },
    [client],
  );

  const refreshFriends = useCallback(async () => {
    if (!client || !user || !canManageFriends) {
      setInvites([]);
      setFriends([]);
      setProfilesById(new Map());
      return;
    }

    setIsLoading(true);

    try {
      const [nextInvites, nextFriends] = await Promise.all([
        listFriendInvites(client, user.id),
        listFriends(client, user.id),
      ]);

      const relatedUserIds = new Set<string>();

      for (const invite of nextInvites) {
        const counterpartId = invite.senderId === user.id ? invite.receiverId : invite.senderId;
        relatedUserIds.add(counterpartId);
      }

      for (const friendship of nextFriends) {
        relatedUserIds.add(resolveFriendCounterpart(friendship, user.id));
      }

      const relatedProfiles = await fetchProfiles(Array.from(relatedUserIds));

      setInvites(nextInvites);
      setFriends(nextFriends);
      setProfilesById(relatedProfiles);
    } catch {
      setFeedback({
        type: 'error',
        text: t.socialHub.friends.messages.errorGeneric,
      });
    } finally {
      setIsLoading(false);
    }
  }, [canManageFriends, client, fetchProfiles, t.socialHub.friends.messages.errorGeneric, user]);

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setFeedback(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const incomingInvites = useMemo(() => {
    if (!user) {
      return [];
    }

    return invites.filter((invite) => invite.receiverId === user.id && invite.status === 'pending');
  }, [invites, user]);

  const outgoingInvites = useMemo(() => {
    if (!user) {
      return [];
    }

    return invites.filter((invite) => invite.senderId === user.id && invite.status === 'pending');
  }, [invites, user]);

  const friendsWithCounterpart = useMemo(() => {
    if (!user) {
      return [];
    }

    return friends.map((friendship) => {
      const counterpartId = resolveFriendCounterpart(friendship, user.id);
      return {
        friendship,
        counterpartId,
      };
    });
  }, [friends, user]);

  const resolveUserLabel = useCallback(
    (userId: string): string => {
      const profile = profilesById.get(userId);
      if (profile?.displayName && profile.displayName.trim().length > 0) {
        return profile.displayName;
      }

      return formatCompactUserId(userId);
    },
    [profilesById],
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

  const handleSendInvite = useCallback(async () => {
    if (!client || !user || !canManageFriends) {
      return;
    }

    const normalizedTarget = targetUserId.trim();

    if (!normalizedTarget) {
      setFeedback({ type: 'error', text: t.socialHub.friends.messages.targetRequired });
      return;
    }

    setIsSubmitting(true);

    try {
      await sendFriendInvite(client, user.id, normalizedTarget);
      setTargetUserId('');
      await refreshFriends();
      setFeedback({ type: 'success', text: t.socialHub.friends.messages.inviteSent });
    } catch (error) {
      const errorKey = getErrorKey(error);

      if (errorKey === 'invalid_friend_target') {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.invalidTarget });
      } else if (errorKey === 'friendship_already_exists') {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.alreadyFriends });
      } else if (errorKey === 'friend_invite_already_pending') {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.pendingInvite });
      } else {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.errorGeneric });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [
    canManageFriends,
    client,
    refreshFriends,
    t.socialHub.friends.messages.alreadyFriends,
    t.socialHub.friends.messages.errorGeneric,
    t.socialHub.friends.messages.invalidTarget,
    t.socialHub.friends.messages.inviteSent,
    t.socialHub.friends.messages.pendingInvite,
    t.socialHub.friends.messages.targetRequired,
    targetUserId,
    user,
  ]);

  const handleAcceptInvite = useCallback(
    async (inviteId: string) => {
      if (!client || !user || !canManageFriends) {
        return;
      }

      setIsSubmitting(true);

      try {
        await respondToFriendInvite(client, user.id, inviteId, 'accepted');
        await refreshFriends();
        setFeedback({ type: 'success', text: t.socialHub.friends.messages.inviteAccepted });
      } catch {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.errorGeneric });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canManageFriends,
      client,
      refreshFriends,
      t.socialHub.friends.messages.errorGeneric,
      t.socialHub.friends.messages.inviteAccepted,
      user,
    ],
  );

  const handleRejectInvite = useCallback(
    async (inviteId: string) => {
      if (!client || !user || !canManageFriends) {
        return;
      }

      setIsSubmitting(true);

      try {
        await respondToFriendInvite(client, user.id, inviteId, 'rejected');
        await refreshFriends();
        setFeedback({ type: 'success', text: t.socialHub.friends.messages.inviteRejected });
      } catch {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.errorGeneric });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canManageFriends,
      client,
      refreshFriends,
      t.socialHub.friends.messages.errorGeneric,
      t.socialHub.friends.messages.inviteRejected,
      user,
    ],
  );

  const handleCancelInvite = useCallback(
    async (inviteId: string) => {
      if (!client || !user || !canManageFriends) {
        return;
      }

      setIsSubmitting(true);

      try {
        await cancelFriendInvite(client, user.id, inviteId);
        await refreshFriends();
        setFeedback({ type: 'success', text: t.socialHub.friends.messages.inviteCancelled });
      } catch {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.errorGeneric });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canManageFriends,
      client,
      refreshFriends,
      t.socialHub.friends.messages.errorGeneric,
      t.socialHub.friends.messages.inviteCancelled,
      user,
    ],
  );

  const handleRemoveFriend = useCallback(
    async (friendUserId: string) => {
      if (!client || !user || !canManageFriends) {
        return;
      }

      setIsSubmitting(true);

      try {
        await removeFriend(client, user.id, friendUserId);
        await refreshFriends();
        setFeedback({ type: 'success', text: t.socialHub.friends.messages.friendRemoved });
      } catch {
        setFeedback({ type: 'error', text: t.socialHub.friends.messages.errorGeneric });
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      canManageFriends,
      client,
      refreshFriends,
      t.socialHub.friends.messages.errorGeneric,
      t.socialHub.friends.messages.friendRemoved,
      user,
    ],
  );

  return {
    t,
    user,
    isConfigured,
    isAuthenticated,
    canManageFriends,
    targetUserId,
    setTargetUserId,
    feedback,
    isLoading,
    isSubmitting,
    incomingInvites,
    outgoingInvites,
    friendsWithCounterpart,
    resolveUserLabel,
    formatDateTime,
    refreshFriends,
    handleSendInvite,
    handleAcceptInvite,
    handleRejectInvite,
    handleCancelInvite,
    handleRemoveFriend,
  };
}
