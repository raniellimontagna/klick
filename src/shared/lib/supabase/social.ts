import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  FriendInvite,
  FriendInviteStatus,
  Friendship,
  Leaderboard,
  LeaderboardEntry,
  LeaderboardMetrics,
  LeaderboardPeriod,
} from '@/shared/types';
import type { Database } from './database';

const MILLISECONDS_PER_DAY = 86_400_000;

type FriendInviteRow = Database['public']['Tables']['friend_invites']['Row'];
type FriendInviteInsert = Database['public']['Tables']['friend_invites']['Insert'];
type FriendshipRow = Database['public']['Tables']['friends']['Row'];
type LeaderboardRow = Database['public']['Tables']['leaderboards']['Row'];
type LeaderboardInsert = Database['public']['Tables']['leaderboards']['Insert'];
type LeaderboardEntryRow = Database['public']['Tables']['leaderboard_entries']['Row'];
type LeaderboardEntryInsert = Database['public']['Tables']['leaderboard_entries']['Insert'];
type SolveRow = Database['public']['Tables']['solves']['Row'];
type ProfileRow = Database['public']['Tables']['profiles']['Row'];
type SolveMetricsRow = Pick<SolveRow, 'effective_ms' | 'penalty' | 'time_ms'>;

function getNowIso(): string {
  return new Date().toISOString();
}

function toCanonicalFriendPair(userA: string, userB: string): { userId: string; friendId: string } {
  return userA < userB
    ? { userId: userA, friendId: userB }
    : {
        userId: userB,
        friendId: userA,
      };
}

function mapFriendInvite(row: FriendInviteRow): FriendInvite {
  return {
    id: row.id,
    senderId: row.sender_id,
    receiverId: row.receiver_id,
    status: row.status,
    respondedAt: row.responded_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFriendship(row: FriendshipRow): Friendship {
  return {
    id: row.id,
    userId: row.user_id,
    friendId: row.friend_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLeaderboard(row: LeaderboardRow): Leaderboard {
  return {
    id: row.id,
    periodType: row.period_type,
    periodKey: row.period_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLeaderboardEntry(
  row: LeaderboardEntryRow,
  profileMap: Map<string, Pick<ProfileRow, 'display_name' | 'avatar_url'>>,
): LeaderboardEntry {
  const profile = profileMap.get(row.user_id);

  return {
    id: row.id,
    leaderboardId: row.leaderboard_id,
    userId: row.user_id,
    displayName: profile?.display_name ?? null,
    avatarUrl: profile?.avatar_url ?? null,
    bestSingleMs: row.best_single_ms,
    bestAo5Ms: row.best_ao5_ms,
    bestAo12Ms: row.best_ao12_ms,
    consistencyScore: row.consistency_score,
    solveCount: row.solve_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveSolveEffectiveMs(solve: Pick<SolveRow, 'effective_ms' | 'penalty' | 'time_ms'>): number {
  if (typeof solve.effective_ms === 'number' && !Number.isNaN(solve.effective_ms)) {
    return solve.effective_ms;
  }

  if (solve.penalty === 'DNF') {
    return Number.POSITIVE_INFINITY;
  }

  return solve.penalty === '+2' ? solve.time_ms + 2000 : solve.time_ms;
}

function toFiniteTimes(values: number[]): number[] {
  return values.filter((value) => Number.isFinite(value));
}

function calculateWindowAverage(values: number[]): number | null {
  if (values.length < 3) {
    return null;
  }

  const dnfCount = values.filter((value) => !Number.isFinite(value)).length;

  if (dnfCount >= 2) {
    return Number.POSITIVE_INFINITY;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);

  if (trimmed.length === 0) {
    return null;
  }

  const total = trimmed.reduce((acc, value) => acc + value, 0);
  return total / trimmed.length;
}

function calculateBestAverage(values: number[], windowSize: number): number | null {
  if (values.length < windowSize) {
    return null;
  }

  let bestValue: number | null = null;

  for (let index = windowSize - 1; index < values.length; index += 1) {
    const window = values.slice(index - (windowSize - 1), index + 1);
    const average = calculateWindowAverage(window);

    if (average === null || average === Number.POSITIVE_INFINITY) {
      continue;
    }

    if (bestValue === null || average < bestValue) {
      bestValue = average;
    }
  }

  return bestValue;
}

function calculateConsistencyScore(values: number[]): number | null {
  const finiteTimes = toFiniteTimes(values);

  if (finiteTimes.length < 2) {
    return null;
  }

  const mean = finiteTimes.reduce((acc, value) => acc + value, 0) / finiteTimes.length;

  if (mean === 0) {
    return null;
  }

  const variance =
    finiteTimes.reduce((acc, value) => {
      return acc + (value - mean) ** 2;
    }, 0) / finiteTimes.length;

  return (Math.sqrt(variance) / mean) * 100;
}

export function calculateLeaderboardMetricsFromSolves(solves: SolveMetricsRow[]): LeaderboardMetrics {
  const effectiveTimes = solves.map((solve) => resolveSolveEffectiveMs(solve));
  const finiteTimes = toFiniteTimes(effectiveTimes);

  return {
    bestSingleMs: finiteTimes.length > 0 ? Math.min(...finiteTimes) : null,
    bestAo5Ms: calculateBestAverage(effectiveTimes, 5),
    bestAo12Ms: calculateBestAverage(effectiveTimes, 12),
    consistencyScore: calculateConsistencyScore(effectiveTimes),
    solveCount: solves.length,
  };
}

function getIsoWeekStart(referenceDate: Date): Date {
  const normalized = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  const day = normalized.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  normalized.setUTCDate(normalized.getUTCDate() + mondayOffset);

  return normalized;
}

function getIsoWeekInfo(referenceDate: Date): { year: number; week: number; start: Date; endExclusive: Date } {
  const start = getIsoWeekStart(referenceDate);
  const endExclusive = new Date(start.getTime() + MILLISECONDS_PER_DAY * 7);

  const thursday = new Date(start);
  thursday.setUTCDate(start.getUTCDate() + 3);

  const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstThursdayDay = firstThursday.getUTCDay() || 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() + (4 - firstThursdayDay));

  const diffMs = thursday.getTime() - firstThursday.getTime();
  const week = 1 + Math.floor(diffMs / (MILLISECONDS_PER_DAY * 7));

  return {
    year: thursday.getUTCFullYear(),
    week,
    start,
    endExclusive,
  };
}

function getMonthInfo(referenceDate: Date): { key: string; start: Date; endExclusive: Date } {
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endExclusive = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0));

  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    start,
    endExclusive,
  };
}

export function resolveLeaderboardPeriod(
  period: LeaderboardPeriod,
  now = new Date(),
): { periodKey: string; startIso: string; endExclusiveIso: string } {
  if (period === 'weekly') {
    const weekInfo = getIsoWeekInfo(now);

    return {
      periodKey: `${weekInfo.year}-W${String(weekInfo.week).padStart(2, '0')}`,
      startIso: weekInfo.start.toISOString(),
      endExclusiveIso: weekInfo.endExclusive.toISOString(),
    };
  }

  const monthInfo = getMonthInfo(now);

  return {
    periodKey: monthInfo.key,
    startIso: monthInfo.start.toISOString(),
    endExclusiveIso: monthInfo.endExclusive.toISOString(),
  };
}

export function sortLeaderboardEntries(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const compareNullableAscending = (a: number | null, b: number | null): number => {
    if (a === null && b === null) {
      return 0;
    }

    if (a === null) {
      return 1;
    }

    if (b === null) {
      return -1;
    }

    return a - b;
  };

  return [...entries].sort((left, right) => {
    const bySingle = compareNullableAscending(left.bestSingleMs, right.bestSingleMs);
    if (bySingle !== 0) {
      return bySingle;
    }

    const byAo5 = compareNullableAscending(left.bestAo5Ms, right.bestAo5Ms);
    if (byAo5 !== 0) {
      return byAo5;
    }

    const byAo12 = compareNullableAscending(left.bestAo12Ms, right.bestAo12Ms);
    if (byAo12 !== 0) {
      return byAo12;
    }

    const byConsistency = compareNullableAscending(left.consistencyScore, right.consistencyScore);
    if (byConsistency !== 0) {
      return byConsistency;
    }

    return right.solveCount - left.solveCount;
  });
}

export async function listFriendInvites(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<FriendInvite[]> {
  const { data, error } = await client
    .from('friend_invites')
    .select('*')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFriendInvite);
}

export async function sendFriendInvite(
  client: SupabaseClient<Database>,
  senderId: string,
  receiverId: string,
): Promise<FriendInvite> {
  if (!receiverId || senderId === receiverId) {
    throw new Error('invalid_friend_target');
  }

  const canonicalPair = toCanonicalFriendPair(senderId, receiverId);
  const { data: existingFriend, error: friendshipError } = await client
    .from('friends')
    .select('id')
    .eq('user_id', canonicalPair.userId)
    .eq('friend_id', canonicalPair.friendId)
    .maybeSingle();

  if (friendshipError) {
    throw friendshipError;
  }

  if (existingFriend) {
    throw new Error('friendship_already_exists');
  }

  const payload: FriendInviteInsert = {
    sender_id: senderId,
    receiver_id: receiverId,
    status: 'pending',
    responded_at: null,
    updated_at: getNowIso(),
  };

  const { data, error } = await client.from('friend_invites').insert(payload).select('*').single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('friend_invite_already_pending');
    }

    throw error;
  }

  return mapFriendInvite(data);
}

export async function respondToFriendInvite(
  client: SupabaseClient<Database>,
  userId: string,
  inviteId: string,
  decision: Extract<FriendInviteStatus, 'accepted' | 'rejected'>,
): Promise<FriendInvite> {
  const { data: inviteRow, error: inviteError } = await client
    .from('friend_invites')
    .select('*')
    .eq('id', inviteId)
    .maybeSingle();

  if (inviteError) {
    throw inviteError;
  }

  if (!inviteRow) {
    throw new Error('friend_invite_not_found');
  }

  if (inviteRow.receiver_id !== userId) {
    throw new Error('friend_invite_forbidden');
  }

  if (inviteRow.status !== 'pending') {
    return mapFriendInvite(inviteRow);
  }

  const { data: updatedInvite, error: updateError } = await client
    .from('friend_invites')
    .update({
      status: decision,
      responded_at: getNowIso(),
      updated_at: getNowIso(),
    })
    .eq('id', inviteId)
    .eq('receiver_id', userId)
    .select('*')
    .single();

  if (updateError) {
    throw updateError;
  }

  if (decision === 'accepted') {
    const canonicalPair = toCanonicalFriendPair(inviteRow.sender_id, inviteRow.receiver_id);

    const { error: friendshipUpsertError } = await client.from('friends').upsert(
      {
        user_id: canonicalPair.userId,
        friend_id: canonicalPair.friendId,
      },
      {
        onConflict: 'user_id,friend_id',
      },
    );

    if (friendshipUpsertError) {
      throw friendshipUpsertError;
    }
  }

  return mapFriendInvite(updatedInvite);
}

export async function cancelFriendInvite(
  client: SupabaseClient<Database>,
  userId: string,
  inviteId: string,
): Promise<FriendInvite> {
  const { data, error } = await client
    .from('friend_invites')
    .update({
      status: 'cancelled',
      responded_at: getNowIso(),
      updated_at: getNowIso(),
    })
    .eq('id', inviteId)
    .eq('sender_id', userId)
    .eq('status', 'pending')
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapFriendInvite(data);
}

export async function listFriends(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<Friendship[]> {
  const { data, error } = await client
    .from('friends')
    .select('*')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`)
    .order('updated_at', { ascending: false });

  if (error) {
    throw error;
  }

  return (data ?? []).map(mapFriendship);
}

export async function removeFriend(
  client: SupabaseClient<Database>,
  userId: string,
  otherUserId: string,
): Promise<void> {
  const canonicalPair = toCanonicalFriendPair(userId, otherUserId);

  const { error } = await client
    .from('friends')
    .delete()
    .eq('user_id', canonicalPair.userId)
    .eq('friend_id', canonicalPair.friendId);

  if (error) {
    throw error;
  }
}

async function ensureLeaderboard(
  client: SupabaseClient<Database>,
  period: LeaderboardPeriod,
  periodKey: string,
): Promise<Leaderboard> {
  const payload: LeaderboardInsert = {
    period_type: period,
    period_key: periodKey,
    updated_at: getNowIso(),
  };

  const { data, error } = await client
    .from('leaderboards')
    .upsert(payload, { onConflict: 'period_type,period_key' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapLeaderboard(data);
}

async function listUserSolvesForRange(
  client: SupabaseClient<Database>,
  userId: string,
  startIso: string,
  endExclusiveIso: string,
): Promise<SolveMetricsRow[]> {
  const { data, error } = await client
    .from('solves')
    .select('effective_ms, penalty, time_ms, created_at')
    .eq('user_id', userId)
    .gte('created_at', startIso)
    .lt('created_at', endExclusiveIso)
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function upsertOwnLeaderboardEntry(
  client: SupabaseClient<Database>,
  userId: string,
  period: LeaderboardPeriod,
  now = new Date(),
): Promise<LeaderboardEntry> {
  const { periodKey, startIso, endExclusiveIso } = resolveLeaderboardPeriod(period, now);
  const leaderboard = await ensureLeaderboard(client, period, periodKey);

  const solves = await listUserSolvesForRange(client, userId, startIso, endExclusiveIso);
  const metrics = calculateLeaderboardMetricsFromSolves(solves);

  const payload: LeaderboardEntryInsert = {
    leaderboard_id: leaderboard.id,
    user_id: userId,
    best_single_ms: metrics.bestSingleMs,
    best_ao5_ms: metrics.bestAo5Ms,
    best_ao12_ms: metrics.bestAo12Ms,
    consistency_score: metrics.consistencyScore,
    solve_count: metrics.solveCount,
    updated_at: getNowIso(),
  };

  const { data, error } = await client
    .from('leaderboard_entries')
    .upsert(payload, { onConflict: 'leaderboard_id,user_id' })
    .select('*')
    .single();

  if (error) {
    throw error;
  }

  return mapLeaderboardEntry(data, new Map());
}

export async function syncOwnLeaderboardEntries(
  client: SupabaseClient<Database>,
  userId: string,
  now = new Date(),
): Promise<Record<LeaderboardPeriod, LeaderboardEntry>> {
  const [weekly, monthly] = await Promise.all([
    upsertOwnLeaderboardEntry(client, userId, 'weekly', now),
    upsertOwnLeaderboardEntry(client, userId, 'monthly', now),
  ]);

  return {
    weekly,
    monthly,
  };
}

export async function listLeaderboardEntries(
  client: SupabaseClient<Database>,
  period: LeaderboardPeriod,
  now = new Date(),
): Promise<{ leaderboard: Leaderboard; entries: LeaderboardEntry[] }> {
  const { periodKey } = resolveLeaderboardPeriod(period, now);
  const leaderboard = await ensureLeaderboard(client, period, periodKey);

  const { data: rows, error: rowsError } = await client
    .from('leaderboard_entries')
    .select('*')
    .eq('leaderboard_id', leaderboard.id);

  if (rowsError) {
    throw rowsError;
  }

  const userIds = Array.from(new Set((rows ?? []).map((row) => row.user_id)));
  const profileMap = new Map<string, Pick<ProfileRow, 'display_name' | 'avatar_url'>>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesError } = await client
      .from('profiles')
      .select('user_id, display_name, avatar_url')
      .in('user_id', userIds);

    if (profilesError) {
      throw profilesError;
    }

    for (const profile of profiles ?? []) {
      profileMap.set(profile.user_id, {
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
      });
    }
  }

  const mappedEntries = (rows ?? []).map((row) => mapLeaderboardEntry(row, profileMap));

  return {
    leaderboard,
    entries: sortLeaderboardEntries(mappedEntries),
  };
}

export function resolveFriendCounterpart(friendship: Friendship, userId: string): string {
  return friendship.userId === userId ? friendship.friendId : friendship.userId;
}
