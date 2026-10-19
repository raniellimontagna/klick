// Mandar o link do desafio (spec do desafio, seção 4): pela folha de compartilhar do sistema (Web Share, com o texto e a URL); sem ela, a
// área de transferência. As duas só valem dentro do gesto da pessoa (no iPhone, um await antes as recusa): cada função chama a API do
// navegador na hora, sem esperar nada antes, e devolve depois como foi. O link já vem pronto (DuelEnd o prepara antes do toque).
type SendNav = Partial<Pick<Navigator, 'share' | 'clipboard'>>;

// A folha do sistema existe? Sem ela, o toque copia.
export const canShare = (nav: SendNav = navigator): boolean => typeof nav.share === 'function';

// 'shared' (a folha abriu e a pessoa mandou), 'cancelled' (fechou a folha) ou 'failed' (o navegador recusou: aí a cópia, num toque novo).
export function shareLink(text: string, url: string, nav: SendNav = navigator): Promise<'shared' | 'cancelled' | 'failed'> {
  let started: Promise<void>;
  try {
    started = nav.share!({ text, url });
  } catch {
    return Promise.resolve('failed');
  }
  return started.then(
    () => 'shared' as const,
    (err: unknown) => (err instanceof DOMException && err.name === 'AbortError' ? ('cancelled' as const) : ('failed' as const)),
  );
}

// 'copied' ou 'failed' (sem área de transferência, ou recusada).
export function copyLink(url: string, nav: SendNav = navigator): Promise<'copied' | 'failed'> {
  const clipboard = nav.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') return Promise.resolve('failed');
  let started: Promise<void>;
  try {
    started = clipboard.writeText(url);
  } catch {
    return Promise.resolve('failed');
  }
  return started.then(
    () => 'copied' as const,
    () => 'failed' as const,
  );
}
