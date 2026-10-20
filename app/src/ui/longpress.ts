// O toque longo como ação do Svelte (a lista da Evolução: segurar uma linha entra na seleção). Segurar `ms` sem mexer chama `onLong`;
// arrastar mais de LONG_PRESS_SLOP_PX (a pessoa está rolando), soltar antes, cancelar o ponteiro ou rolar a página cancela. O clique que o
// navegador manda ao soltar, depois de um toque longo, não chega à linha (senão ela seria tocada de novo), e o menu do toque longo do
// Android não abre por cima. Só o dedo e a caneta: um clique demorado do mouse continua sendo um clique. O do Timer (ui/timer/input.ts)
// é outra coisa: segurar e soltar do cronômetro.
import type { ActionReturn } from 'svelte/action';

export const LONG_PRESS_MS = 450;
export const LONG_PRESS_SLOP_PX = 10;

export interface LongPressParams {
  ms: number;
  onLong: () => void;
}

export function longpress(node: HTMLElement, initial: LongPressParams): ActionReturn<LongPressParams> {
  let params = initial;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let x = 0;
  let y = 0;
  let fired = false; // o toque longo aconteceu: o próximo clique é o do soltar, e não vale

  const cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const onDown = (e: PointerEvent): void => {
    fired = false;
    cancel();
    if (e.pointerType === 'mouse') return;
    x = e.clientX;
    y = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      fired = true;
      params.onLong();
    }, params.ms);
  };
  const onMove = (e: PointerEvent): void => {
    if (timer !== null && Math.hypot(e.clientX - x, e.clientY - y) > LONG_PRESS_SLOP_PX) cancel();
  };
  const onClick = (e: MouseEvent): void => {
    if (!fired) return;
    fired = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  const onMenu = (e: Event): void => {
    if (timer !== null || fired) e.preventDefault();
  };

  node.addEventListener('pointerdown', onDown);
  node.addEventListener('pointermove', onMove);
  node.addEventListener('pointerup', cancel);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('pointerleave', cancel);
  node.addEventListener('click', onClick, true);
  node.addEventListener('contextmenu', onMenu);
  window.addEventListener('scroll', cancel, { capture: true, passive: true });
  return {
    update(next) {
      params = next;
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', onDown);
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerup', cancel);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('pointerleave', cancel);
      node.removeEventListener('click', onClick, true);
      node.removeEventListener('contextmenu', onMenu);
      window.removeEventListener('scroll', cancel, { capture: true });
    },
  };
}
