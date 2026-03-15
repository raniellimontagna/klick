import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createUuid } from '../utils/create-uuid/create-uuid';
import type { Language } from '@/shared/config/i18n/translations';
import type { Penalty, PuzzleType, Session, Settings, Solve } from '@/shared/types';
import type { Database } from './database';

type CloudSessionRow = Database['public']['Tables']['sessions']['Row'];
type CloudSessionInsert = Database['public']['Tables']['sessions']['Insert'];
type CloudSolveRow = Database['public']['Tables']['solves']['Row'];
type CloudSolveInsert = Database['public']['Tables']['solves']['Insert'];
type CloudSettingsRow = Database['public']['Tables']['user_settings']['Row'];
type CloudSettingsInsert = Database['public']['Tables']['user_settings']['Insert'];

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

export interface LocalSyncSnapshot {
  sessions: Session[];
  activeSessionId: string;
  settings: Settings;
  settingsUpdatedAt: string;
  language: Language;
}

export interface CloudSyncResult {
  sessions: Session[];
  activeSessionId: string;
  settings: Settings;
  settingsUpdatedAt: string;
  language: Language;
  syncedAt: string;
}

interface RemoteSnapshot {
  sessions: CloudSessionRow[];
  solves: CloudSolveRow[];
  settings: CloudSettingsRow | null;
}

interface CloudRowsFromLocal {
  sessions: CloudSessionInsert[];
  solves: CloudSolveInsert[];
  settings: CloudSettingsInsert;
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

function parseTimestampMs(value: string): number {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isLanguage(value: string): value is Language {
  return LANGUAGES.includes(value as Language);
}

function isPuzzleType(value: string): value is PuzzleType {
  return PUZZLE_TYPES.includes(value as PuzzleType);
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
  };
}

function mapCloudRowsToLocalSnapshot(
  rows: {
    sessions: CloudSessionInsert[];
    solves: CloudSolveInsert[];
    settings: CloudSettingsInsert;
  },
  fallbackActiveSessionId: string,
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
        puzzleType: isPuzzleType(sessionRow.puzzle_type)
          ? sessionRow.puzzle_type
          : PUZZLE_TYPE_FALLBACK,
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

  return {
    sessions,
    activeSessionId,
    settings,
    settingsUpdatedAt: toIso(rows.settings.updated_at ?? rows.settings.created_at),
    language,
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
  const [sessionsResult, solvesResult, settingsResult] = await Promise.all([
    client.from('sessions').select('*').eq('user_id', userId),
    client.from('solves').select('*').eq('user_id', userId),
    client.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
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

  return {
    sessions: sessionsResult.data ?? [],
    solves: solvesResult.data ?? [],
    settings: settingsResult.data ?? null,
  };
}

async function persistMergedRows(
  client: SupabaseClient<Database>,
  rows: {
    sessions: CloudSessionInsert[];
    solves: CloudSolveInsert[];
    settings: CloudSettingsInsert;
  },
): Promise<void> {
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

  const mergedSessions = mergeByUpdatedAtLww(localRows.sessions, remoteSnapshot.sessions);
  const mergedSolves = mergeByUpdatedAtLww(localRows.solves, remoteSnapshot.solves);
  const mergedSettings = mergeSettings(localRows.settings, remoteSnapshot.settings);

  const mergedRows = {
    sessions: mergedSessions,
    solves: mergedSolves,
    settings: mergedSettings,
  };

  await persistMergedRows(client, mergedRows);

  return {
    ...mapCloudRowsToLocalSnapshot(mergedRows, localSnapshot.activeSessionId),
    syncedAt: getNowIso(),
  };
}
