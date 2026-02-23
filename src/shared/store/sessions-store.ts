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

  addSolve: (solve: Omit<Solve, 'id' | 'createdAt' | 'effectiveMs'>) => void;
  updateSolvePenalty: (solveId: string, penalty: Penalty) => void;
  deleteSolve: (solveId: string) => void;
  clearCurrentSession: () => void;

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

const initialSession: Session = {
  id: crypto.randomUUID(),
  name: 'Sessão 1',
  puzzleType: '3x3',
  solves: [],
};

function calculateEffectiveMs(timeMs: number, penalty: Penalty): number {
  if (penalty === 'DNF') return Infinity;
  if (penalty === '+2') return timeMs + 2000;
  return timeMs;
}

export const useSessionsStore = create<SessionsStore>()(
  persist(
    (set, get) => ({
      sessions: [initialSession],
      activeSessionId: initialSession.id,

      createSession: (name: string, puzzleType?: PuzzleType): void => {
        set((state) => {
          const newSession: Session = {
            id: crypto.randomUUID(),
            name,
            puzzleType: puzzleType || '3x3',
            solves: [],
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
          const newActiveId =
            state.activeSessionId === id && filtered.length > 0
              ? filtered[0].id
              : state.activeSessionId;
          return {
            sessions: filtered,
            activeSessionId: newActiveId,
          };
        });
      },

      renameSession: (id: string, name: string): void => {
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
        }));
      },

      setActiveSession: (id: string): void => {
        set({ activeSessionId: id });
      },

      switchPuzzleType: (type: PuzzleType): void => {
        set((state) => {
          const existingSession = state.sessions.find((s) => s.puzzleType === type);

          if (existingSession) {
            return { activeSessionId: existingSession.id };
          }

          const newSession: Session = {
            id: crypto.randomUUID(),
            name: 'Sessão 1',
            puzzleType: type,
            solves: [],
          };

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

      addSolve: (solveData: Omit<Solve, 'id' | 'createdAt' | 'effectiveMs'>): void => {
        set((state) => {
          const effectiveMs = calculateEffectiveMs(solveData.timeMs, solveData.penalty);

          const newSolve: Solve = {
            ...solveData,
            id: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            effectiveMs,
          };

          return {
            sessions: state.sessions.map((session) =>
              session.id === state.activeSessionId
                ? { ...session, solves: [...session.solves, newSolve] }
                : session,
            ),
          };
        });
      },

      updateSolvePenalty: (solveId: string, penalty: Penalty): void => {
        set((state) => ({
          sessions: state.sessions.map((session) => ({
            ...session,
            solves: session.solves.map((solve) =>
              solve.id === solveId
                ? {
                    ...solve,
                    penalty,
                    effectiveMs: calculateEffectiveMs(solve.timeMs, penalty),
                  }
                : solve,
            ),
          })),
        }));
      },

      deleteSolve: (solveId: string): void => {
        set((state) => ({
          sessions: state.sessions.map((session) => ({
            ...session,
            solves: session.solves.filter((s) => s.id !== solveId),
          })),
        }));
      },

      clearCurrentSession: (): void => {
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId ? { ...session, solves: [] } : session,
          ),
        }));
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

          const imported = result.data;

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
                activeSessionId: imported[0].id,
              };
            }
            return {
              sessions: [...state.sessions, ...imported],
              activeSessionId: state.activeSessionId,
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
