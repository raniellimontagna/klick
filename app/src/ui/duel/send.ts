// Mandar o link do desafio (spec do desafio, seção 4): pela folha de compartilhar do sistema (Web Share, com o texto e a URL); sem ela, a
// área de transferência. As duas só valem dentro do gesto da pessoa (no iPhone, um await antes as recusa): cada função chama a API do
// navegador na hora, sem esperar nada antes, e devolve depois como foi. O link já vem pronto (DuelEnd o prepara antes do toque). Ler a área
// de transferência ("Colar a resposta") segue a mesma regra.
import { copyText } from '../clipboard';

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

// 'copied' ou 'failed' (sem área de transferência, ou recusada). É o copyText de ui/clipboard.ts, com o link.
export function copyLink(url: string, nav: SendNav = navigator): Promise<'copied' | 'failed'> {
  return copyText(url, nav);
}

// O texto da área de transferência, ou null (sem a leitura, ou recusada: no iPhone, a pessoa não tocou em "Colar"). Aí, o campo para colar.
export function readLink(nav: SendNav = navigator): Promise<string | null> {
  const clipboard = nav.clipboard;
  if (!clipboard || typeof clipboard.readText !== 'function') return Promise.resolve(null);
  let started: Promise<string>;
  try {
    started = clipboard.readText();
  } catch {
    return Promise.resolve(null);
  }
  return started.then(
    (text) => text,
    () => null,
  );
}
