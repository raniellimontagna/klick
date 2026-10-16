import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptchaError, turnstile } from '../../src/sync/captcha';

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const SITE_KEY = '1x00000000000000000000BB';

type Options = Record<string, unknown> & { callback: (token: string) => void; 'error-callback': (code: string) => void };

// O Turnstile falso, como o do ponta a ponta: o widget guarda as opções, e executar devolve o token dele (ou o erro do desafio).
function fakeTurnstile(outcome: 'token' | 'error' = 'token') {
  const widgets = new Map<string, Options>();
  let n = 0;
  return {
    render: vi.fn((_host: HTMLElement, o: Options) => {
      const id = `w${++n}`;
      widgets.set(id, o);
      return id;
    }),
    execute: vi.fn((id: string) => {
      const o = widgets.get(id);
      setTimeout(() => (outcome === 'token' ? o?.callback(`token-${id}`) : o?.['error-callback']('300030')), 0);
    }),
    remove: vi.fn((id: string) => void widgets.delete(id)),
  };
}

const scripts = () => document.head.querySelectorAll(`script[src="${SCRIPT}"]`);

afterEach(() => {
  vi.unstubAllGlobals();
  for (const s of scripts()) s.remove();
});

describe('o Turnstile invisível (spec 7.2 e 7.5)', () => {
  it('o script da Cloudflare só carrega quando o primeiro token é pedido, e uma vez só', async () => {
    expect(scripts()).toHaveLength(0); // importar o módulo não carrega nada
    const host = document.createElement('div');
    const first = turnstile.token(SITE_KEY, host);
    const second = turnstile.token(SITE_KEY, host);
    expect(scripts()).toHaveLength(1);
    const api = fakeTurnstile();
    vi.stubGlobal('turnstile', api); // o que o script da Cloudflare define
    scripts()[0].dispatchEvent(new Event('load'));
    const tokens = await Promise.all([first, second]);
    expect(new Set(tokens).size).toBe(2);
    expect(api.render).toHaveBeenCalledWith(host, expect.objectContaining({ sitekey: SITE_KEY, execution: 'execute', appearance: 'interaction-only' }));
  });

  it('cada token sai de um widget novo, removido depois: dois envios seguidos pedem dois tokens diferentes (o token vale uma vez)', async () => {
    const api = fakeTurnstile();
    vi.stubGlobal('turnstile', api);
    const host = document.createElement('div');
    const a = await turnstile.token(SITE_KEY, host);
    const b = await turnstile.token(SITE_KEY, host);
    expect(a).not.toBe(b);
    expect(api.render).toHaveBeenCalledTimes(2);
    expect(api.execute.mock.calls.map(([id]) => id)).toEqual(['w1', 'w2']);
    expect(api.remove.mock.calls.map(([id]) => id)).toEqual(['w1', 'w2']);
    expect(scripts()).toHaveLength(0); // já carregado: não pede o script de novo
  });

  it('o desafio recusado é um CaptchaError, e o widget sai', async () => {
    const api = fakeTurnstile('error');
    vi.stubGlobal('turnstile', api);
    const err = await turnstile.token(SITE_KEY, document.createElement('div')).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CaptchaError);
    expect(api.remove).toHaveBeenCalledWith('w1');
  });

  it('o script que não carrega (sem rede) não é um CaptchaError, e a próxima tentativa carrega de novo', async () => {
    const host = document.createElement('div');
    const failing = turnstile.token(SITE_KEY, host);
    scripts()[0].dispatchEvent(new Event('error'));
    const err = await failing.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(CaptchaError);
    expect(scripts()).toHaveLength(0); // a tag que falhou sai
    const retry = turnstile.token(SITE_KEY, host);
    expect(scripts()).toHaveLength(1);
    vi.stubGlobal('turnstile', fakeTurnstile());
    scripts()[0].dispatchEvent(new Event('load'));
    expect(await retry).toBe('token-w1');
  });
});
