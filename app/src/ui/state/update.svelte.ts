// A nova versão do app, depois que o service worker a baixou. Fica fora do AppState: é do navegador, não dos dados. O main.ts
// registra o service worker e entrega aqui a função de atualizar; o UpdatePrompt lê e mostra o aviso quando o timer está parado.
let waiting = $state.raw<(() => Promise<void>) | null>(null);

// null tira o aviso (os testes limpam assim; em produção a versão esperando só sai ao recarregar).
export function offerUpdate(apply: (() => Promise<void>) | null): void {
  waiting = apply;
}

export function pendingUpdate(): (() => Promise<void>) | null {
  return waiting;
}
