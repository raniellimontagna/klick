import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ShareLink,
  SharePayload,
  SharePreferences,
  ShareProfileVisibility,
  ShareRankingVisibility,
  ShareProgressSnapshot,
  ShareStatsSnapshot,
  ShareVisibility,
} from '@/shared/types';
import { createUuid } from '../utils/create-uuid/create-uuid';
import type { Database, Json } from './database';

type SharePreferencesRow = Database['public']['Tables']['share_preferences']['Row'];
type SharePreferencesInsert = Database['public']['Tables']['share_preferences']['Insert'];
type ShareLinksRow = Database['public']['Tables']['share_links']['Row'];
type ShareLinksInsert = Database['public']['Tables']['share_links']['Insert'];

const DEFAULT_PROFILE_VISIBILITY: ShareProfileVisibility = 'private';
const DEFAULT_RANKING_VISIBILITY: ShareRankingVisibility = 'friends';
const DEFAULT_SHARE_VISIBILITY: ShareVisibility = 'public';

function getNowIso(): string {
  return new Date().toISOString();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function toNumberOrNull(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

function parseStats(value: unknown): ShareStatsSnapshot {
  const statsRecord = asRecord(value);

  if (!statsRecord) {
    return {};
  }

  const nextStats: ShareStatsSnapshot = {};

  if ('single' in statsRecord) {
    nextStats.single = toNumberOrNull(statsRecord.single);
  }

  if ('ao5' in statsRecord) {
    nextStats.ao5 = toNumberOrNull(statsRecord.ao5);
  }

  if ('ao12' in statsRecord) {
    nextStats.ao12 = toNumberOrNull(statsRecord.ao12);
  }

  if ('bestAo5' in statsRecord) {
    nextStats.bestAo5 = toNumberOrNull(statsRecord.bestAo5);
  }

  if ('bestAo12' in statsRecord) {
    nextStats.bestAo12 = toNumberOrNull(statsRecord.bestAo12);
  }

  return nextStats;
}

function parseProgress(value: unknown): ShareProgressSnapshot | undefined {
  const progressRecord = asRecord(value);

  if (!progressRecord) {
    return undefined;
  }

  const level = toNumberOrNull(progressRecord.level);
  const xp = toNumberOrNull(progressRecord.xp);
  const currentStreak = toNumberOrNull(progressRecord.currentStreak);
  const bestStreak = toNumberOrNull(progressRecord.bestStreak);
  const weeklyGoalProgress = toNumberOrNull(progressRecord.weeklyGoalProgress);
  const weeklyGoalTarget = toNumberOrNull(progressRecord.weeklyGoalTarget);

  if (
    level === null ||
    xp === null ||
    currentStreak === null ||
    bestStreak === null ||
    weeklyGoalProgress === null ||
    weeklyGoalTarget === null
  ) {
    return undefined;
  }

  return {
    level,
    xp,
    currentStreak,
    bestStreak,
    weeklyGoalProgress,
    weeklyGoalTarget,
  };
}

function parseSharePayload(payload: Json): SharePayload {
  const record = asRecord(payload);

  if (!record) {
    return {
      version: 1,
      generatedAt: getNowIso(),
      sessionName: 'Klick Session',
      puzzleType: '3x3',
      profileVisibility: DEFAULT_PROFILE_VISIBILITY,
      stats: {},
    };
  }

  const generatedAt = typeof record.generatedAt === 'string' ? record.generatedAt : getNowIso();
  const sessionName = typeof record.sessionName === 'string' ? record.sessionName : 'Klick Session';

  const puzzleType: SharePayload['puzzleType'] =
    typeof record.puzzleType === 'string' &&
    ['3x3', '2x2', '4x4', '5x5', 'pyraminx', 'megaminx', 'skewb', 'square1'].includes(
      record.puzzleType,
    )
      ? (record.puzzleType as SharePayload['puzzleType'])
      : '3x3';

  const profileVisibility: ShareProfileVisibility =
    record.profileVisibility === 'public' || record.profileVisibility === 'friends'
      ? (record.profileVisibility as ShareProfileVisibility)
      : DEFAULT_PROFILE_VISIBILITY;

  const stats = parseStats(record.stats);
  const progress = parseProgress(record.progress);

  return {
    version: 1,
    generatedAt,
    sessionName,
    puzzleType,
    profileVisibility,
    stats,
    ...(progress ? { progress } : {}),
  };
}

function mapSharePreferences(row: SharePreferencesRow): SharePreferences {
  return {
    sharingEnabled: row.sharing_enabled,
    profileVisibility: row.profile_visibility,
    rankingVisibility: row.ranking_visibility,
    shareSingle: row.share_single,
    shareAverages: row.share_averages,
    shareProgress: row.share_progress,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapShareLink(row: ShareLinksRow): ShareLink {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    visibility: row.visibility,
    payload: parseSharePayload(row.payload),
    isActive: row.is_active,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createDefaultPreferences(nowIso = getNowIso()): SharePreferences {
  return {
    sharingEnabled: false,
    profileVisibility: DEFAULT_PROFILE_VISIBILITY,
    rankingVisibility: DEFAULT_RANKING_VISIBILITY,
    shareSingle: true,
    shareAverages: true,
    shareProgress: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function createShareSlug(): string {
  return createUuid().replace(/-/g, '').slice(0, 12);
}

export async function getSharePreferences(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<SharePreferences> {
  const { data, error } = await client
    .from('share_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data) {
    return mapSharePreferences(data);
  }

  const nowIso = getNowIso();

  const defaults: SharePreferencesInsert = {
    user_id: userId,
    sharing_enabled: false,
    profile_visibility: DEFAULT_PROFILE_VISIBILITY,
    ranking_visibility: DEFAULT_RANKING_VISIBILITY,
    share_single: true,
    share_averages: true,
    share_progress: true,
    created_at: nowIso,
    updated_at: nowIso,
  };

  const { data: insertedData, error: insertError } = await client
    .from('share_preferences')
    .insert(defaults)
    .select('*')
    .single();

  if (insertError) {
    throw insertError;
  }

  return mapSharePreferences(insertedData);
}

export async function upsertSharePreferences(
  client: SupabaseClient<Database>,
  userId: string,
  nextPreferences: Omit<SharePreferences, 'createdAt' | 'updatedAt'>,
): Promise<SharePreferences> {
  const nowIso = getNowIso();

  const payload: SharePreferencesInsert = {
    user_id: userId,
    sharing_enabled: nextPreferences.sharingEnabled,
    profile_visibility: nextPreferences.profileVisibility,
    ranking_visibility: nextPreferences.rankingVisibility,
    share_single: nextPreferences.shareSingle,
    share_averages: nextPreferences.shareAverages,
    share_progress: nextPreferences.shareProgress,
    updated_at: nowIso,
  };

  const { data, error } = await client
    .from('share_preferences')
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapSharePreferences(data);
}

export async function listOwnShareLinks(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<ShareLink[]> {
  const { data, error } = await client
    .from('share_links')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapShareLink);
}

export async function createPublicShareLink(
  client: SupabaseClient<Database>,
  userId: string,
  title: string,
  payload: SharePayload,
): Promise<ShareLink> {
  const nowIso = getNowIso();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const insertPayload: ShareLinksInsert = {
      user_id: userId,
      slug: createShareSlug(),
      title,
      visibility: DEFAULT_SHARE_VISIBILITY,
      payload: payload as unknown as Json,
      is_active: true,
      revoked_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    };

    const { data, error } = await client.from('share_links').insert(insertPayload).select('*').single();

    if (!error && data) {
      return mapShareLink(data);
    }

    if (error && error.code === '23505') {
      continue;
    }

    if (error) {
      throw error;
    }
  }

  throw new Error('failed_to_create_public_share_link');
}

export async function revokeShareLink(
  client: SupabaseClient<Database>,
  userId: string,
  shareLinkId: string,
): Promise<ShareLink> {
  const { data, error } = await client
    .from('share_links')
    .update({
      is_active: false,
      visibility: 'private',
      revoked_at: getNowIso(),
      updated_at: getNowIso(),
    })
    .eq('user_id', userId)
    .eq('id', shareLinkId)
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapShareLink(data);
}

export async function revokeAllShareLinks(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { error } = await client
    .from('share_links')
    .update({
      is_active: false,
      visibility: 'private',
      revoked_at: getNowIso(),
      updated_at: getNowIso(),
    })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    throw error;
  }
}

export async function getPublicShareLinkBySlug(
  client: SupabaseClient<Database>,
  slug: string,
): Promise<ShareLink | null> {
  const { data, error } = await client
    .from('share_links')
    .select('*')
    .eq('slug', slug)
    .eq('is_active', true)
    .eq('visibility', 'public')
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return mapShareLink(data);
}

export const shareDefaults = {
  createDefaultPreferences,
};
