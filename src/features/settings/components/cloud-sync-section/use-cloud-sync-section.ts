import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useAuthStore } from '@/shared/store/auth-store';

type Feedback = {
  type: 'success' | 'error';
  text: string;
} | null;

function getErrorText(error: string | undefined, fallback: string): string {
  if (!error) {
    return fallback;
  }

  if (error.includes('offline')) {
    return fallback;
  }

  if (error.includes('auth_required')) {
    return fallback;
  }

  if (error.includes('supabase_not_configured')) {
    return fallback;
  }

  return error;
}

export function useCloudSyncSection() {
  const { t, language } = useI18nStore();
  const {
    isConfigured,
    status,
    user,
    isSyncing,
    isMigrating,
    lastSyncAt,
    error,
    signInWithGoogle,
    sendMagicLink,
    signOut,
    syncNow,
  } = useAuthStore();

  const [email, setEmail] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeout = setTimeout(() => {
      setFeedback(null);
    }, 4500);

    return () => clearTimeout(timeout);
  }, [feedback]);

  const statusLabel = useMemo(() => {
    if (!isConfigured) {
      return t.settings.cloudSync.statusLocalOnly;
    }

    if (isSyncing) {
      return isMigrating ? t.settings.cloudSync.statusMigrating : t.settings.cloudSync.statusSyncing;
    }

    if (status === 'authenticated') {
      return t.settings.cloudSync.statusConnected;
    }

    if (status === 'error') {
      return t.settings.cloudSync.statusError;
    }

    if (status === 'idle') {
      return t.settings.cloudSync.statusChecking;
    }

    return t.settings.cloudSync.statusAnonymous;
  }, [isConfigured, isMigrating, isSyncing, status, t.settings.cloudSync]);

  const lastSyncLabel = useMemo(() => {
    if (!lastSyncAt) {
      return t.settings.cloudSync.lastSyncNever;
    }

    const date = new Date(lastSyncAt);

    return new Intl.DateTimeFormat(language, {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }, [language, lastSyncAt, t.settings.cloudSync.lastSyncNever]);

  const handleGoogleSignIn = async () => {
    const result = await signInWithGoogle();

    if (!result.success) {
      setFeedback({
        type: 'error',
        text: getErrorText(result.error, t.settings.cloudSync.errorFallback),
      });
    }
  };

  const handleMagicLinkSubmit = async (event: FormEvent) => {
    event.preventDefault();

    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      setFeedback({ type: 'error', text: t.settings.cloudSync.magicLinkRequired });
      return;
    }

    const result = await sendMagicLink(normalizedEmail);

    if (result.success) {
      setFeedback({
        type: 'success',
        text: t.settings.cloudSync.magicLinkSent,
      });
      setEmail('');
      return;
    }

    setFeedback({
      type: 'error',
      text: getErrorText(result.error, t.settings.cloudSync.errorFallback),
    });
  };

  const handleSyncNow = async () => {
    const result = await syncNow();

    if (result.success) {
      setFeedback({ type: 'success', text: t.settings.cloudSync.syncSuccess });
      return;
    }

    setFeedback({
      type: 'error',
      text: getErrorText(result.error, t.settings.cloudSync.syncError),
    });
  };

  const handleSignOut = async () => {
    const result = await signOut();

    if (result.success) {
      setFeedback({ type: 'success', text: t.settings.cloudSync.signOutSuccess });
      return;
    }

    setFeedback({
      type: 'error',
      text: getErrorText(result.error, t.settings.cloudSync.errorFallback),
    });
  };

  const canManageCloud = status === 'authenticated' && !!user;

  return {
    t,
    isConfigured,
    status,
    statusLabel,
    user,
    error,
    email,
    setEmail,
    feedback,
    isSyncing,
    canManageCloud,
    lastSyncLabel,
    handleGoogleSignIn,
    handleMagicLinkSubmit,
    handleSyncNow,
    handleSignOut,
  };
}
