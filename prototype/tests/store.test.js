import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORAGE_KEY, DEFAULT_SETTINGS, emptyState, seededState, loadState, saveState, addSolve, togglePenalty, setNote,
  deleteSolve, restoreSolve, sessionSolves, createSession, renameSession, updateSettings, toCsTimer,
} from '../scripts/store.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
const memory = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
};
const broken = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() {} };

test('salvar e carregar faz ida e volta', () => {
  const s = memory();
  const state = seededState(NOW);
  assert.equal(saveState(s, state), true);
  assert.deepEqual(loadState(s), state);
});

test('armazenamento vazio, inválido, quebrado ou ausente devolve null sem lançar', () => {
  const s = memory();
  assert.equal(loadState(s), null);
  s.setItem(STORAGE_KEY, '{nao é json');
  assert.equal(loadState(s), null);
  s.setItem(STORAGE_KEY, JSON.stringify({ version: 99, solves: [] }));
  assert.equal(loadState(s), null);
  assert.equal(loadState(broken), null);
  assert.equal(loadState(null), null);
  assert.equal(saveState(broken, emptyState()), false);
  assert.equal(saveState(null, emptyState()), false);
});

test('dado ilegível ganha cópia de segurança antes de ser sobrescrito', () => {
  const m = new Map();
  const s = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
  s.setItem(STORAGE_KEY, JSON.stringify({ version: 2, solves: [{ ms: 1 }] }));
  assert.equal(loadState(s), null);
  const backups = [...m.keys()].filter((k) => k.startsWith(`${STORAGE_KEY}.backup.`));
  assert.equal(backups.length, 1);
  assert.equal(m.get(backups[0]), JSON.stringify({ version: 2, solves: [{ ms: 1 }] }));
});

test('exporta no formato do csTimer: sessões, penalidades, nota e segundos', () => {
  const st = seededState(NOW);
  const out = toCsTimer(st);
  assert.equal(out.session1.length, 212);
  const first = st.solves[0];
  assert.deepEqual(out.session1[0], [[0, first.ms], first.scramble, '', Math.floor(first.at / 1000)]);
  assert.equal(out.session1[st.solves.findIndex((x) => x.penalty === 'DNF')][0][0], -1);
  assert.equal(out.session1[st.solves.findIndex((x) => x.penalty === '+2')][0][0], 2000);
  assert.deepEqual(JSON.parse(out.properties.sessionData), { 1: { name: 'Sessão 12', opt: {}, rank: 1 } });
});

test('ajustes salvos antigos ganham os padrões que faltam', () => {
  const s = memory();
  s.setItem(STORAGE_KEY, JSON.stringify({ ...emptyState(), settings: { theme: 'dark', sound: { pb: false } } }));
  const st = loadState(s);
  assert.equal(st.settings.theme, 'dark');
  assert.equal(st.settings.holdMs, DEFAULT_SETTINGS.holdMs);
  assert.deepEqual(st.settings.sound, { klick: true, insp: true, pb: false });
});

test('addSolve numera, marca a sessão atual e não muda o estado anterior', () => {
  const st = emptyState();
  const { state, solve } = addSolve(st, { ms: 60000, at: NOW, scramble: 'R U' });
  assert.equal(solve.id, 1);
  assert.equal(solve.session, 's1');
  assert.equal(state.nextId, 2);
  assert.equal(st.solves.length, 0);
});

test('togglePenalty liga e desliga; setNote grava a nota', () => {
  let { state } = addSolve(emptyState(), { ms: 60000, at: NOW, scramble: '' });
  state = togglePenalty(state, 1, '+2');
  assert.equal(state.solves[0].penalty, '+2');
  state = togglePenalty(state, 1, 'DNF');
  assert.equal(state.solves[0].penalty, 'DNF');
  state = togglePenalty(state, 1, 'DNF');
  assert.equal(state.solves[0].penalty, null);
  assert.equal(setNote(state, 1, 'cruz ruim').solves[0].note, 'cruz ruim');
});

test('excluir e desfazer devolve o solve na mesma posição', () => {
  const st = seededState(NOW);
  const target = st.solves[10];
  const { state, removed } = deleteSolve(st, target.id);
  assert.equal(state.solves.length, st.solves.length - 1);
  assert.deepEqual(restoreSolve(state, removed), st);
  assert.equal(deleteSolve(st, -1).removed, null);
});

test('sessões: criar troca para a nova; renomear ignora nome vazio; solves por sessão', () => {
  let st = seededState(NOW);
  assert.equal(sessionSolves(st).length, 212);
  st = createSession(st, '  Treino de cruz ');
  assert.equal(st.sessions.length, 2);
  assert.equal(st.sessions[1].name, 'Treino de cruz');
  assert.equal(st.currentSession, st.sessions[1].id);
  assert.equal(sessionSolves(st).length, 0);
  assert.equal(renameSession(st, st.currentSession, '  ').sessions[1].name, 'Treino de cruz');
  assert.equal(renameSession(st, st.currentSession, 'Cruz').sessions[1].name, 'Cruz');
});

test('nome padrão de sessão continua a numeração existente', () => {
  assert.equal(createSession(seededState(NOW), '').sessions[1].name, 'Sessão 13');
  assert.equal(createSession(emptyState(), '  ').sessions.at(-1).name, `Sessão ${emptyState().sessions.length + 1}`);
});

test('updateSettings mescla sem perder os outros ajustes', () => {
  const st = updateSettings(emptyState(), { holdMs: 550, sound: { insp: false } });
  assert.equal(st.settings.holdMs, 550);
  assert.equal(st.settings.inspection, true);
  assert.deepEqual(st.settings.sound, { klick: true, insp: false, pb: true });
});
