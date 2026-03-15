import type { Session as SupabaseSession, Subscription, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import type { Language } from '@/shared/config/i18n/translations';
import { useI18nStore } from './i18n-store';
import { useProgressStore } from './progress-store';
import { useSessionsStore } from './sessions-store';
import { useSettingsStore } from './settings-store';
import { getSupabaseClient } from '@/shared/lib/supabase/client';
import { AUTH_CALLBACK_PATH, supabaseEnv } from '@/shared/lib/supabase/env';
import { ensureUserProfile, syncUserCloudData } from '@/shared/lib/supabase/sync';

type AuthStatus = 'idle' | 'anonymous' | 'authenticated' | 'error';

interface AuthUser {
  id: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface ActionResult {
  success: boolean;
  error?: string;
}

interface AuthStore {
  isConfigured: boolean;
  status: AuthStatus;
  user: AuthUser | null;
  lastSyncAt: string | null;
  isSyncing: boolean;
  isMigrating: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  refreshSession: () => Promise<void>;
  signInWithGoogle: () => Promise<ActionResult>;
  sendMagicLink: (email: string) => Promise<ActionResult>;
  signOut: () => Promise<ActionResult>;
  syncNow: () => Promise<ActionResult>;
}

let subscription: Subscription | null = null;
let initialized = false;

function getSafeRedirectUrl(path = AUTH_CALLBACK_PATH): string {
  if (typeof window === 'undefined') {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

function mapAuthUser(user: User): AuthUser {
  const metadata = user.user_metadata ?? {};

  return {
    id: user.id,
    email: user.email ?? null,
    displayName:
      typeof metadata.full_name === 'string'
        ? metadata.full_name
        : typeof metadata.name === 'string'
          ? metadata.name
          : null,
    avatarUrl: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
  };
}

async function applyAuthenticatedUser(session: SupabaseSession): Promise<void> {
  const client = getSupabaseClient();

  if (!client) {
    return;
  }

  await ensureUserProfile(client, session.user);

  useAuthStore.setState({
    status: 'authenticated',
    user: mapAuthUser(session.user),
    error: null,
  });
}

async function applySession(session: SupabaseSession | null): Promise<void> {
  if (!session?.user) {
    useAuthStore.setState({
      status: 'anonymous',
      user: null,
      error: null,
      isSyncing: false,
      isMigrating: false,
    });
    return;
  }

  await applyAuthenticatedUser(session);
  await useAuthStore.getState().syncNow();
}

export const useAuthStore = create<AuthStore>()((set, get) => ({
  isConfigured: supabaseEnv.isConfigured,
  status: supabaseEnv.isConfigured ? 'idle' : 'anonymous',
  user: null,
  lastSyncAt: null,
  isSyncing: false,
  isMigrating: false,
  error: null,

  initialize: async (): Promise<void> => {
    const client = getSupabaseClient();

    if (!client) {
      set({
        isConfigured: false,
        status: 'anonymous',
      });
      return;
    }

    set({ isConfigured: true });

    if (!subscription) {
      const authSubscription = client.auth.onAuthStateChange((_event, session) => {
        void applySession(session);
      });

      subscription = authSubscription.data.subscription;
    }

    if (initialized) {
      return;
    }

    initialized = true;
    await get().refreshSession();
  },

  refreshSession: async (): Promise<void> => {
    const client = getSupabaseClient();

    if (!client) {
      set({
        isConfigured: false,
        status: 'anonymous',
      });
      return;
    }

    set({ status: 'idle', error: null });

    const { data, error } = await client.auth.getSession();

    if (error) {
      set({
        status: 'error',
        error: error.message,
      });
      return;
    }

    await applySession(data.session);
  },

  signInWithGoogle: async (): Promise<ActionResult> => {
    const client = getSupabaseClient();

    if (!client) {
      return {
        success: false,
        error: 'supabase_not_configured',
      };
    }

    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getSafeRedirectUrl(),
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      set({ error: error.message, status: 'anonymous' });
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  },

  sendMagicLink: async (email: string): Promise<ActionResult> => {
    const client = getSupabaseClient();

    if (!client) {
      return {
        success: false,
        error: 'supabase_not_configured',
      };
    }

    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: getSafeRedirectUrl(),
      },
    });

    if (error) {
      set({ error: error.message, status: 'anonymous' });
      return {
        success: false,
        error: error.message,
      };
    }

    return { success: true };
  },

  signOut: async (): Promise<ActionResult> => {
    const client = getSupabaseClient();

    if (!client) {
      return {
        success: false,
        error: 'supabase_not_configured',
      };
    }

    const { error } = await client.auth.signOut();

    if (error) {
      set({ error: error.message, status: 'authenticated' });
      return {
        success: false,
        error: error.message,
      };
    }

    set({
      status: 'anonymous',
      user: null,
      error: null,
      isSyncing: false,
      isMigrating: false,
    });

    return { success: true };
  },

  syncNow: async (): Promise<ActionResult> => {
    const client = getSupabaseClient();
    const state = get();

    if (!client || !state.user) {
      return { success: false, error: 'auth_required' };
    }

    if (state.isSyncing) {
      return { success: true };
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { success: false, error: 'offline' };
    }

    const sessionsState = useSessionsStore.getState();
    const settingsState = useSettingsStore.getState();
    const progressState = useProgressStore.getState();
    const i18nState = useI18nStore.getState();

    const isFirstSync = state.lastSyncAt === null;

    set({
      isSyncing: true,
      isMigrating: isFirstSync,
      error: null,
    });

    try {
      const syncResult = await syncUserCloudData(client, state.user.id, {
        sessions: sessionsState.sessions,
        activeSessionId: sessionsState.activeSessionId,
        settings: settingsState.settings,
        settingsUpdatedAt: settingsState.updatedAt,
        language: i18nState.language,
        progress: {
          timezone: progressState.timezone,
          challenges: progressState.challenges,
          summary: progressState.summary,
          updatedAt: progressState.updatedAt,
        },
      });

      useSessionsStore.getState().hydrateSessions(syncResult.sessions, syncResult.activeSessionId);
      useSettingsStore.getState().hydrateSettings(syncResult.settings, syncResult.settingsUpdatedAt);
      useProgressStore.getState().hydrateProgress(syncResult.progress);
      useProgressStore
        .getState()
        .evaluateFromSessions(useSessionsStore.getState().sessions, {
          timezone: syncResult.progress.timezone,
        });

      const nextLanguage = syncResult.language as Language;
      if (nextLanguage !== i18nState.language) {
        i18nState.setLanguage(nextLanguage);
      }

      set({
        status: 'authenticated',
        lastSyncAt: syncResult.syncedAt,
        isSyncing: false,
        isMigrating: false,
        error: null,
      });

      return { success: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'sync_failed';

      set({
        status: 'authenticated',
        error: message,
        isSyncing: false,
        isMigrating: false,
      });

      return {
        success: false,
        error: message,
      };
    }
  },
}));
