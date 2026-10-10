// Traduz toques nas zonas da tela em press()/release() do timer (porte de prototype/scripts/touch.js).
// Modo 'two': arma só com as duas zonas (esquerda e direita) pressionadas; o primeiro polegar que sai larga.
// Modo 'one': a área inteira é uma zona só.
import type { TimerState } from './timer';

export interface TouchArm {
  setMode(m: 'two' | 'one'): void;
  down(pointerId: number, zone: 'left' | 'right'): void;
  up(pointerId: number): void;
  cancelAll(): void; // abandona o que estiver pressionado sem largar o timer (ligação, troca de app, ponteiro perdido)
}

export function createTouchArm(
  { press, release, cancel, getState, getInspection, mode = 'two' }: {
    press: () => void;
    release: () => void;
    cancel: () => void;
    getState: () => TimerState;
    getInspection: () => boolean;
    mode?: 'two' | 'one';
  },
): TouchArm {
  const active = new Map<number, 'left' | 'right'>(); // pointerId → zona
  let pressed = false;
  let stopping = false; // dedos do gesto que parou o timer: ignorados até todos saírem

  const bothZones = () => {
    const zones = new Set(active.values());
    return zones.has('left') && zones.has('right');
  };
  const shouldArm = () => (mode === 'one' ? active.size > 0 : bothZones());
  const isRest = (st: TimerState) => st === 'idle' || st === 'done';

  return {
    setMode(m) {
      mode = m;
    },
    down(pointerId, zone) {
      const st = getState();
      active.set(pointerId, zone);
      if (st === 'running') {
        press();
        stopping = true;
        return;
      }
      if (stopping) return;
      const tapToInspect = isRest(st) && getInspection();
      if (!pressed && (tapToInspect || shouldArm())) {
        pressed = true;
        press();
      }
    },
    up(pointerId) {
      if (!active.has(pointerId)) return;
      active.delete(pointerId);
      if (stopping) {
        if (active.size === 0) stopping = false;
        return;
      }
      if (!pressed) return;
      if (isRest(getState())) {
        // toque que inicia a inspeção: solta quando todos os dedos saem
        if (active.size === 0) {
          pressed = false;
          release();
        }
        return;
      }
      pressed = false;
      release();
    },
    cancelAll() {
      active.clear();
      stopping = false;
      if (pressed) {
        pressed = false;
        cancel();
      }
    },
  };
}
