// Estado do app e persistência em localStorage (só conveniência: pode falhar e o app segue funcionando).
import { buildSeed } from './data.js';

export const STORAGE_KEY = 'klick.v2.prototype';

export const DEFAULT_SETTINGS = Object.freeze({
  inspection: true,
  holdMs: 300,
  mobileArm: 'two',
  theme: 'system',
  sound: Object.freeze({ klick: true, insp: true, pb: true }),
  silent: false,
  reducedMotion: 'system',
  dailyGoal: 20,
});

const cloneSettings = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over, sound: { ...DEFAULT_SETTINGS.sound, ...(over.sound || {}) } });

export function emptyState() {
  return {
    version: 1,
    solves: [],
    sessions: [{ id: 's1', name: 'Sessão 1' }],
    currentSession: 's1',
    settings: cloneSettings(),
    trail: Array(9).fill(false),
    finish: 'fosco',
    onboarded: false,
    nextId: 1,
  };
}

export function seededState(nowTs) {
  const seed = buildSeed(nowTs);
  return {
    ...emptyState(),
    solves: seed.solves,
    sessions: seed.sessions,
    currentSession: seed.sessions[0].id,
    trail: [true, true, true, true, false, false, false, false, false],
    nextId: seed.solves.length + 1,
  };
}

export function safeStorage() {
  try {
    const s = globalThis.localStorage;
    s.setItem('__klick_probe__', '1');
    s.removeItem('__klick_probe__');
    return s;
  } catch {
    return null;
  }
}

export function loadState(storage) {
  if (!storage) return null;
  let raw = null;
  try {
    raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data && data.version === 1 && Array.isArray(data.solves)) return { ...emptyState(), ...data, settings: cloneSettings(data.settings) };
  } catch {
    /* ilegível: segue para a cópia abaixo */
  }
  // Nada se perde: o que não deu para ler ganha uma cópia antes de o app gravar por cima.
  if (raw) {
    try {
      storage.setItem(`${STORAGE_KEY}.backup.${Date.now()}`, raw);
    } catch {
      /* sem espaço: o app segue, só sem a cópia */
    }
  }
  return null;
}

export function saveState(storage, state) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Exportação no formato do csTimer: uma lista por sessão ([[penalidade, ms], embaralhamento, nota, segundos])
// e os nomes em properties.sessionData. Penalidade: 0, 2000 (+2) ou -1 (DNF).
const CS_PENALTY = { '+2': 2000, DNF: -1 };
export function toCsTimer(state) {
  const out = {};
  const meta = {};
  state.sessions.forEach((s, i) => {
    const n = i + 1;
    out[`session${n}`] = state.solves
      .filter((x) => x.session === s.id)
      .map((x) => [[CS_PENALTY[x.penalty] ?? 0, x.ms], x.scramble, x.note || '', Math.floor(x.at / 1000)]);
    meta[n] = { name: s.name, opt: {}, rank: n };
  });
  out.properties = { sessionData: JSON.stringify(meta) };
  return out;
}

export function addSolve(state, { ms, penalty = null, at, scramble }) {
  const solve = { id: state.nextId, ms, penalty, at, scramble, note: '', session: state.currentSession };
  return { state: { ...state, solves: [...state.solves, solve], nextId: state.nextId + 1 }, solve };
}

export function togglePenalty(state, id, penalty) {
  return { ...state, solves: state.solves.map((x) => (x.id === id ? { ...x, penalty: x.penalty === penalty ? null : penalty } : x)) };
}

export function setNote(state, id, note) {
  return { ...state, solves: state.solves.map((x) => (x.id === id ? { ...x, note } : x)) };
}

export function deleteSolve(state, id) {
  const index = state.solves.findIndex((x) => x.id === id);
  if (index < 0) return { state, removed: null };
  return { state: { ...state, solves: state.solves.filter((x) => x.id !== id) }, removed: { solve: state.solves[index], index } };
}

export function restoreSolve(state, removed) {
  if (!removed) return state;
  const solves = [...state.solves];
  solves.splice(removed.index, 0, removed.solve);
  return { ...state, solves };
}

export function sessionSolves(state, sessionId = state.currentSession) {
  return state.solves.filter((x) => x.session === sessionId);
}

export function createSession(state, name) {
  const n = state.sessions.length + 1;
  const id = `s${Date.now().toString(36)}${n}`;
  const used = state.sessions.map((s) => Number(/^Sessão (\d+)$/.exec(s.name)?.[1] ?? 0));
  const next = Math.max(state.sessions.length, ...used) + 1;
  const session = { id, name: name && name.trim() ? name.trim() : `Sessão ${next}` };
  return { ...state, sessions: [...state.sessions, session], currentSession: id };
}

export function renameSession(state, id, name) {
  if (!name || !name.trim()) return state;
  return { ...state, sessions: state.sessions.map((s) => (s.id === id ? { ...s, name: name.trim() } : s)) };
}

export function updateSettings(state, patch) {
  return { ...state, settings: cloneSettings({ ...state.settings, ...patch, sound: { ...state.settings.sound, ...(patch.sound || {}) } }) };
}
