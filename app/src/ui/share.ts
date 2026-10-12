// Entrega um texto como arquivo pela folha de compartilhar do sistema (Web Share com arquivos). No iPhone é o caminho que diz se o
// arquivo foi para algum lugar: o download só abre uma prévia, que a pessoa pode fechar sem salvar. Quem chama decide o que fazer
// com cada resultado: 'shared' (foi), 'cancelled' (a pessoa fechou a folha) ou 'unsupported' (não há folha, ou o navegador recusou;
// quem chama tenta o download).
export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

export type ShareFile = (name: string, text: string, mime: string) => Promise<ShareOutcome>;

type ShareNav = Pick<Navigator, 'share'> & Partial<Pick<Navigator, 'canShare'>>;

export async function shareFile(name: string, text: string, mime: string, nav: ShareNav = navigator): Promise<ShareOutcome> {
  const file = new File([text], name, { type: mime });
  if (typeof nav.canShare !== 'function' || typeof nav.share !== 'function' || !nav.canShare({ files: [file] })) return 'unsupported';
  try {
    await nav.share({ files: [file] });
    return 'shared';
  } catch (err) {
    // NotAllowedError (sem o gesto da pessoa, que pode ter expirado enquanto o app lia o banco) e afins: o download ainda serve.
    return err instanceof DOMException && err.name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
