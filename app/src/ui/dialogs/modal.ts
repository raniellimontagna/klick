// Diálogo modal (<dialog> + showModal) como ação do Svelte. Abrir guarda quem tinha o foco; fechar, por qualquer caminho (Esc,
// botão Fechar, fundo), devolve o foco a ele. O clique no respiro do diálogo não fecha: só o fundo escuro fecha.
import type { ActionReturn } from 'svelte/action';

export interface ModalParams {
  open: boolean; // o pai decide se o diálogo está aberto
  onclose: () => void; // avisa o pai que o diálogo fechou (Esc, Fechar ou fundo)
}

// O clique no fundo chega com o alvo no próprio diálogo e fora da caixa dele. O respiro (padding) fica dentro da caixa.
function clickedBackdrop(e: MouseEvent, d: HTMLDialogElement): boolean {
  if (e.target !== d) return false;
  const r = d.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

export function modal(node: HTMLDialogElement, initial: ModalParams): ActionReturn<ModalParams> {
  let params = initial;
  let opener: HTMLElement | null = null;

  const sync = (): void => {
    if (params.open && !node.hasAttribute('open')) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      node.showModal();
    } else if (!params.open && node.hasAttribute('open')) {
      node.close();
    }
  };
  const onClose = (): void => {
    const back = opener;
    opener = null;
    params.onclose();
    if (back?.isConnected) back.focus();
  };
  const onClick = (e: MouseEvent): void => {
    if (clickedBackdrop(e, node)) node.close();
  };

  node.addEventListener('close', onClose);
  node.addEventListener('click', onClick);
  sync();
  return {
    update(next) {
      params = next;
      sync();
    },
    destroy() {
      node.removeEventListener('close', onClose);
      node.removeEventListener('click', onClick);
    },
  };
}
