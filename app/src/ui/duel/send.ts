// Mandar o link do desafio (spec do desafio, seção 4): pela folha de compartilhar do sistema (Web Share, com o texto e a URL); sem ela, ou
// se o navegador a recusar, o link vai para a área de transferência. Quem chama mostra o aviso de cada resultado: 'shared' (a folha abriu),
// 'cancelled' (a pessoa fechou a folha), 'copied' (o link foi copiado) ou 'failed' (nem uma coisa nem outra).
export type SendOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

type SendNav = Partial<Pick<Navigator, 'share' | 'clipboard'>>;

export async function sendLink(text: string, url: string, nav: SendNav = navigator): Promise<SendOutcome> {
  if (typeof nav.share === 'function') {
    try {
      await nav.share({ text, url });
      return 'shared';
    } catch (err) {
      // NotAllowedError (o gesto da pessoa expirou enquanto o link era gravado) e afins: a cópia ainda serve.
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  const clipboard = nav.clipboard;
  if (!clipboard || typeof clipboard.writeText !== 'function') return 'failed';
  return clipboard.writeText(url).then(
    () => 'copied' as const,
    () => 'failed' as const,
  );
}
