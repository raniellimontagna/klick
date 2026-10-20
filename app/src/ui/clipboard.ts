// Copiar um texto para a área de transferência. Só vale dentro do gesto da pessoa (no iPhone, um await antes a recusa): a função chama a
// API do navegador na hora, sem esperar nada antes, e devolve depois como foi. Serve ao link do desafio (ui/duel/send.ts) e ao detalhe
// de um solve.
type ClipboardNav = Partial<Pick<Navigator, 'clipboard'>>;

// 'copied' ou 'failed' (sem área de transferência, ou recusada).
export function copyText(text: string, nav: ClipboardNav = navigator): Promise<'copied' | 'failed'> {
  const clipboard = nav.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') return Promise.resolve('failed');
  let started: Promise<void>;
  try {
    started = clipboard.writeText(text);
  } catch {
    return Promise.resolve('failed');
  }
  return started.then(
    () => 'copied' as const,
    () => 'failed' as const,
  );
}
