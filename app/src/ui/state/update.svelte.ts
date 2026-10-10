// A nova versão do app, depois que o service worker a baixou. Fica fora do AppState: é do navegador, não dos dados. O main.ts
// registra o service worker e entrega aqui a função de atualizar; o UpdatePrompt lê e mostra o aviso quando o timer está parado.
//
// Quando outra aba aceita a versão nova, o navegador manda esta aba recarregar. Ela não recarrega já: um solve em andamento (ou
// gravando, ou com o espaço segurado antes da inspeção) se perderia. O pedido fica guardado e o UpdatePrompt recarrega quando a
// tela ficar livre (reloadIfFree).
let waiting = $state.raw<(() => Promise<void>) | null>(null);
let reloadAsked = $state(false);

// null tira o aviso (os testes limpam assim; em produção a versão esperando só sai ao recarregar).
export function offerUpdate(apply: (() => Promise<void>) | null): void {
  waiting = apply;
}

export function pendingUpdate(): (() => Promise<void>) | null {
  return waiting;
}

// O que deixa a tela ocupada. Os três contam: o timer em qualquer estado de solve, o espaço segurado antes da inspeção (o timer
// ainda parece parado) e o solve que não foi gravado.
export interface ReloadBusy {
  timerBusy: boolean;
  pendingInspect: boolean;
  unsaved: boolean;
}

// A regra de adiar: só recarrega com a tela livre.
export function canReloadNow(busy: ReloadBusy): boolean {
  return !busy.timerBusy && !busy.pendingInspect && !busy.unsaved;
}

// Outra aba aceitou a versão: esta aba pede para recarregar assim que puder.
export function askReload(): void {
  reloadAsked = true;
}

// Recarrega se há pedido e a tela está livre. O pedido sai antes de recarregar, então vale uma vez. Devolve se recarregou.
export function reloadIfFree(busy: ReloadBusy, reload: () => void = () => window.location.reload()): boolean {
  if (!reloadAsked || !canReloadNow(busy)) return false;
  reloadAsked = false;
  reload();
  return true;
}
