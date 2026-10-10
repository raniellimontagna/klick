// Tempo grande da tela do Timer (porte de paintTime em prototype/scripts/ui/timer-view.js). Escreve direto no DOM, sem passar
// pelo Svelte: a cada quadro, só os textos que mudaram são trocados.

// '0:58.42' → <span class="int">0:58</span><span class="dec">.42</span>. Texto sem ponto (contagem da inspeção, DNF) vai
// inteiro em .int e .dec fica vazio.
export function paintTime(el: HTMLElement, text: string): void {
  let intEl = el.querySelector<HTMLElement>(':scope > .int');
  let decEl = el.querySelector<HTMLElement>(':scope > .dec');
  if (!intEl || !decEl) {
    const doc = el.ownerDocument;
    intEl = doc.createElement('span');
    intEl.className = 'int';
    decEl = doc.createElement('span');
    decEl.className = 'dec';
    el.replaceChildren(intEl, decEl);
  }
  const cut = text.indexOf('.');
  const sec = cut < 0 ? text : text.slice(0, cut);
  const cs = cut < 0 ? '' : text.slice(cut);
  if (intEl.textContent !== sec) intEl.textContent = sec;
  if (decEl.textContent !== cs) decEl.textContent = cs;
}

export interface Frames {
  request(cb: () => void): number;
  cancel(id: number): void;
}

const browserFrames: Frames = {
  request: (cb) => requestAnimationFrame(cb),
  cancel: (id) => cancelAnimationFrame(id),
};

export interface TimeLoop {
  kick(): void; // liga o laço se ele estiver parado
  stop(): void; // para e cancela o quadro agendado (ao desmontar a tela)
  readonly running: boolean;
}

// Laço de quadros só enquanto houver estado ativo. paint() devolve true enquanto o timer estiver armando, pronto, em
// inspeção ou rodando; quando devolve false, o laço para sozinho no repouso, e o próximo kick() o religa.
export function createTimeLoop(paint: () => boolean, frames: Frames = browserFrames): TimeLoop {
  let id: number | null = null;
  const frame = () => {
    id = null;
    if (paint()) id = frames.request(frame);
  };
  return {
    kick() {
      if (id === null) id = frames.request(frame);
    },
    stop() {
      if (id !== null) {
        frames.cancel(id);
        id = null;
      }
    },
    get running() {
      return id !== null;
    },
  };
}
