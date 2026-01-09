import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Session, Solve, Penalty } from '@/commons/types';
import {
  calculateSingle,
  calculateAo5,
  calculateAo12,
  calculateBestAo5,
  calculateBestAo12,
  type Average,
} from '@/features/stats/averages';

interface SessionsStore {
  sessions: Session[];
  activeSessionId: string;

  createSession: (name: string) => void;
  deleteSession: (id: string) => void;
  renameSession: (id: string, name: string) => void;
  setActiveSession: (id: string) => void;
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

      createSession: (name) =>
        set((state) => {
          const newSession: Session = {
            id: crypto.randomUUID(),
            name,
            solves: [],
          };
          return {
            sessions: [...state.sessions, newSession],
            activeSessionId: newSession.id,
          };
        }),

      deleteSession: (id) =>
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
        }),

      renameSession: (id, name) =>
        set((state) => ({
          sessions: state.sessions.map((s) => (s.id === id ? { ...s, name } : s)),
        })),

      setActiveSession: (id) => set({ activeSessionId: id }),

      getActiveSession: () => {
        const state = get();
        return state.sessions.find((s) => s.id === state.activeSessionId);
      },

      addSolve: (solveData) =>
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
        }),

      updateSolvePenalty: (solveId, penalty) =>
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
        })),

      deleteSolve: (solveId) =>
        set((state) => ({
          sessions: state.sessions.map((session) => ({
            ...session,
            solves: session.solves.filter((s) => s.id !== solveId),
          })),
        })),

      clearCurrentSession: () =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === state.activeSessionId ? { ...session, solves: [] } : session,
          ),
        })),

      exportCurrentSession: () => {
        const session = get().getActiveSession();
        if (!session) {
          return JSON.stringify([], null, 2);
        }
        return JSON.stringify([session], null, 2);
      },

      exportAllSessions: () => {
        const state = get();
        return JSON.stringify(state.sessions, null, 2);
      },

      importSessions: (jsonString, mode) => {
        try {
          // Parse JSON
          const parsed = JSON.parse(jsonString);

          // Valida se é um array
          if (!Array.isArray(parsed)) {
            return {
              success: false,
              error: 'Invalid format: expected an array of sessions',
            };
          }

          // Valida estrutura básica de cada sessão
          const isValid = parsed.every(
            (session) =>
              typeof session === 'object' &&
              session !== null &&
              typeof session.id === 'string' &&
              typeof session.name === 'string' &&
              Array.isArray(session.solves),
          );

          if (!isValid) {
            return {
              success: false,
              error: 'Invalid session structure',
            };
          }

          const imported = parsed as Session[];

          // Se não há sessões válidas, retorna erro
          if (imported.length === 0) {
            return {
              success: false,
              error: 'No valid sessions found',
            };
          }

          set((state) => {
            if (mode === 'replace') {
              return {
                sessions: imported,
                activeSessionId: imported[0].id,
              };
            } else {
              // merge
              return {
                sessions: [...state.sessions, ...imported],
                activeSessionId: state.activeSessionId,
              };
            }
          });

          return { success: true };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },

      // Statistics getters
      getSingle: () => {
        const session = get().getActiveSession();
        return calculateSingle(session?.solves || []);
      },

      getAo5: () => {
        const session = get().getActiveSession();
        return calculateAo5(session?.solves || []);
      },

      getAo12: () => {
        const session = get().getActiveSession();
        return calculateAo12(session?.solves || []);
      },

      getBestAo5: () => {
        const session = get().getActiveSession();
        return calculateBestAo5(session?.solves || []);
      },

      getBestAo12: () => {
        const session = get().getActiveSession();
        return calculateBestAo12(session?.solves || []);
      },
    }),
    {
      name: 'klick-sessions',
    },
  ),
);
