// Traduz toques nas zonas da tela em press()/release() do timer (porte de prototype/scripts/touch.js).
// Modo 'two': arma só com as duas zonas (esquerda e direita) pressionadas; o primeiro polegar que sai larga.
// Modo 'one': a área inteira é uma zona só.
//
// down e up aceitam o horário do evento do toque (event.timeStamp, a mesma base do timer) e o repassam a press e a release,
// que o repassam ao timer. Sem ele, o timer usa o próprio relógio, como antes.
import type { TimerState } from './timer';

export interface TouchArm {
  setMode(m: 'two' | 'one'): void;
  down(pointerId: number, zone: 'left' | 'right', at?: number): void;
  up(pointerId: number, at?: number): void;
  cancelAll(): void; // abandona o que estiver pressionado sem largar o timer (ligação, troca de app, ponteiro perdido)
}

export function createTouchArm(
  { press, release, cancel, getState, getInspection, mode = 'two' }: {
    press: (at?: number) => void;
    release: (at?: number) => void;
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
    down(pointerId, zone, at) {
      const st = getState();
      active.set(pointerId, zone);
      if (st === 'running') {
        press(at);
        stopping = true;
        return;
      }
      if (stopping) return;
      const tapToInspect = isRest(st) && getInspection();
      if (!pressed && (tapToInspect || shouldArm())) {
        pressed = true;
        press(at);
      }
    },
    up(pointerId, at) {
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
          release(at);
        }
        return;
      }
      pressed = false;
      release(at);
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
