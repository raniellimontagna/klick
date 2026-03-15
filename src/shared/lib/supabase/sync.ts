import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createDefaultProgressSummary, resolveTimeZone } from '../progress/progress-engine';
import type { Language } from '@/shared/config/i18n/translations';
import type {
  Penalty,
  ProgressChallenge,
  ProgressChallengeType,
  ProgressSnapshot,
  ProgressSummary,
  PuzzleType,
  Session,
  Settings,
  Solve,
} from '@/shared/types';
import { createUuid } from '../utils/create-uuid/create-uuid';
import type { Database } from './database';

type CloudSessionRow = Database['public']['Tables']['sessions']['Row'];
type CloudSessionInsert = Database['public']['Tables']['sessions']['Insert'];
type CloudSolveRow = Database['public']['Tables']['solves']['Row'];
type CloudSolveInsert = Database['public']['Tables']['solves']['Insert'];
type CloudSettingsRow = Database['public']['Tables']['user_settings']['Row'];
type CloudSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];
type CloudDailyChallengeRow = Database['public']['Tables']['daily_challenges']['Row'];
type CloudChallengeCompletionRow = Database['public']['Tables']['challenge_completions']['Row'];
type CloudDailyChallengeSyncRow = {
  user_id: string;
  challenge_date: string;
  timezone: string;
  challenge_type: ProgressChallengeType;
  target_value: number;
  metadata: CloudDailyChallengeRow['metadata'];
  created_at: string;
  updated_at: string;
};
type CloudChallengeCompletionSyncRow = {
  user_id: string;
  challenge_date: string;
  challenge_type: ProgressChallengeType;
  progress_value: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

const LANGUAGE_FALLBACK: Language = 'pt-BR';
const PUZZLE_TYPE_FALLBACK: PuzzleType = '3x3';
const PUZZLE_TYPES: PuzzleType[] = [
  '3x3',
  '2x2',
  '4x4',
  '5x5',
  'pyraminx',
  'megaminx',
  'skewb',
  'square1',
];
const LANGUAGES: Language[] = ['pt-BR', 'en-US', 'es-ES'];

interface LocalSyncSnapshot {
  sessions: Session[];
  activeSessionId: string;
  settings: Settings;
  settingsUpdatedAt: string;
  language: Language;
  progress: ProgressSnapshot;
}

interface CloudSyncResult {
  sessions: Session[];
  activeSessionId: string;
  settings: Settings;
  settingsUpdatedAt: string;
  language: Language;
  progress: ProgressSnapshot;
  syncedAt: string;
}

interface RemoteSnapshot {
  sessions: CloudSessionRow[];
  solves: CloudSolveRow[];
  settings: CloudSettingsRow | null;
  dailyChallenges: CloudDailyChallengeRow[];
  challengeCompletions: CloudChallengeCompletionRow[];
}

interface CloudRowsFromLocal {
  sessions: CloudSessionInsert[];
  solves: CloudSolveInsert[];
  settings: CloudSettingsInsert;
  dailyChallenges: CloudDailyChallengeSyncRow[];
  challengeCompletions: CloudChallengeCompletionSyncRow[];
}

interface MergedCloudRows {
  sessions: CloudSessionInsert[];
  solves: CloudSolveInsert[];
  settings: CloudSettingsInsert;
  dailyChallenges: CloudDailyChallengeSyncRow[];
  challengeCompletions: CloudChallengeCompletionSyncRow[];
}

function getNowIso(): string {
  return new Date().toISOString();
}

function toDate(input: unknown, fallbackIso = getNowIso()): Date {
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? new Date(fallbackIso) : input;
  }

  if (typeof input === 'string' || typeof input === 'number') {
    const parsed = new Date(input);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date(fallbackIso);
}

function toIso(input: unknown, fallbackIso = getNowIso()): string {
  return toDate(input, fallbackIso).toISOString();
}

function parseTimestampMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.includes(value as Language);
}

function isPuzzleType(value: string): value is PuzzleType {
  return PUZZLE_TYPES.includes(value as PuzzleType);
}

function isProgressChallengeType(value: string): value is ProgressChallengeType {
  return value === 'solve_count' || value === 'clean_streak' || value === 'ao5_target';
}

function toPenalty(value: string): Penalty {
  if (value === '+2' || value === 'DNF') {
    return value;
  }

  return 'NONE';
}

function resolveSolveUpdatedAt(solve: Solve): string {
  return toIso(solve.updatedAt ?? solve.createdAt);
}

function resolveSessionUpdatedAt(session: Session): string {
  if (session.updatedAt) {
    return toIso(session.updatedAt);
  }

  if (session.solves.length > 0) {
    const latestSolve = session.solves.reduce<string>((latest, solve) => {
      const candidate = resolveSolveUpdatedAt(solve);
      return parseTimestampMs(candidate) > parseTimestampMs(latest) ? candidate : latest;
    }, resolveSolveUpdatedAt(session.solves[0]));

    return latestSolve;
  }

  return toIso(session.createdAt);
}

function challengeKey(challengeDate: string, challengeType: string): string {
  return `${challengeDate}:${challengeType}`;
}

export function mergeByUpdatedAtLww<T extends { id: string; updated_at: string }>(
  localRows: T[],
  remoteRows: T[],
): T[] {
  const map = new Map<string, T>();

  for (const row of [...localRows, ...remoteRows]) {
    const existing = map.get(row.id);

    if (!existing) {
      map.set(row.id, row);
      continue;
    }

    const existingTs = parseTimestampMs(existing.updated_at);
    const rowTs = parseTimestampMs(row.updated_at);

    if (rowTs >= existingTs) {
      map.set(row.id, row);
    }
  }

  return [...map.values()];
}

export function mergeByUpdatedAtLwwByKey<T extends { updated_at: string }>(
  localRows: T[],
  remoteRows: T[],
  resolveKey: (row: T) => string,
): T[] {
  const map = new Map<string, T>();

  for (const row of [...localRows, ...remoteRows]) {
    const key = resolveKey(row);
    const existing = map.get(key);

    if (!existing) {
      map.set(key, row);
      continue;
    }

    const existingTs = parseTimestampMs(existing.updated_at);
    const rowTs = parseTimestampMs(row.updated_at);

    if (rowTs >= existingTs) {
      map.set(key, row);
    }
  }

  return [...map.values()];
}

export function serializeEffectiveMs(effectiveMs: number): number | null {
  return Number.isFinite(effectiveMs) ? effectiveMs : null;
}

export function deserializeEffectiveMs(effectiveMs: number | null): number {
  return typeof effectiveMs === 'number' ? effectiveMs : Number.POSITIVE_INFINITY;
}

function mergeSettings(
  localSettings: CloudSettingsInsert,
  remoteSettings: CloudSettingsRow | null,
): CloudSettingsInsert {
  if (!remoteSettings) {
    return localSettings;
  }

  const localTs = parseTimestampMs(localSettings.updated_at ?? localSettings.created_at ?? getNowIso());
  const remoteTs = parseTimestampMs(remoteSettings.updated_at);

  if (remoteTs >= localTs) {
    return {
      user_id: remoteSettings.user_id,
      inspection_duration: remoteSettings.inspection_duration,
      sounds_enabled: remoteSettings.sounds_enabled,
      auto_inspection_penalty: remoteSettings.auto_inspection_penalty,
      theme: remoteSettings.theme,
      language: remoteSettings.language,
      created_at: remoteSettings.created_at,
      updated_at: remoteSettings.updated_at,
    };
  }

  return localSettings;
}

function toChallengeMetadata(targetMs: number | null): Database['public']['Tables']['daily_challenges']['Row']['metadata'] {
  if (typeof targetMs === 'number' && Number.isFinite(targetMs)) {
    return {
      targetMs,
    };
  }

  return {};
}

function readTargetMsFromMetadata(metadata: CloudDailyChallengeRow['metadata']): number | null {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
    return null;
  }

  const targetMs = metadata.targetMs;

  return typeof targetMs === 'number' && Number.isFinite(targetMs) ? targetMs : null;
}

function normalizeProgressSummary(summary: ProgressSummary | undefined, timezone: string): ProgressSummary {
  const fallback = createDefaultProgressSummary(timezone);

  if (!summary) {
    return fallback;
  }

  return {
    timezone,
    todayKey: summary.todayKey || fallback.todayKey,
    weekKey: summary.weekKey || fallback.weekKey,
    totalXp: Number.isFinite(summary.totalXp) ? Math.max(0, summary.totalXp) : fallback.totalXp,
    level: Number.isFinite(summary.level) ? Math.max(1, summary.level) : fallback.level,
    xpIntoLevel: Number.isFinite(summary.xpIntoLevel)
      ? Math.max(0, summary.xpIntoLevel)
      : fallback.xpIntoLevel,
    xpToNextLevel: Number.isFinite(summary.xpToNextLevel)
      ? Math.max(1, summary.xpToNextLevel)
      : fallback.xpToNextLevel,
    currentStreak: Number.isFinite(summary.currentStreak)
      ? Math.max(0, summary.currentStreak)
      : fallback.currentStreak,
    bestStreak: Number.isFinite(summary.bestStreak) ? Math.max(0, summary.bestStreak) : fallback.bestStreak,
    weeklySolveTarget: Number.isFinite(summary.weeklySolveTarget)
      ? Math.max(1, summary.weeklySolveTarget)
      : fallback.weeklySolveTarget,
    weeklySolveCount: Number.isFinite(summary.weeklySolveCount)
      ? Math.max(0, summary.weeklySolveCount)
      : fallback.weeklySolveCount,
    weeklyGoalCompleted: Boolean(summary.weeklyGoalCompleted),
    updatedAt: summary.updatedAt || fallback.updatedAt,
  };
}

function normalizeRemoteDailyChallenges(rows: CloudDailyChallengeRow[]): CloudDailyChallengeSyncRow[] {
  return rows
    .filter((row) => isProgressChallengeType(row.challenge_type))
    .map((row) => ({
      user_id: row.user_id,
      challenge_date: row.challenge_date,
      timezone: resolveTimeZone(row.timezone),
      challenge_type: row.challenge_type,
      target_value: row.target_value,
      metadata: row.metadata ?? {},
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    }));
}

function normalizeRemoteChallengeCompletions(
  rows: CloudChallengeCompletionRow[],
): CloudChallengeCompletionSyncRow[] {
  return rows
    .filter((row) => isProgressChallengeType(row.challenge_type))
    .map((row) => ({
      user_id: row.user_id,
      challenge_date: row.challenge_date,
      challenge_type: row.challenge_type,
      progress_value: row.progress_value,
      is_completed: row.is_completed,
      completed_at: row.completed_at ? toIso(row.completed_at) : null,
      created_at: toIso(row.created_at),
      updated_at: toIso(row.updated_at),
    }));
}

function mapLocalSnapshotToCloudRows(
  userId: string,
  snapshot: LocalSyncSnapshot,
): CloudRowsFromLocal {
  const sessions: CloudSessionInsert[] = snapshot.sessions.map((session) => ({
    id: session.id,
    user_id: userId,
    name: session.name,
    puzzle_type: session.puzzleType,
    created_at: toIso(session.createdAt),
    updated_at: resolveSessionUpdatedAt(session),
  }));

  const solves: CloudSolveInsert[] = snapshot.sessions.flatMap((session) =>
    session.solves.map((solve) => ({
      id: solve.id,
      session_id: session.id,
      user_id: userId,
      time_ms: solve.timeMs,
      penalty: solve.penalty,
      effective_ms: serializeEffectiveMs(solve.effectiveMs),
      scramble: solve.scramble,
      created_at: toIso(solve.createdAt),
      updated_at: resolveSolveUpdatedAt(solve),
    })),
  );

  const settingsUpdatedAt = toIso(snapshot.settingsUpdatedAt);
  const progressTimezone = resolveTimeZone(snapshot.progress.timezone);
  const progressUpdatedAt = toIso(snapshot.progress.updatedAt ?? snapshot.progress.summary.updatedAt);

  const normalizedChallenges = snapshot.progress.challenges
    .filter((challenge) => isProgressChallengeType(challenge.type))
    .map((challenge) => ({
      ...challenge,
      timezone: resolveTimeZone(challenge.timezone || progressTimezone),
      targetValue: Number.isFinite(challenge.targetValue) ? Math.max(1, challenge.targetValue) : 1,
      progressValue: Number.isFinite(challenge.progressValue) ? Math.max(0, challenge.progressValue) : 0,
      targetMs: Number.isFinite(challenge.targetMs) ? challenge.targetMs : null,
      createdAt: toIso(challenge.createdAt, progressUpdatedAt),
      updatedAt: toIso(challenge.updatedAt, progressUpdatedAt),
    }));

  const dailyChallenges: CloudDailyChallengeSyncRow[] = normalizedChallenges.map((challenge) => ({
    user_id: userId,
    challenge_date: challenge.dateKey,
    timezone: challenge.timezone,
    challenge_type: challenge.type,
    target_value: challenge.targetValue,
    metadata: toChallengeMetadata(challenge.targetMs),
    created_at: challenge.createdAt,
    updated_at: challenge.updatedAt,
  }));

  const challengeCompletions: CloudChallengeCompletionSyncRow[] = normalizedChallenges.map((challenge) => ({
    user_id: userId,
    challenge_date: challenge.dateKey,
    challenge_type: challenge.type,
    progress_value: challenge.progressValue,
    is_completed: challenge.isCompleted,
    completed_at: challenge.completedAt ? toIso(challenge.completedAt) : null,
    created_at: challenge.createdAt,
    updated_at: challenge.updatedAt,
  }));

  return {
    sessions,
    solves,
    settings: {
      user_id: userId,
      inspection_duration: snapshot.settings.inspectionDuration,
      sounds_enabled: snapshot.settings.soundsEnabled,
      auto_inspection_penalty: snapshot.settings.autoInspectionPenalty,
      theme: snapshot.settings.theme,
      language: snapshot.language,
      created_at: settingsUpdatedAt,
      updated_at: settingsUpdatedAt,
    },
    dailyChallenges,
    challengeCompletions,
  };
}

function mapCloudRowsToLocalSnapshot(
  rows: MergedCloudRows,
  fallbackActiveSessionId: string,
  localProgress: ProgressSnapshot,
): Omit<CloudSyncResult, 'syncedAt'> {
  const solvesBySessionId = new Map<string, Solve[]>();

  for (const solveRow of rows.solves) {
    const normalizedSolve: Solve = {
      id: solveRow.id,
      timeMs: solveRow.time_ms,
      penalty: toPenalty(solveRow.penalty),
      effectiveMs: deserializeEffectiveMs(solveRow.effective_ms),
      scramble: solveRow.scramble,
      createdAt: toDate(solveRow.created_at),
      updatedAt: toDate(solveRow.updated_at ?? solveRow.created_at),
    };

    const list = solvesBySessionId.get(solveRow.session_id) ?? [];
    list.push(normalizedSolve);
    solvesBySessionId.set(solveRow.session_id, list);
  }

  const normalizedSessions: Session[] = rows.sessions
    .map((sessionRow) => {
      const solves = (solvesBySessionId.get(sessionRow.id) ?? []).sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );

      return {
        id: sessionRow.id,
        name: sessionRow.name,
        puzzleType: isPuzzleType(sessionRow.puzzle_type) ? sessionRow.puzzle_type : PUZZLE_TYPE_FALLBACK,
        solves,
        createdAt: toDate(sessionRow.created_at),
        updatedAt: toDate(sessionRow.updated_at),
      };
    })
    .sort((left, right) => {
      const leftTs = parseTimestampMs(toIso(left.updatedAt ?? left.createdAt));
      const rightTs = parseTimestampMs(toIso(right.updatedAt ?? right.createdAt));
      return rightTs - leftTs;
    });

  const sessions = normalizedSessions.length > 0 ? normalizedSessions : [createFallbackSession()];
  const hasFallbackActiveId = sessions.some((session) => session.id === fallbackActiveSessionId);
  const activeSessionId = hasFallbackActiveId ? fallbackActiveSessionId : sessions[0].id;

  const settings: Settings = {
    inspectionDuration: rows.settings.inspection_duration ?? 15,
    soundsEnabled: rows.settings.sounds_enabled ?? false,
    autoInspectionPenalty: rows.settings.auto_inspection_penalty ?? true,
    theme: rows.settings.theme ?? 'dark',
  };

  const languageCandidate = rows.settings.language;
  const language =
    typeof languageCandidate === 'string' && isLanguage(languageCandidate)
      ? languageCandidate
      : LANGUAGE_FALLBACK;

  const challengeRowsByKey = new Map<string, CloudDailyChallengeSyncRow>();
  for (const challengeRow of rows.dailyChallenges) {
    challengeRowsByKey.set(
      challengeKey(challengeRow.challenge_date, challengeRow.challenge_type),
      challengeRow,
    );
  }

  const completionRowsByKey = new Map<string, CloudChallengeCompletionSyncRow>();
  for (const completionRow of rows.challengeCompletions) {
    completionRowsByKey.set(
      challengeKey(completionRow.challenge_date, completionRow.challenge_type),
      completionRow,
    );
  }

  const allChallengeKeys = new Set<string>([
    ...challengeRowsByKey.keys(),
    ...completionRowsByKey.keys(),
  ]);

  const defaultTimezone = resolveTimeZone(localProgress.timezone);
  const localSummary = normalizeProgressSummary(localProgress.summary, defaultTimezone);

  const challenges: ProgressChallenge[] = [...allChallengeKeys]
    .map((key) => {
      const challengeRow = challengeRowsByKey.get(key);
      const completionRow = completionRowsByKey.get(key);

      const challengeType = challengeRow?.challenge_type ?? completionRow?.challenge_type;
      if (!challengeType || !isProgressChallengeType(challengeType)) {
        return null;
      }

      const challengeDate = challengeRow?.challenge_date ?? completionRow?.challenge_date;
      if (!challengeDate) {
        return null;
      }

      const challengeCreatedAt = challengeRow?.created_at ?? completionRow?.created_at ?? getNowIso();
      const challengeUpdatedAt = challengeRow?.updated_at ?? completionRow?.updated_at ?? challengeCreatedAt;

      return {
        dateKey: challengeDate,
        timezone: challengeRow?.timezone ? resolveTimeZone(challengeRow.timezone) : defaultTimezone,
        type: challengeType,
        targetValue: challengeRow?.target_value ?? 1,
        targetMs: challengeRow ? readTargetMsFromMetadata(challengeRow.metadata ?? {}) : null,
        progressValue: completionRow?.progress_value ?? 0,
        isCompleted: completionRow?.is_completed ?? false,
        completedAt: completionRow?.completed_at ?? null,
        createdAt: toIso(challengeCreatedAt),
        updatedAt: toIso(challengeUpdatedAt),
      };
    })
    .filter((value): value is ProgressChallenge => value !== null)
    .sort((left, right) => {
      if (left.dateKey === right.dateKey) {
        return left.type.localeCompare(right.type);
      }

      return left.dateKey.localeCompare(right.dateKey);
    });

  const progressUpdatedAtCandidates = [
    ...rows.dailyChallenges.map((row) => row.updated_at),
    ...rows.challengeCompletions.map((row) => row.updated_at),
  ];

  const progressUpdatedAt = progressUpdatedAtCandidates.reduce<string>(
    (latest, current) =>
      parseTimestampMs(current) > parseTimestampMs(latest) ? current : latest,
    localProgress.updatedAt,
  );

  return {
    sessions,
    activeSessionId,
    settings,
    settingsUpdatedAt: toIso(rows.settings.updated_at ?? rows.settings.created_at),
    language,
    progress: {
      timezone: defaultTimezone,
      challenges,
      summary: localSummary,
      updatedAt: toIso(progressUpdatedAt),
    },
  };
}

function createFallbackSession(): Session {
  const now = new Date();

  return {
    id: createUuid(),
    name: 'Sessão 1',
    puzzleType: PUZZLE_TYPE_FALLBACK,
    solves: [],
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureUserProfile(
  client: SupabaseClient<Database>,
  user: User,
): Promise<void> {
  const metadata = user.user_metadata ?? {};
  const now = getNowIso();

  const { error } = await client.from('profiles').upsert(
    {
      user_id: user.id,
      display_name:
        typeof metadata.full_name === 'string'
          ? metadata.full_name
          : typeof metadata.name === 'string'
            ? metadata.name
            : null,
      avatar_url: typeof metadata.avatar_url === 'string' ? metadata.avatar_url : null,
      created_at: now,
      updated_at: now,
    },
    { onConflict: 'user_id' },
  );

  if (error) {
    throw new Error(`profile_upsert_failed:${error.message}`);
  }
}

async function fetchRemoteSnapshot(
  client: SupabaseClient<Database>,
  userId: string,
): Promise<RemoteSnapshot> {
  const [sessionsResult, solvesResult, settingsResult, challengesResult, completionsResult] =
    await Promise.all([
      client.from('sessions').select('*').eq('user_id', userId),
      client.from('solves').select('*').eq('user_id', userId),
      client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      client.from('daily_challenges').select('*').eq('user_id', userId),
      client.from('challenge_completions').select('*').eq('user_id', userId),
    ]);

  if (sessionsResult.error) {
    throw new Error(`sessions_fetch_failed:${sessionsResult.error.message}`);
  }

  if (solvesResult.error) {
    throw new Error(`solves_fetch_failed:${solvesResult.error.message}`);
  }

  if (settingsResult.error && settingsResult.error.code !== 'PGRST116') {
    throw new Error(`settings_fetch_failed:${settingsResult.error.message}`);
  }

  if (challengesResult.error) {
    throw new Error(`daily_challenges_fetch_failed:${challengesResult.error.message}`);
  }

  if (completionsResult.error) {
    throw new Error(`challenge_completions_fetch_failed:${completionsResult.error.message}`);
  }

  return {
    sessions: sessionsResult.data ?? [],
    solves: solvesResult.data ?? [],
    settings: settingsResult.data ?? null,
    dailyChallenges: challengesResult.data ?? [],
    challengeCompletions: completionsResult.data ?? [],
  };
}

async function persistMergedRows(client: SupabaseClient<Database>, rows: MergedCloudRows): Promise<void> {
  if (rows.sessions.length > 0) {
    const { error } = await client.from('sessions').upsert(rows.sessions, { onConflict: 'id' });

    if (error) {
      throw new Error(`sessions_upsert_failed:${error.message}`);
    }
  }

  if (rows.solves.length > 0) {
    const { error } = await client.from('solves').upsert(rows.solves, { onConflict: 'id' });

    if (error) {
      throw new Error(`solves_upsert_failed:${error.message}`);
    }
  }

  if (rows.dailyChallenges.length > 0) {
    const { error } = await client.from('daily_challenges').upsert(rows.dailyChallenges, {
      onConflict: 'user_id,challenge_date,challenge_type',
    });

    if (error) {
      throw new Error(`daily_challenges_upsert_failed:${error.message}`);
    }
  }

  if (rows.challengeCompletions.length > 0) {
    const { error } = await client.from('challenge_completions').upsert(rows.challengeCompletions, {
      onConflict: 'user_id,challenge_date,challenge_type',
    });

    if (error) {
      throw new Error(`challenge_completions_upsert_failed:${error.message}`);
    }
  }

  const { error: settingsError } = await client
    .from('user_settings')
    .upsert(rows.settings, { onConflict: 'user_id' });

  if (settingsError) {
    throw new Error(`settings_upsert_failed:${settingsError.message}`);
  }
}

export async function syncUserCloudData(
  client: SupabaseClient<Database>,
  userId: string,
  localSnapshot: LocalSyncSnapshot,
): Promise<CloudSyncResult> {
  const localRows = mapLocalSnapshotToCloudRows(userId, localSnapshot);
  const remoteSnapshot = await fetchRemoteSnapshot(client, userId);
  const remoteDailyChallenges = normalizeRemoteDailyChallenges(remoteSnapshot.dailyChallenges);
  const remoteChallengeCompletions = normalizeRemoteChallengeCompletions(
    remoteSnapshot.challengeCompletions,
  );

  const mergedRows: MergedCloudRows = {
    sessions: mergeByUpdatedAtLww(localRows.sessions, remoteSnapshot.sessions),
    solves: mergeByUpdatedAtLww(localRows.solves, remoteSnapshot.solves),
    settings: mergeSettings(localRows.settings, remoteSnapshot.settings),
    dailyChallenges: mergeByUpdatedAtLwwByKey(
      localRows.dailyChallenges,
      remoteDailyChallenges,
      (row) => challengeKey(row.challenge_date, row.challenge_type),
    ),
    challengeCompletions: mergeByUpdatedAtLwwByKey(
      localRows.challengeCompletions,
      remoteChallengeCompletions,
      (row) => challengeKey(row.challenge_date, row.challenge_type),
    ),
  };

  await persistMergedRows(client, mergedRows);

  return {
    ...mapCloudRowsToLocalSnapshot(
      mergedRows,
      localSnapshot.activeSessionId,
      localSnapshot.progress,
    ),
    syncedAt: getNowIso(),
  };
}
