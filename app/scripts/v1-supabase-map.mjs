// A conversão dos dados da v1 no Supabase para o arquivo do Klick (spec D10), separada do script para os testes. Mantém os ids da v1 (os
// mesmos que a migração do localStorage usou) e devolve só o que falta no arquivo de comparação: o que já está lá, pelo id ou pela marca do
// solve (evento, instante, tempo, penalidade e embaralhamento), fica de fora.

/** @typedef {{ id: string, name: string, puzzle_type: string, created_at: string, updated_at: string }} V1SessionRow */
/** @typedef {{ id: string, session_id: string, time_ms: number, penalty: 'NONE' | '+2' | 'DNF', scramble: string, created_at: string, updated_at: string }} V1SolveRow */
/** @typedef {{ sessions: { id: string }[], solves: { id: string, event: string, at: number, ms: number, penalty: string | null, scramble: string }[] }} Existing */

/** @type {Record<string, string>} */
const EVENTS = { '3x3': '333', '2x2': '222', '4x4': '444', '5x5': '555', pyraminx: 'pyram', megaminx: 'minx', skewb: 'skewb', square1: 'sq1' };

// A marca de um solve. Tem de ser a mesma da deduplicação do primeiro login (`fingerprint`, em src/data/repository.ts): o script não importa
// o núcleo em TS, e o mesmo solve dos dois lados precisa dar a mesma marca (o teste confere).
/** @param {{ event: string, at: number, ms: number, penalty: string | null, scramble: string }} s */
export const mark = (s) => JSON.stringify([s.event, s.at, s.ms, s.penalty, s.scramble]);

/**
 * @param {V1SessionRow[]} sessions
 * @param {V1SolveRow[]} solves
 * @param {Existing} existing
 * @param {number} now
 */
export function missingFromV1(sessions, solves, existing, now) {
  const knownSolves = new Set(existing.solves.map((s) => s.id));
  const knownMarks = new Set(existing.solves.map(mark));
  const knownSessions = new Set(existing.sessions.map((s) => s.id));
  const byId = new Map(sessions.map((s) => [s.id, s]));
  /** @type {Map<string, { id: string }>} */
  const outSessions = new Map();
  /** @type {{ id: string }[]} */
  const outSolves = [];
  let order = 1000;
  for (const row of solves) {
    const session = byId.get(row.session_id);
    const event = session ? EVENTS[session.puzzle_type] : undefined;
    if (!session || !event) continue;
    const at = Date.parse(row.created_at);
    const solve = {
      id: row.id,
      sessionId: session.id,
      event,
      ms: row.time_ms,
      penalty: row.penalty === 'NONE' ? null : row.penalty,
      at,
      scramble: row.scramble,
      note: '',
      createdAt: at,
      updatedAt: Date.parse(row.updated_at),
      deletedAt: null,
    };
    if (knownSolves.has(solve.id) || knownMarks.has(mark(solve))) continue;
    outSolves.push(solve);
    if (!knownSessions.has(session.id) && !outSessions.has(session.id)) {
      const createdAt = Date.parse(session.created_at);
      const created = { id: session.id, name: session.name, event, order: order++, createdAt, updatedAt: Date.parse(session.updated_at), deletedAt: null };
      outSessions.set(session.id, created);
    }
  }
  return { format: 'klick', version: 1, exportedAt: now, sessions: [...outSessions.values()], solves: outSolves, profile: null };
}
