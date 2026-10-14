// Entrada do Timer: teclado, toque e clique (porte do tratamento de entrada de prototype/scripts/app.js).
// Sem Svelte e sem a tela: recebe o timer, o armar por toque e o que a tela precisa saber por InputTarget, e liga os
// ouvintes em document, window e nas zonas. Assim o comportamento se testa sem navegador de verdade.
//
// Horário do evento: press e release recebem event.timeStamp quando ele é válido (eventTime). Um gesto (uma tecla, ou os
// dedos entre o primeiro toque e o último soltar) escolhe a fonte no primeiro evento e a mantém até o fim: se o armar
// veio pelo relógio do timer, o soltar também vem; assim nenhuma medida mistura as duas bases.
import type { Timer } from '../../core/timer';
import type { TouchArm } from '../../core/touch';

export type ActionName = 'plus2' | 'dnf' | 'note' | 'delete' | 'undo' | 'next' | 'shortcuts' | 'tab1' | 'tab2' | 'tab3' | 'tab4' | 'tab5';

export interface InputTarget {
  timer: Timer;
  touch: TouchArm;
  tabIsTimer(): boolean;
  dialogOpen(): boolean;
  onAction(name: ActionName): void;
  onWake(): void;
}

export interface InputController {
  attach(doc: Document, win: Window, zones: HTMLElement, screen: HTMLElement): () => void;
  abandonHold(): void; // abandona o armar ou a inspeção sem largar o timer (troca de evento, sessão ou aba)
}

const EVENT_WINDOW_MS = 60_000;
const CONTROLS = 'button, a, input, select, textarea, label, dialog, [data-noteform]';
const TAB_KEYS = new Map<string, ActionName>([
  ['1', 'tab1'],
  ['2', 'tab2'],
  ['3', 'tab3'],
  ['4', 'tab4'],
  ['5', 'tab5'],
]);

// Horário do evento na base de performance.now(), ou undefined (o timer usa o próprio relógio). Um timeStamp de época
// (jsdom) ou longe demais de agora cai em undefined.
export function eventTime(e: Event, now: () => number = () => performance.now()): number | undefined {
  const t = e.timeStamp;
  if (!Number.isFinite(t)) return undefined;
  return Math.abs(t - now()) < EVENT_WINDOW_MS ? t : undefined;
}

const closestOf = (target: EventTarget | null, selector: string): Element | null =>
  target instanceof Element ? target.closest(selector) : null;

export function createInputController(
  t: InputTarget,
  o: { coarse: () => boolean; armMode: () => 'two' | 'one' },
): InputController {
  let zones: HTMLElement | null = null;
  const zoneOf = new Map<number, HTMLElement>(); // pointerId → zona pressionada
  // parada não rearma; sem defaultPrevented, que vaza entre controllers ligados nos testes do brief
  const consumed = new WeakSet<Event>();
  let spaceHeld = false; // o espaço que armou ainda não foi solto
  let spaceUsesEvent = false; // o armar do espaço veio com horário do evento
  let touchUsesEvent = false; // o gesto de toque atual veio com horário do evento
  let swallowClick = false; // o clique que viria da parada deve ser engolido

  const typing = (e: KeyboardEvent) => closestOf(e.target, 'input, textarea, select') !== null;

  function abandonHold() {
    spaceHeld = false;
    t.touch.cancelAll();
    zoneOf.clear();
    zones?.querySelectorAll('[data-zone].down').forEach((el) => el.classList.remove('down'));
    t.timer.cancel(); // só muda o estado armando ou pronto e esquece o toque de inspeção pendente
  }

  function pressZone(e: PointerEvent, z: HTMLElement) {
    e.preventDefault();
    try {
      z.setPointerCapture(e.pointerId);
    } catch {
      /* captura é conforto: o soltar também é ouvido na janela */
    }
    const zone = z.dataset.zone;
    if (zone !== 'left' && zone !== 'right') return;
    if (zoneOf.size === 0) touchUsesEvent = eventTime(e) !== undefined; // gesto novo: a fonte vem do primeiro dedo
    zoneOf.set(e.pointerId, z);
    z.classList.add('down');
    t.touch.down(e.pointerId, zone, touchUsesEvent ? eventTime(e) : undefined);
  }

  function onKeyDown(e: KeyboardEvent) {
    t.onWake();
    if (t.dialogOpen()) return;
    if (t.timer.state === 'running') {
      // Qualquer tecla para o solve; o espaço segurado de antes não para (auto-repeat).
      e.preventDefault();
      if (e.repeat) return;
      t.timer.press(eventTime(e));
      return;
    }
    if (typing(e)) return;
    if (e.code === 'Space') {
      if (!t.tabIsTimer()) return;
      e.preventDefault();
      if (e.repeat) return;
      spaceHeld = true;
      spaceUsesEvent = eventTime(e) !== undefined;
      t.timer.press(eventTime(e));
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    if (e.key === '?') return t.onAction('shortcuts');
    const tab = TAB_KEYS.get(e.key);
    if (tab) return t.onAction(tab);
    if (!t.tabIsTimer() || t.timer.state === 'inspect') return;
    const k = e.key.toLowerCase();
    if (k === 'p') t.onAction('plus2');
    else if (k === 'd') t.onAction('dnf');
    else if (k === 'm') {
      e.preventDefault();
      t.onAction('note');
    } else if (e.key === 'Backspace') t.onAction('delete');
    else if (k === 'z') t.onAction('undo');
    else if (k === 'n') t.onAction('next');
  }

  // Todo espaço que armou recebe o seu soltar, mesmo se a aba mudou ou um diálogo abriu no meio.
  function onKeyUp(e: KeyboardEvent) {
    if (e.code !== 'Space' || !spaceHeld) return;
    spaceHeld = false;
    e.preventDefault();
    if (!t.tabIsTimer() || t.dialogOpen()) abandonHold();
    else t.timer.release(spaceUsesEvent ? eventTime(e) : undefined);
  }

  // Com o timer rodando, qualquer toque para (como no stackmat), e o clique que viria em seguida é engolido.
  function onDocPointerDown(e: PointerEvent) {
    t.onWake();
    if (e.isPrimary) swallowClick = false; // um segundo dedo não libera o clique do primeiro
    if (t.timer.state === 'running' && !closestOf(e.target, '[data-zone]')) {
      e.preventDefault();
      swallowClick = true;
      consumed.add(e);
      t.timer.press(eventTime(e));
    }
  }

  function onDocClick(e: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    e.preventDefault();
    e.stopPropagation();
  }

  function onScreenPointerDown(e: PointerEvent, z: HTMLElement) {
    // Um toque: a tela do Timer inteira arma, menos os controles.
    if (o.armMode() !== 'one' || !o.coarse() || consumed.has(e)) return;
    if (closestOf(e.target, '[data-zone]') || closestOf(e.target, CONTROLS)) return;
    const left = z.querySelector<HTMLElement>('[data-zone="left"]');
    if (left) pressZone(e, left);
  }

  function onPointerUp(e: PointerEvent) {
    const z = zoneOf.get(e.pointerId);
    if (!z) return;
    zoneOf.delete(e.pointerId);
    if (![...zoneOf.values()].includes(z)) z.classList.remove('down');
    t.touch.up(e.pointerId, touchUsesEvent ? eventTime(e) : undefined);
  }

  return {
    attach(doc, win, z, screen) {
      zones = z;
      const ac = new AbortController();
      const signal = ac.signal;
      doc.addEventListener('keydown', onKeyDown, { signal });
      doc.addEventListener('keyup', onKeyUp, { signal });
      doc.addEventListener('pointerdown', onDocPointerDown, { capture: true, signal });
      doc.addEventListener('click', onDocClick, { capture: true, signal });
      doc.addEventListener('visibilitychange', () => {
        if (doc.hidden) abandonHold();
      }, { signal });
      z.addEventListener('pointerdown', (e) => {
        const zone = closestOf(e.target, '[data-zone]');
        if (zone instanceof HTMLElement) pressZone(e, zone);
      }, { signal });
      z.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
      z.addEventListener('pointercancel', () => abandonHold(), { signal });
      screen.addEventListener('pointerdown', (e) => onScreenPointerDown(e, z), { signal });
      win.addEventListener('pointerup', onPointerUp, { signal }); // o soltar é ouvido na janela
      win.addEventListener('blur', () => abandonHold(), { signal }); // perdeu o foco: abandona sem largar
      return () => ac.abort();
    },
    abandonHold,
  };
}
