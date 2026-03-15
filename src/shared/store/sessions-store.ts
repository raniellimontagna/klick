import { z } from 'zod';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  type Average,
  calculateAo5,
  calculateAo12,
  calculateBestAo5,
  calculateBestAo12,
  calculateSingle,
} from '@/features/stats/averages';
import { createUuid } from '@/shared/lib';
import {
  type Penalty,
  type PuzzleType,
  type Session,
  SessionSchema,
  type Solve,
} from '@/shared/types';

interface SessionsStore {
  sessions: Session[];
  activeSessionId: string;

  createSession: (name: string, puzzleType?: PuzzleType) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setActiveSession: (id: string) => void;
  switchPuzzleType: (type: PuzzleType) => void;
  getActiveSession: () => Session | undefined;

  addSolve: (solve: Omit<Solve, 'id' | 'createdAt' | 'updatedAt' | 'effectiveMs'>) => void;
  updateSolvePenalty: (solveId: string, penalty: Penalty) => void;
  deleteSolve: (solveId: string) => void;
  clearCurrentSession: () => void;
  hydrateSessions: (sessions: Session[], activeSessionId?: string) => void;

  // Statistics getters
  getSingle: () => Average;
  getAo5: () => Average | null;
  getAo12: () => Average | null;
  getBestAo5: () => Average | null;
  getBestAo12: () => Average | null;

  // Export/Import
  exportCurrentSession: () => string;
  exportAllSessions: () => string;
  importSessions: (
    jsonString: string,
    mode: 'merge' | 'replace',
  ) => { success: boolean; error?: string };
}

function createDefaultSession(name = 'Sessão 1', puzzleType: PuzzleType = '3x3'): Session {
  const now = new Date();

  return {
    id: createUuid(),
    name,
    puzzleType,
    solves: [],
    createdAt: now,
    updatedAt: now,
  };
}

const initialSession = createDefaultSession();

function calculateEffectiveMs(timeMs: number, penalty: Penalty): number {
  if (penalty === 'DNF') return Number.POSITIVE_INFINITY;
  if (penalty === '+2') return timeMs + 2000;
  return timeMs;
}

function normalizeSolve(solve: Solve): Solve {
  const createdAt = solve.createdAt instanceof Date ? solve.createdAt : new Date(solve.createdAt);
  const updatedAt = solve.updatedAt
    ? solve.updatedAt instanceof Date
      ? solve.updatedAt
      : new Date(solve.updatedAt)
    : createdAt;

  return {
    ...solve,
    createdAt,
    updatedAt,
  };
}

function normalizeSession(session: Session): Session {
  const now = new Date();
  const createdAt = session.createdAt
    ? session.createdAt instanceof Date
      ? session.createdAt
      : new Date(session.createdAt)
    : now;

  const updatedAt = session.updatedAt
    ? session.updatedAt instanceof Date
      ? session.updatedAt
      : new Date(session.updatedAt)
    : createdAt;

  return {
    ...session,
    solves: session.solves.map(normalizeSolve),
    createdAt,
    updatedAt,
  };
}

function normalizeSessions(sessions: Session[]): Session[] {
  if (sessions.length === 0) {
    return [createDefaultSession()];
  }

  return sessions.map(normalizeSession);
}

function resolveActiveSessionId(sessions: Session[], preferredId?: string): string {
  if (preferredId && sessions.some((session) => session.id === preferredId)) {
    return preferredId;
  }

  return sessions[0]?.id ?? createDefaultSession().id;
}

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set, get) => ({
      sessions: [initialSession],
      activeSessionId: initialSession.id,

      createSession: (name: string, puzzleType?: PuzzleType): void => {
        const now = new Date();

        set((state) => {
          const newSession: Session = {
            id: createUuid(),
            name,
            puzzleType: puzzleType || '3x3',
            solves: [],
            createdAt: now,
            updatedAt: now,
          };
          return {
            sessions: [...state.sessions, newSession],
            activeSessionId: newSession.id,
          };
        });
      },

      deleteSession: (id: string): void => {
        set((state) => {
          const filtered = state.sessions.filter((s) => s.id !== id);
          const nextSessions = filtered.length > 0 ? filtered : [createDefaultSession()];
          const newActiveId =
            state.activeSessionId === id
              ? resolveActiveSessionId(nextSessions)
              : resolveActiveSessionId(nextSessions, state.activeSessionId);
          return {
            sessions: nextSessions,
            activeSessionId: newActiveId,
          };
        });
      },

      renameSession: (id: string, name: string): void => {
        const now = new Date();

        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === id ? { ...session, name, updatedAt: now } : session,
          ),
        }));
      },

      setActiveSession: (id: string): void => {
        set((state) => ({
          activeSessionId: resolveActiveSessionId(state.sessions, id),
        }));
      },

      switchPuzzleType: (type: PuzzleType): void => {
        set((state) => {
          const existingSession = state.sessions.find((s) => s.puzzleType === type);

          if (existingSession) {
            return { activeSessionId: existingSession.id };
          }

          const newSession = createDefaultSession('Sessão 1', type);

          return {
            sessions: [...state.sessions, newSession],
            activeSessionId: newSession.id,
          };
        });
      },

      getActiveSession: (): Session | undefined => {
        const state = get();
        return state.sessions.find((s) => s.id === state.activeSessionId);
      },

      addSolve: (solveData: Omit<Solve, 'id' | 'createdAt' | 'updatedAt' | 'effectiveMs'>): void => {
        const now = new Date();

        set((state) => {
          const effectiveMs = calculateEffectiveMs(solveData.timeMs, solveData.penalty);

          const newSolve: Solve = {
            ...solveData,
            id: createUuid(),
            createdAt: now,
            updatedAt: now,
            effectiveMs,
          };

          return {
            sessions: state.sessions.map((session) =>
              session.id === state.activeSessionId
                ? {
                    ...session,
                    solves: [...session.solves, newSolve],
                    updatedAt: now,
                  }
                : session,
            ),
          };
        });
      },

      updateSolvePenalty: (solveId: string, penalty: Penalty): void => {
        const now = new Date();

        set((state) => ({
          sessions: state.sessions.map((session) => {
            let hasChanges = false;

            const nextSolves = session.solves.map((solve) => {
              if (solve.id !== solveId) {
                return solve;
              }

              hasChanges = true;

              return {
                ...solve,
                penalty,
                updatedAt: now,
                effectiveMs: calculateEffectiveMs(solve.timeMs, penalty),
              };
            });

            if (!hasChanges) {
              return session;
            }

            return {
              ...session,
              solves: nextSolves,
              updatedAt: now,
            };
          }),
        }));
      },

      deleteSolve: (solveId: string): void => {
        const now = new Date();

        set((state) => ({
          sessions: state.sessions.map((session) => {
            const nextSolves = session.solves.filter((solve) => solve.id !== solveId);

            if (nextSolves.length === session.solves.length) {
              return session;
            }

            return {
              ...session,
              solves: nextSolves,
              updatedAt: now,
            };
          }),
        }));
      },

      clearCurrentSession: (): void => {
        const now = new Date();

        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId
              ? {
                  ...session,
                  solves: [],
                  updatedAt: now,
                }
              : session,
          ),
        }));
      },

      hydrateSessions: (sessions: Session[], activeSessionId?: string): void => {
        const normalizedSessions = normalizeSessions(sessions);

        set({
          sessions: normalizedSessions,
          activeSessionId: resolveActiveSessionId(normalizedSessions, activeSessionId),
        });
      },

      exportCurrentSession: (): string => {
        const session = get().getActiveSession();
        if (!session) {
          return JSON.stringify([], null, 2);
        }
        return JSON.stringify([session], null, 2);
      },

      exportAllSessions: (): string => {
        const state = get();
        return JSON.stringify(state.sessions, null, 2);
      },

      importSessions: (
        jsonString: string,
        mode: 'merge' | 'replace',
      ): { success: boolean; error?: string } => {
        try {
          const parsed = JSON.parse(jsonString);

          const sessionsArraySchema = z.array(SessionSchema);
          const result = sessionsArraySchema.safeParse(parsed);

          if (!result.success) {
            return {
              success: false,
              error:
                'Estrutura de sessão inválida: ' +
                result.error.issues.map((i) => i.message).join(', '),
            };
          }

          const imported = normalizeSessions(result.data);

          if (imported.length === 0) {
            return {
              success: false,
              error: 'Nenhuma sessão válida encontrada',
            };
          }

          set((state) => {
            if (mode === 'replace') {
              return {
                sessions: imported,
                activeSessionId: resolveActiveSessionId(imported),
              };
            }

            const merged = normalizeSessions([...state.sessions, ...imported]);
            return {
              sessions: merged,
              activeSessionId: resolveActiveSessionId(merged, state.activeSessionId),
            };
          });

          return { success: true };
        } catch (error: unknown) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          };
        }
      },

      // Statistics getters
      getSingle: (): Average => {
        const session = get().getActiveSession();
        return calculateSingle(session?.solves || []);
      },

      getAo5: (): Average | null => {
        const session = get().getActiveSession();
        return calculateAo5(session?.solves || []);
      },

      getAo12: (): Average | null => {
        const session = get().getActiveSession();
        return calculateAo12(session?.solves || []);
      },

      getBestAo5: (): Average | null => {
        const session = get().getActiveSession();
        return calculateBestAo5(session?.solves || []);
      },

      getBestAo12: (): Average | null => {
        const session = get().getActiveSession();
        return calculateBestAo12(session?.solves || []);
      },
    }),
    {
      name: 'klick-sessions',
    },
  ),
);
