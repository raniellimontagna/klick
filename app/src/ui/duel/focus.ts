// O foco depois de uma folha do desafio: quem a abriu pode ter sumido (a pílula "Desafiar" dá lugar à do modo; "Agora não" não tem quem
// abriu). Se o foco caiu no body, ele vai para a tela do Timer, como quando uma ação do Timer some. Depois do quadro: a folha e a pílula
// saem da tela no mesmo ciclo.
export function focusTimerIfLost(): void {
  setTimeout(() => {
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    document.querySelector<HTMLElement>('[data-screen="timer"]:not([hidden])')?.focus({ preventScroll: true });
  }, 0);
}
