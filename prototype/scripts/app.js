// Orquestra o protótipo: estado, timer, entrada (teclado e toque), Centro, telas e persistência.
import { createTimer } from './timer.js';
import { createTouchArm } from './touch.js';
import { createSound } from './sound.js';
import { pickCoachMessage } from './coach.js';
import { ringFor, eyesFor, renderCentro, updateCentro } from './centro.js';
import { achievedIds, milestoneProgress, resultKind, formatMs, formatSolve } from './stats.js';
import { scrambleAt } from './data.js';
import { T } from './strings.js';
import * as store from './store.js';
import { renderTimer, paintTime } from './ui/timer-view.js';
import { renderEvolucao } from './ui/evolucao-view.js';
import { renderCompanion } from './ui/companion-view.js';
import { renderAjustes } from './ui/ajustes-view.js';
import { showToast, hideToast, announce, openShortcuts, openSessions, openOnboarding, openExport } from './ui/overlays.js';
import { dateLabel } from './ui/format.js';

const TABS = ['timer', 'evolucao', 'companion', 'ajustes'];
const REACTION_DELAY = 500;
const REACTION_MS = 2500;
const COACH_MS = 6000;
const SLEEP_AFTER = 5 * 60000;
const ORBIT_MS = 950;

const $ = (s) => document.querySelector(s);
const root = document.documentElement;
const body = document.body;
const screens = Object.fromEntries(TABS.map((t) => [t, $(`[data-screen="${t}"]`)]));
const timeEl = $('[data-time]');
const coachEl = $('[data-coach]');
const slot = $('[data-centro-slot]');
const noteForm = $('[data-noteform]');

const storage = store.safeStorage();
let state = store.loadState(storage);
const firstRun = !state;
if (!state) state = store.seededState(Date.now());

const sessionSolves = () => store.sessionSolves(state);
const lastOfSession = () => sessionSolves().at(-1) || null;

const ui = {
  tab: 'timer',
  scramble: state.solves.length,
  lastId: lastOfSession()?.id ?? null,
  lastKind: null,
  showResult: false,
  reaction: null,
  coach: null,
  orbit: 0,
  sleeping: false,
  lastInput: Date.now(),
  removed: null,
  removedUntil: 0,
  preview: null,
  period: '30',
  evoSession: 'all',
  confirm: null,
  looping: false,
  swallowClick: false,
  spaceHeld: false,
  previewGen: 0,
  confirmGen: 0,
  sig: '',
  text: '',
  coachText: null,
};

const mqDark = matchMedia('(prefers-color-scheme: dark)');
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
const mqCoarse = matchMedia('(pointer: coarse)');
const theme = () => (state.settings.theme === 'system' ? (mqDark.matches ? 'dark' : 'light') : state.settings.theme);
const reduced = () => state.settings.reducedMotion === 'always' || mqReduce.matches;

const timer = createTimer({ now: () => performance.now(), holdMs: state.settings.holdMs, inspection: state.settings.inspection });
const sound = createSound(state.settings.sound);
const touch = createTouchArm({
  press: () => timer.press(),
  release: () => timer.release(),
  cancel: () => timer.cancel(),
  getState: () => timer.state,
  getInspection: () => state.settings.inspection,
  mode: state.settings.mobileArm,
});

const lastSolve = () => state.solves.find((x) => x.id === ui.lastId) || null;
const currentScramble = () => scrambleAt(ui.scramble);
const sessionName = () => (state.sessions.find((s) => s.id === state.currentSession) || {}).name || '';

function save() {
  store.saveState(storage, state);
}

function commit(next) {
  state = next;
  save();
  renderAll();
}

function applyPrefs() {
  if (state.settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = state.settings.theme;
  root.dataset.reducedMotion = String(reduced());
  root.dataset.arm = state.settings.mobileArm;
  timer.setOptions({ holdMs: state.settings.holdMs, inspection: state.settings.inspection });
  touch.setMode(state.settings.mobileArm);
  zones.querySelector('[data-zone="left"]').textContent = state.settings.mobileArm === 'one' ? 'toque e segure' : 'polegar';
  for (const k of ['klick', 'insp', 'pb']) sound.setEnabled(k, state.settings.sound[k]);
}

// ---------- Centro e partes que mudam a cada quadro ----------
function centroView() {
  const now = performance.now();
  if (ui.sleeping) return { state: 'sleep' };
  if (timer.state === 'inspect') return { state: 'inspect', inspectElapsed: timer.inspectElapsed };
  if (timer.state === 'arming') return { state: 'arming', armProgress: timer.armProgress };
  if (timer.state === 'ready' || timer.state === 'running') return { state: timer.state };
  if (ui.reaction && now < ui.reaction.from) return { state: 'running' }; // ainda imóvel: a reação vem depois
  if (ui.reaction && now < ui.reaction.until) return { state: 'reaction', result: ui.reaction.kind };
  return { state: 'idle', orbit: reduced() ? null : ui.orbit };
}

function idleText() {
  const insp = state.settings.inspection;
  if (!mqCoarse.matches) return insp ? T.coach.idleInsp : T.coach.idle;
  if (insp) return T.coach.idleInspTouch;
  return state.settings.mobileArm === 'one' ? T.coach.idleOne : T.coach.idleTouch;
}

function coachText(view) {
  const now = performance.now();
  if (ui.coach && now >= ui.coach.from && now < ui.coach.until) return ui.coach.text;
  if (timer.state === 'inspect') return T.coach.inspect;
  if (timer.state === 'arming') return T.coach.arming;
  if (timer.state === 'ready') return T.coach.ready;
  if (view.state === 'running' || view.state === 'reaction') return '';
  return idleText();
}

function timeText() {
  const e = timer.inspectElapsed;
  if (timer.state === 'running') return formatMs(timer.elapsed);
  if (e > 0 && ['inspect', 'arming', 'ready'].includes(timer.state)) return e > 17000 ? 'DNF' : e > 15000 ? '+2' : String(Math.ceil((15000 - e) / 1000));
  if (timer.state === 'arming' || timer.state === 'ready') return '0:00.00';
  const last = lastSolve();
  return last ? formatSolve(last) : '0:00.00';
}

function paintLive() {
  const view = centroView();
  const ring = ringFor(view);
  const eyes = eyesFor(view);
  const sig = `${theme()}|${state.finish}|${ring.join()}|${eyes}`;
  if (sig !== ui.sig) {
    updateCentro(slot.querySelector('svg'), { theme: theme(), finish: state.finish, ring, eyes });
    ui.sig = sig;
  }
  body.dataset.cview = view.state;
  body.dataset.result = timer.state === 'done' && ui.showResult ? ui.lastKind : '';
  const e = timer.inspectElapsed;
  body.dataset.insp = timer.state === 'inspect' ? (e > 15000 ? 'over' : e >= 12000 ? '12' : e >= 8000 ? '8' : '') : '';
  const text = timeText();
  if (text !== ui.text) {
    paintTime(timeEl, text);
    ui.text = text;
  }
  const said = coachText(view);
  if (said !== ui.coachText) {
    if (said) coachEl.textContent = said;
    coachEl.classList.toggle('quiet', !said);
    ui.coachText = said;
  }
}

function needsFrame() {
  const now = performance.now();
  return ['inspect', 'arming', 'ready', 'running'].includes(timer.state) || (ui.reaction && now < ui.reaction.until) || (ui.coach && now < ui.coach.until);
}

function frame() {
  timer.tick();
  paintLive();
  if (needsFrame()) requestAnimationFrame(frame);
  else ui.looping = false;
}

function kick() {
  if (ui.looping) return;
  ui.looping = true;
  requestAnimationFrame(frame);
}

function mountCentro() {
  slot.innerHTML = renderCentro({
    theme: theme(),
    finish: state.finish,
    topLit: achievedIds(state.solves, Date.now()).length,
    sideLit: state.trail.filter(Boolean).length,
    label: 'Centro',
  });
  ui.sig = '';
}

// ---------- Telas ----------
function renderTimerScreen() {
  const last = lastSolve();
  const idx = last ? state.solves.indexOf(last) : -1;
  const sess = sessionSolves();
  renderTimer({
    root: screens.timer,
    state,
    session: sess,
    last,
    history: idx >= 0 ? state.solves.slice(0, idx) : [],
    sessionHistory: last ? sess.slice(0, sess.indexOf(last)) : [],
    number: last ? sess.indexOf(last) + 1 : 0,
    kind: ui.lastKind,
    showResult: ui.showResult && timer.state === 'done',
    scramble: currentScramble(),
    now: Date.now(),
  });
}

// Depois de redesenhar a tela, o foco volta ao mesmo controle: quem usa teclado não volta ao topo.
const FOCUS_KEYS = ['data-set', 'data-val', 'data-toggle', 'data-period', 'data-evo-session', 'data-trail', 'data-finish', 'data-silent', 'data-data'];
function focusKey(el) {
  if (!(el instanceof Element) || !el.closest('[data-screen]')) return null;
  const parts = FOCUS_KEYS.filter((k) => el.hasAttribute(k)).map((k) => `[${k}="${CSS.escape(el.getAttribute(k))}"]`);
  return parts.length ? parts.join('') : null;
}

function renderAll() {
  const refocus = focusKey(document.activeElement);
  const now = Date.now();
  $('[data-session-pill]').textContent = `3×3 · ${sessionName()} ▾`;
  $('[data-date]').textContent = dateLabel(now);
  if (ui.tab === 'timer') renderTimerScreen();
  if (ui.tab === 'evolucao') renderEvolucao({ root: screens.evolucao, solves: state.solves, sessions: state.sessions, sessionFilter: ui.evoSession, period: ui.period, now });
  if (ui.tab === 'companion') renderCompanion({ root: screens.companion, milestones: milestoneProgress(state.solves, now), trail: state.trail, finish: state.finish, preview: ui.preview, silent: state.settings.silent, theme: theme() });
  if (ui.tab === 'ajustes') renderAjustes({ root: screens.ajustes, settings: state.settings, confirm: ui.confirm });
  mountCentro();
  ui.text = '';
  ui.coachText = null;
  paintLive();
  if (refocus && !document.activeElement?.closest('[data-screen]')) document.querySelector(`[data-screen]:not([hidden]) ${refocus}`)?.focus();
}

function go(tab) {
  if (!TABS.includes(tab)) return;
  if (tab !== 'timer') abandonHold();
  ui.tab = tab;
  for (const t of TABS) screens[t].hidden = t !== tab;
  document.querySelectorAll('[data-tab]').forEach((b) => (b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  renderAll();
}

// ---------- Solves ----------
function handleSolve(ms, penalty) {
  const now = Date.now();
  const history = state.solves;
  const sessionBefore = sessionSolves();
  const before = achievedIds(history, now);
  const { state: next, solve } = store.addSolve(state, { ms, penalty, at: now, scramble: currentScramble() });
  const after = achievedIds(next.solves, now);
  const fresh = after.filter((id) => !before.includes(id));
  const msg = pickCoachMessage({
    solve,
    history,
    sessionSolves: sessionBefore,
    newMilestones: fresh,
    achievedCount: after.length,
    dailyGoal: state.settings.dailyGoal,
    silent: state.settings.silent,
  });
  const kind = resultKind(history, solve, sessionBefore);
  const t0 = performance.now();
  ui.removed = null; // desfazer vale só até o próximo solve
  hideToast();
  ui.lastId = solve.id;
  ui.lastKind = kind;
  ui.showResult = true;
  ui.scramble += 1;
  ui.reaction = { kind, from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + REACTION_MS };
  ui.coach = msg ? { text: msg.text, from: t0 + REACTION_DELAY, until: t0 + REACTION_DELAY + COACH_MS } : null;
  if (kind === 'pb') {
    setTimeout(() => {
      if (ui.reaction && ui.reaction.kind === 'pb' && timer.state === 'done') sound.chord();
    }, REACTION_DELAY);
  }
  announce(`${T.aria.final(formatSolve(solve))}${msg ? ` ${msg.text}` : ''}`);
  commit(next);
  document.querySelector('[data-heat] .today')?.classList.add('pop');
  kick();
}

function act(name) {
  const last = lastSolve();
  if (!last || timer.state !== 'done' || !ui.showResult) return;
  if (name === 'plus2' || name === 'dnf') {
    const next = store.togglePenalty(state, last.id, name === 'plus2' ? '+2' : 'DNF');
    const idx = next.solves.findIndex((x) => x.id === last.id);
    const before = next.solves.slice(0, idx);
    ui.lastKind = resultKind(before, next.solves[idx], before.filter((x) => x.session === next.solves[idx].session));
    if (ui.reaction) ui.reaction.kind = ui.lastKind; // o anel e o acorde seguem o resultado corrigido
    ui.coach = null;
    commit(next);
    announce(T.aria.final(formatSolve(next.solves[idx])));
  } else if (name === 'note') {
    noteForm.hidden = false;
    noteForm.dataset.solveId = String(last.id);
    noteForm.note.value = last.note || '';
    noteForm.note.focus();
  } else if (name === 'delete') {
    const { state: next, removed } = store.deleteSolve(state, last.id);
    ui.removed = removed;
    ui.removedUntil = Date.now() + 6000; // Z vale enquanto o aviso estiver na tela (6 s)
    noteForm.hidden = true;
    ui.showResult = false;
    ui.reaction = null;
    ui.coach = null;
    state = next;
    ui.lastId = lastOfSession()?.id ?? null;
    save();
    renderAll();
    showToast(T.toast.deleted, { action: mqCoarse.matches ? T.toast.undoTouch : T.toast.undo, onAction: undo });
  }
}

function undo() {
  if (!ui.removed || Date.now() > ui.removedUntil) return;
  const r = ui.removed;
  ui.removed = null;
  ui.lastId = r.solve.id;
  noteForm.hidden = true;
  hideToast();
  commit(store.restoreSolve(state, r));
}

function resetUi() {
  timer.reset();
  noteForm.hidden = true;
  ui.showResult = false;
  ui.reaction = null;
  ui.coach = null;
  ui.removed = null;
  ui.lastId = lastOfSession()?.id ?? null;
  ui.evoSession = 'all';
  ui.scramble = state.solves.length;
}

function resetTo(fresh) {
  state = { ...fresh, settings: state.settings, onboarded: true };
  resetUi();
  save();
  renderAll();
}

// ---------- Eventos do timer ----------
timer.on('state', (next) => {
  body.dataset.tstate = next;
  body.classList.toggle('solving', next === 'running');
  if (next === 'ready') sound.klick();
  if (next === 'inspect' || next === 'arming') {
    ui.reaction = null;
    ui.coach = null;
    ui.showResult = false;
    noteForm.hidden = true;
    renderTimerScreen();
  }
  kick();
});
timer.on('warn', () => sound.tick());
timer.on('done', ({ ms, penalty }) => {
  sound.klick();
  handleSolve(ms, penalty);
});

// ---------- Entrada: teclado ----------
const typing = (e) => e.target instanceof Element && e.target.closest('input, textarea, select');
const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));

function wake() {
  ui.lastInput = Date.now();
  if (ui.sleeping) {
    ui.sleeping = false;
    paintLive();
  }
}

document.addEventListener('keydown', (e) => {
  wake();
  if (dialogOpen()) return;
  if (timer.state === 'running') {
    e.preventDefault();
    if (e.repeat) return; // espaço ainda segurado de antes não para o solve
    timer.press();
    kick();
    return;
  }
  if (typing(e)) {
    if (e.key === 'Escape') {
      noteForm.hidden = true;
      e.target.blur();
    }
    return;
  }
  if (e.code === 'Space') {
    if (ui.tab !== 'timer') return;
    e.preventDefault();
    if (!e.repeat) {
      ui.spaceHeld = true;
      sound.unlock();
      timer.press();
      kick();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  if (e.key === '?') return openShortcuts();
  if (/^[1-4]$/.test(e.key)) return go(TABS[Number(e.key) - 1]);
  if (ui.tab !== 'timer' || timer.state === 'inspect') return;
  const k = e.key.toLowerCase();
  if (k === 'p') act('plus2');
  else if (k === 'd') act('dnf');
  else if (k === 'm') {
    e.preventDefault();
    act('note');
  } else if (e.key === 'Backspace') act('delete');
  else if (k === 'z') undo();
  else if (k === 'n') {
    ui.scramble += 1;
    renderTimerScreen();
  }
});

// Todo espaço que armou recebe o seu soltar, mesmo se a aba mudou ou um diálogo abriu no meio.
document.addEventListener('keyup', (e) => {
  if (e.code !== 'Space' || !ui.spaceHeld) return;
  ui.spaceHeld = false;
  e.preventDefault();
  if (ui.tab !== 'timer' || dialogOpen()) abandonHold();
  else timer.release();
  kick();
});

// ---------- Entrada: toque e clique ----------
// Com o timer rodando, qualquer toque para (como no stackmat) e o clique que viria em seguida é engolido.
document.addEventListener(
  'pointerdown',
  (e) => {
    wake();
    sound.unlock();
    if (e.isPrimary) ui.swallowClick = false; // um segundo dedo não libera o clique do primeiro
    if (timer.state === 'running' && !e.target.closest('[data-zone]')) {
      e.preventDefault();
      ui.swallowClick = true;
      timer.press();
      kick();
    }
  },
  true,
);
document.addEventListener(
  'click',
  (e) => {
    if (!ui.swallowClick) return;
    ui.swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  },
  true,
);

const zones = $('[data-zones]');
const zoneOf = new Map();
zones.addEventListener('contextmenu', (e) => e.preventDefault());
function pressZone(e, z) {
  e.preventDefault();
  try {
    z.setPointerCapture(e.pointerId);
  } catch {
    /* captura é conforto: o soltar também é ouvido na janela, e sair do Timer ou um pointercancel limpam o toque */
  }
  zoneOf.set(e.pointerId, z);
  z.classList.add('down');
  touch.down(e.pointerId, z.dataset.zone);
  kick();
}
zones.addEventListener('pointerdown', (e) => {
  const z = e.target.closest('[data-zone]');
  if (z) pressZone(e, z);
});
// Um toque: a tela do Timer inteira arma, menos os controles (spec 7.3).
const CONTROLS = 'button, a, input, select, textarea, label, dialog, [data-noteform]';
screens.timer.addEventListener('pointerdown', (e) => {
  if (state.settings.mobileArm !== 'one' || !mqCoarse.matches || e.defaultPrevented) return;
  if (e.target.closest('[data-zone]') || e.target.closest(CONTROLS)) return;
  pressZone(e, zones.querySelector('[data-zone="left"]'));
});
const lift = (e) => {
  const z = zoneOf.get(e.pointerId);
  if (!z) return;
  zoneOf.delete(e.pointerId);
  if (![...zoneOf.values()].includes(z)) z.classList.remove('down');
  touch.up(e.pointerId);
  kick();
};
window.addEventListener('pointerup', lift);
zones.addEventListener('pointercancel', () => abandonHold());

// Perdeu o foco, a página sumiu (ligação, troca de app) ou o sistema cancelou o toque: abandona sem largar.
function abandonHold() {
  ui.spaceHeld = false;
  touch.cancelAll();
  zoneOf.clear();
  zones.querySelectorAll('.zone.down').forEach((z) => z.classList.remove('down'));
  timer.cancel(); // só muda o estado armando ou pronto, e sempre esquece o toque de inspeção pendente
}
window.addEventListener('blur', abandonHold);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) abandonHold();
});

noteForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = Number(noteForm.dataset.solveId);
  noteForm.hidden = true;
  if (state.solves.some((x) => x.id === id)) commit(store.setNote(state, id, noteForm.note.value.trim()));
});

function sessionsDialog() {
  const counts = {};
  for (const x of state.solves) counts[x.session] = (counts[x.session] || 0) + 1;
  openSessions({
    sessions: state.sessions,
    current: state.currentSession,
    counts,
    onPick: (id) => {
      state = { ...state, currentSession: id };
      resetUi();
      save();
      renderAll();
    },
    onCreate: (name) => {
      state = store.createSession(state, name);
      resetUi();
      save();
      renderAll();
    },
    onRename: (name) => commit(store.renameSession(state, state.currentSession, name)),
  });
}

function pickFinish(f) {
  const done = achievedIds(state.solves, Date.now()).length;
  if (f === 'fosco' || (f === 'brilho' && done === 9)) {
    ui.preview = null;
    commit({ ...state, finish: f });
    return;
  }
  ui.preview = f; // bloqueado: mostra uma prévia por 3 s
  const gen = ++ui.previewGen;
  renderAll();
  setTimeout(() => {
    if (ui.previewGen === gen) {
      ui.preview = null;
      renderAll();
    }
  }, 3000);
}

function exportData() {
  const json = JSON.stringify(store.toCsTimer(state));
  const showText = () => openExport({ json, onCopied: () => showToast(T.toast.exportCopied) });
  // Dentro de um iframe (o link privado) o download é bloqueado sem aviso: mostra o texto para copiar.
  if (window.top !== window.self) return showText();
  try {
    const url = URL.createObjectURL(new Blob([json], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `klick-cstimer-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    showText();
  }
}

function onboarding(mode) {
  openOnboarding({
    theme: theme(),
    holdMs: Math.max(300, state.settings.holdMs),
    mode,
    onExample: () => commit({ ...state, onboarded: true }),
    onFresh: () => resetTo(store.emptyState()),
  });
}

function dataAction(id) {
  if (id === 'export') return exportData();
  if (id === 'onboarding') return onboarding('review');
  if (ui.confirm !== id) {
    ui.confirm = id;
    const gen = ++ui.confirmGen;
    renderAll();
    setTimeout(() => {
      if (ui.confirmGen === gen && ui.confirm === id) {
        ui.confirm = null;
        renderAll();
      }
    }, 4000);
    return;
  }
  ui.confirm = null;
  resetTo(id === 'seed' ? store.seededState(Date.now()) : store.emptyState());
}

function applySetting(patch) {
  if (patch.silent) ui.coach = null;
  state = store.updateSettings(state, patch);
  save();
  applyPrefs();
  renderAll();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) return go(t.dataset.tab);
  const a = e.target.closest('[data-act]');
  if (a) return act(a.dataset.act);
  if (e.target.closest('[data-session-pill]')) return sessionsDialog();
  const per = e.target.closest('[data-period]');
  if (per) {
    ui.period = per.dataset.period;
    return renderAll();
  }
  const fin = e.target.closest('[data-finish]');
  if (fin) return pickFinish(fin.dataset.finish);
  const tr = e.target.closest('[data-trail]');
  if (tr) {
    const trail = [...state.trail];
    trail[Number(tr.dataset.trail)] = !trail[Number(tr.dataset.trail)];
    return commit({ ...state, trail });
  }
  const set = e.target.closest('[data-set]');
  if (set) return applySetting({ [set.dataset.set]: set.dataset.set === 'holdMs' ? Number(set.dataset.val) : set.dataset.val });
  const data = e.target.closest('[data-data]');
  if (data) return dataAction(data.dataset.data);
});

document.addEventListener('change', (e) => {
  const tg = e.target.closest('[data-toggle]');
  if (tg) {
    const key = tg.dataset.toggle;
    return applySetting(key.startsWith('sound.') ? { sound: { [key.slice(6)]: tg.checked } } : { [key]: tg.checked });
  }
  if (e.target.matches('[data-silent]')) return applySetting({ silent: e.target.checked });
  if (e.target.matches('[data-evo-session]')) {
    ui.evoSession = e.target.value;
    renderAll();
  }
});

// Órbita do adesivo ocioso e sono depois de 5 min parado.
setInterval(() => {
  if (!ui.sleeping && Date.now() - ui.lastInput > SLEEP_AFTER && (timer.state === 'idle' || timer.state === 'done')) {
    ui.sleeping = true;
    paintLive();
  }
  if (!document.hidden && centroView().state === 'idle' && !reduced()) {
    ui.orbit += 1;
    paintLive();
  }
}, ORBIT_MS);

for (const mq of [mqDark, mqReduce, mqCoarse]) {
  mq.addEventListener('change', () => {
    applyPrefs();
    renderAll();
  });
}

applyPrefs();
go('timer');
if (firstRun || !state.onboarded) onboarding('first');
