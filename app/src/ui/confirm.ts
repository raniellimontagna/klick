// O segundo clique de uma confirmação ("Restaurar este dia", "Sair de todos os aparelhos") só vale depois deste tempo do primeiro: o
// clique duplo (ou o toque duas vezes) não passa por cima do aviso de "Tem certeza?".
export const CONFIRM_DELAY_MS = 400;

// `armedAt`: a hora do primeiro clique (null: ainda não clicou). Pronto quando armado e passado o tempo.
export function confirmReady(armedAt: number | null, now: number): boolean {
  return armedAt !== null && now - armedAt >= CONFIRM_DELAY_MS;
}
