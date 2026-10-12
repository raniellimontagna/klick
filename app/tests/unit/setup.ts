import '@testing-library/jest-dom/vitest';
// Com globals desligado no Vitest, a limpeza automática do testing-library/svelte não se registra sozinha:
// este import registra o beforeEach/afterEach que desmonta cada render, para um teste não enxergar o DOM do anterior.
import '@testing-library/svelte/vitest';
import 'fake-indexeddb/auto';

if (!window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;
}

if (!('PointerEvent' in globalThis)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number; pointerType: string; isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  (globalThis as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill;
}

// O jsdom não implementa a abertura modal; nos testes, abrir e fechar só mexem no atributo open.
const dialogProto = HTMLDialogElement.prototype;
dialogProto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
dialogProto.show = function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
dialogProto.close = function (this: HTMLDialogElement) {
  if (!this.hasAttribute('open')) return;
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
};

// O jsdom não rola a janela (avisa "Not implemented" a cada chamada); a troca de aba volta ao topo com window.scrollTo.
window.scrollTo = (() => {}) as typeof window.scrollTo;
