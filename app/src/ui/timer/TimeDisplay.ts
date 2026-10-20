// Tempo grande da tela do Timer (porte de paintTime em prototype/scripts/ui/timer-view.js). Escreve direto no DOM, sem passar
// pelo Svelte: a cada quadro, só os textos que mudaram são trocados.

// '0:58.42' → <span class="int">0:58</span><span class="dec">.42</span>. Texto sem ponto (contagem da inspeção, DNF, "0:09" de "Só os
// segundos") vai inteiro em .int e .dec fica vazio. `solving`: o tempo escondido ("Resolvendo"), que .int mostra com a classe tc-solving
// (em cinza, menor, na altura do tempo).
export function paintTime(el: HTMLElement, text: string, solving = false): void {
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
  if (intEl.classList.contains('tc-solving') !== solving) intEl.classList.toggle('tc-solving', solving);
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
  let id: number | null = null; // quadro agendado, se houver
  let live = false; // kick liga, stop desliga; paint pode chamar qualquer um dos dois no meio do quadro
  const frame = () => {
    id = null;
    if (!live) return;
    // Só reagenda se nenhum quadro ficou pendente: um kick() feito dentro de paint() já agendou o próximo.
    if (paint() && live && id === null) id = frames.request(frame);
  };
  return {
    kick() {
      live = true;
      if (id === null) id = frames.request(frame);
    },
    stop() {
      live = false;
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
