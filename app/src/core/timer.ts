// Máquina de estados do timer (porte de prototype/scripts/timer.js). Pura: o relógio é injetado e o tempo avança só em tick().
// parado → (inspeção) → armando → pronto → resolvendo → resultado
//
// press, release e tick aceitam o horário do evento (event.timeStamp, na mesma base de performance.now()). Armar, largar,
// parar, a penalidade e os avisos da inspeção decidem por esse horário, e não pela hora em que o handler roda; sem ele, vale
// now(). Os getters armProgress, inspectElapsed e elapsed servem só à tela e continuam em now().
//
// Fases (marcar etapas do solve por toque): com N fases ligadas (2, 3 ou 4), em RUNNING os N-1 primeiros toques só marcam a fase e o N-ésimo
// para o cronômetro. Um toque a menos de PHASE_MIN_GAP_MS do anterior (ou da largada) não conta: é o quique do dedo, não uma fase. O número
// de fases vale no próximo solve (setOptions no meio de um solve não o muda); sem fases (0, o padrão) o primeiro toque para como sempre.
//
// Um ouvinte que lança não derruba a máquina nem os outros ouvintes: o erro vai para onError. É no 'done' que o solve é
// gravado, e ele sai mesmo que um ouvinte de 'state' quebre. O onError padrão relança o erro numa microtask, para ele
// continuar visível no navegador. O espaço segurado antes da inspeção (o estado ainda é 'idle') sai pelo evento 'pending', para
// quem precisa saber que o timer está ocupado mesmo sem mudança de estado.
import type { Penalty, PhaseOption } from './types';

export const STATES = Object.freeze({
  IDLE: 'idle',
  INSPECT: 'inspect',
  ARMING: 'arming',
  READY: 'ready',
  RUNNING: 'running',
  DONE: 'done',
} as const);

export type TimerState = (typeof STATES)[keyof typeof STATES];

// Menor intervalo entre dois toques para o segundo contar como fase (ms).
export const PHASE_MIN_GAP_MS = 300;

export interface TimerResult {
  ms: number; // tempo bruto, sem a penalidade
  penalty: Penalty;
  phases?: number[]; // a duração de cada fase, somando ms; só existe com fases ligadas
}

export interface Timer {
  press(at?: number): void; // at = event.timeStamp (mesma base de performance.now()); sem at, usa now()
  release(at?: number): void;
  tick(at?: number): void;
  cancel(): void; // abandona um segurar (ou o toque que iniciaria a inspeção) sem largar o timer
  reset(): void;
  setOptions(o: { holdMs?: number; inspection?: boolean; phases?: PhaseOption }): void;
  on(ev: 'state', fn: (next: TimerState, prev: TimerState) => void): () => void;
  on(ev: 'warn', fn: (ms: number) => void): () => void;
  on(ev: 'done', fn: (r: TimerResult) => void): () => void;
  on(ev: 'phase', fn: (index: number, ms: number) => void): () => void; // uma fase marcada: o índice (de 0) e o tempo da marca desde a largada
  on(ev: 'pending', fn: (held: boolean) => void): () => void; // o espaço segurado antes da inspeção começou (true) ou acabou (false)
  readonly state: TimerState;
  readonly armProgress: number; // 0 a 1, para o anel de armar
  readonly inspectElapsed: number;
  readonly elapsed: number;
  readonly result: TimerResult | null;
  readonly marks: readonly number[]; // as marcas da rodada, em ms desde a largada (sem a que para); zera na próxima largada
}

// Argumentos de cada evento, na ordem em que os ouvintes os recebem.
interface TimerEvents {
  state: [next: TimerState, prev: TimerState];
  warn: [ms: number];
  done: [result: TimerResult];
  phase: [index: number, ms: number];
  pending: [held: boolean];
}

const PLUS2_AFTER = 15000;
const DNF_AFTER = 17000;
const WARNINGS = [8000, 12000];

// onError padrão: o erro do ouvinte sai da máquina de estados e reaparece numa microtask (no navegador, como erro não tratado).
const rethrowLater = (err: unknown) =>
  queueMicrotask(() => {
    throw err;
  });

export function createTimer(
  {
    now = () => performance.now(),
    holdMs = 300,
    inspection = true,
    onError = rethrowLater,
  }: {
    now?: () => number;
    holdMs?: number;
    inspection?: boolean;
    onError?: (err: unknown) => void; // recebe o erro que um ouvinte lançou
  } = {},
): Timer {
  let state: TimerState = STATES.IDLE;
  let base: TimerState = STATES.IDLE; // para onde volta se soltar antes do verde
  let holdStart = 0;
  let inspStart = 0;
  let startAt = 0;
  let pendingInspect = false;
  let penalty: Penalty = null;
  let result: TimerResult | null = null;
  let warned = new Set<number>();
  let phases: PhaseOption = 0; // o que o próximo solve vai usar
  let runPhases: PhaseOption = 0; // o do solve em curso, fixado na largada
  let marks: number[] = [];
  const listeners: { [E in keyof TimerEvents]: Set<(...args: TimerEvents[E]) => void> } = {
    state: new Set(),
    warn: new Set(),
    done: new Set(),
    phase: new Set(),
    pending: new Set(),
  };

  const emit = <E extends keyof TimerEvents>(ev: E, ...args: TimerEvents[E]) => {
    listeners[ev].forEach((fn) => {
      try {
        fn(...args);
      } catch (err) {
        onError(err);
      }
    });
  };
  const set = (next: TimerState) => {
    if (next === state) return;
    const prev = state;
    state = next;
    emit('state', next, prev);
  };
  const setPending = (held: boolean) => {
    if (held === pendingInspect) return;
    pendingInspect = held;
    emit('pending', held);
  };
  const inInspection = () => state === STATES.INSPECT || ((state === STATES.ARMING || state === STATES.READY) && base === STATES.INSPECT);

  function press(at?: number): void {
    const t = at ?? now();
    if (state === STATES.RUNNING) {
      const ms = Math.round(t - startAt);
      if (runPhases > 0) {
        // Colado no toque anterior (ou na largada): não conta nem como fase nem como parada.
        if (ms - (marks[marks.length - 1] ?? 0) < PHASE_MIN_GAP_MS) return;
        if (marks.length + 1 < runPhases) {
          marks.push(ms);
          emit('phase', marks.length - 1, ms);
          return;
        }
        result = { ms, penalty, phases: [...marks, ms].map((m, i) => m - (marks[i - 1] ?? 0)) };
      } else {
        result = { ms, penalty };
      }
      set(STATES.DONE);
      emit('done', result);
      return;
    }
    if (state === STATES.IDLE || state === STATES.DONE) {
      if (inspection) {
        setPending(true);
        return;
      }
      base = STATES.IDLE;
      holdStart = t;
      set(STATES.ARMING);
      tick(t);
      return;
    }
    if (state === STATES.INSPECT) {
      base = STATES.INSPECT;
      holdStart = t;
      set(STATES.ARMING);
      tick(t);
    }
  }

  function release(at?: number): void {
    const t = at ?? now();
    tick(t); // reavalia o tempo: soltar depois do tempo de armar sempre larga
    if (pendingInspect) {
      setPending(false);
      inspStart = t;
      warned = new Set();
      base = STATES.INSPECT;
      set(STATES.INSPECT);
      return;
    }
    // Soltou antes do tempo de armar. Pelo horário do evento isso vale também para o pronto que um tick no horário do
    // handler adiantou.
    if (state === STATES.ARMING || (state === STATES.READY && t - holdStart < holdMs)) {
      set(base);
      return;
    }
    if (state === STATES.READY) {
      const ie = base === STATES.INSPECT ? t - inspStart : 0;
      penalty = ie > DNF_AFTER ? 'DNF' : ie > PLUS2_AFTER ? '+2' : null;
      startAt = t;
      runPhases = phases;
      marks = [];
      base = STATES.IDLE;
      set(STATES.RUNNING);
    }
  }

  function tick(at?: number): void {
    const t = at ?? now();
    if (state === STATES.ARMING && t - holdStart >= holdMs) set(STATES.READY);
    if (inInspection()) {
      const e = t - inspStart;
      for (const w of WARNINGS) {
        if (e >= w && !warned.has(w)) {
          warned.add(w);
          emit('warn', w);
        }
      }
    }
  }

  function on<E extends keyof TimerEvents>(ev: E, fn: (...args: TimerEvents[E]) => void): () => void {
    listeners[ev].add(fn);
    return () => {
      listeners[ev].delete(fn);
    };
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
    get marks() {
      return marks.slice();
    },
    setOptions(o) {
      if (o.holdMs !== undefined) holdMs = o.holdMs;
      if (o.inspection !== undefined) inspection = o.inspection;
      if (o.phases !== undefined) phases = o.phases;
    },
    reset() {
      setPending(false);
      base = STATES.IDLE;
      result = null;
      penalty = null;
      marks = [];
      set(STATES.IDLE);
    },
    // Abandona um segurar (ou o toque que iniciaria a inspeção) sem largar o timer.
    cancel() {
      setPending(false);
      if (state === STATES.ARMING || state === STATES.READY) set(base);
    },
    on,
  };
}
