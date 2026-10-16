// O Turnstile invisível (spec 7.2 e 7.5), só na tela do e-mail: o script da Cloudflare carrega na hora do primeiro pedido de código (quem
// não entra não baixa nada), e cada token vale uma vez. O servidor gasta o token até num pedido recusado pelo limite (429): por isso cada
// pedido monta um widget novo e o tira assim que o token sai, e o "Enviar código" seguinte sempre ganha um token novo. Os testes passam um
// falso (AccountDeps.captcha).

export interface Captcha {
  token(siteKey: string, host: HTMLElement): Promise<string>;
}

// O desafio recusou (o widget avisou erro, ou a interação pedida não veio a tempo): a tela diz isso, e não "confira a conexão". O script
// que não carrega (sem rede) é outro erro.
export class CaptchaError extends Error {
  constructor() {
    super('turnstile: o desafio não passou');
    this.name = 'CaptchaError';
  }
}

interface TurnstileApi {
  render(host: HTMLElement, options: Record<string, unknown>): string;
  execute(widget: string): void;
  remove(widget: string): void;
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<TurnstileApi> | null = null;

const loaded = (): TurnstileApi | undefined => (globalThis as { turnstile?: TurnstileApi }).turnstile;

function load(): Promise<TurnstileApi> {
  const ready = loaded();
  if (ready) return Promise.resolve(ready);
  // Dois pedidos ao mesmo tempo esperam o mesmo script. Terminado (bem ou mal), o próximo olha de novo: carregado, usa; sem rede, tenta outra vez.
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SCRIPT;
    tag.async = true;
    tag.onload = () => {
      const api = loaded();
      if (api) resolve(api);
      else reject(new Error('turnstile: o script não definiu a API'));
    };
    tag.onerror = () => {
      tag.remove();
      reject(new Error('turnstile: o script não carregou'));
    };
    document.head.append(tag);
  }).finally(() => {
    loading = null;
  });
  return loading;
}

// Só aparece algo na tela se a Cloudflare pedir uma interação (appearance: 'interaction-only'), no `host` da tela do e-mail.
export const turnstile: Captcha = {
  async token(siteKey, host) {
    const api = await load();
    return new Promise<string>((resolve, reject) => {
      let widget = '';
      const done = (settle: () => void): void => {
        settle();
        api.remove(widget);
      };
      widget = api.render(host, {
        sitekey: siteKey,
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token: string) => done(() => resolve(token)),
        'error-callback': () => done(() => reject(new CaptchaError())),
        'timeout-callback': () => done(() => reject(new CaptchaError())), // a interação pedida não veio
      });
      api.execute(widget);
    });
  },
};
