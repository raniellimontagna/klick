// Máquina de estados do timer. Pura: o relógio é injetado e o tempo avança só em tick().
// parado → (inspeção) → armando → pronto → resolvendo → resultado
export const STATES = Object.freeze({
  IDLE: 'idle',
  INSPECT: 'inspect',
  ARMING: 'arming',
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
});

const PLUS2_AFTER = 15000;
const DNF_AFTER = 17000;
const WARNINGS = [8000, 12000];

export function createTimer({ now = () => performance.now(), holdMs = 300, inspection = true } = {}) {
  let state = STATES.IDLE;
  let base = STATES.IDLE; // para onde volta se soltar antes do verde
  let holdStart = 0;
  let inspStart = 0;
  let startAt = 0;
  let pendingInspect = false;
  let penalty = null;
  let result = null;
  let warned = new Set();
  const listeners = { state: new Set(), warn: new Set(), done: new Set() };

  const emit = (ev, ...args) => listeners[ev].forEach((fn) => fn(...args));
  const set = (next) => {
    if (next === state) return;
    const prev = state;
    state = next;
    emit('state', next, prev);
  };
  const inInspection = () => state === STATES.INSPECT || ((state === STATES.ARMING || state === STATES.READY) && base === STATES.INSPECT);

  function press() {
    if (state === STATES.RUNNING) {
      result = { ms: Math.round(now() - startAt), penalty };
      set(STATES.DONE);
      emit('done', result);
      return;
    }
    if (state === STATES.IDLE || state === STATES.DONE) {
      if (inspection) {
        pendingInspect = true;
        return;
      }
      base = STATES.IDLE;
      holdStart = now();
      set(STATES.ARMING);
      tick();
      return;
    }
    if (state === STATES.INSPECT) {
      base = STATES.INSPECT;
      holdStart = now();
      set(STATES.ARMING);
      tick();
    }
  }

  function release() {
    if (pendingInspect) {
      pendingInspect = false;
      inspStart = now();
      warned = new Set();
      base = STATES.INSPECT;
      set(STATES.INSPECT);
      return;
    }
    if (state === STATES.ARMING) {
      set(base);
      return;
    }
    if (state === STATES.READY) {
      const ie = base === STATES.INSPECT ? now() - inspStart : 0;
      penalty = ie > DNF_AFTER ? 'DNF' : ie > PLUS2_AFTER ? '+2' : null;
      startAt = now();
      base = STATES.IDLE;
      set(STATES.RUNNING);
    }
  }

  function tick() {
    if (state === STATES.ARMING && now() - holdStart >= holdMs) set(STATES.READY);
    if (inInspection()) {
      const e = now() - inspStart;
      for (const w of WARNINGS) {
        if (e >= w && !warned.has(w)) {
          warned.add(w);
          emit('warn', w);
        }
      }
    }
  }

  return {
    press,
    release,
    tick,
    get state() {
      return state;
    },
    get armProgress() {
      if (state === STATES.READY) return 1;
      if (state !== STATES.ARMING) return 0;
      return holdMs <= 0 ? 1 : Math.min(1, (now() - holdStart) / holdMs);
    },
    get inspectElapsed() {
      return inInspection() ? now() - inspStart : 0;
    },
    get elapsed() {
      if (state === STATES.RUNNING) return now() - startAt;
      return state === STATES.DONE && result ? result.ms : 0;
    },
    get result() {
      return result;
    },
    setOptions(opts) {
      if (opts.holdMs !== undefined) holdMs = opts.holdMs;
      if (opts.inspection !== undefined) inspection = opts.inspection;
    },
    reset() {
      pendingInspect = false;
      base = STATES.IDLE;
      set(STATES.IDLE);
    },
    on(ev, fn) {
      listeners[ev].add(fn);
      return () => listeners[ev].delete(fn);
    },
  };
}
