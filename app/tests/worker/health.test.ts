import { describe, expect, it } from 'vitest';
import { call, testEnv } from './helpers';

describe('/api/health e a chave ACCOUNTS_ENABLED (spec 8.4)', () => {
  it('com a conta ligada, diz que está ligada e manda a site key do Turnstile', async () => {
    // A site key vem do wrangler.jsonc (a de teste da Cloudflare até o Portão C): trocar pela de verdade não quebra este teste.
    const siteKey = testEnv().TURNSTILE_SITE_KEY;
    expect(siteKey).toMatch(/^\S+$/);
    const res = await call('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ ok: true, accounts: true, turnstileSiteKey: siteKey });
  });

  it('com a conta desligada, /api/health responde e o resto de /api é 404', async () => {
    const off = testEnv({ ACCOUNTS_ENABLED: 'false' });
    expect(await (await call('/api/health', {}, { env: off })).json()).toEqual({ ok: true, accounts: false, turnstileSiteKey: null });
    expect((await call('/api/sync', { method: 'POST' }, { env: off })).status).toBe(404);
    expect((await call('/api/auth/get-session', {}, { env: off })).status).toBe(404);
  });

  it('o que não é /api vai para os arquivos do app', async () => {
    const seen: string[] = [];
    const assets = {
      fetch: async (r: Request) => {
        seen.push(new URL(r.url).pathname);
        return new Response('app');
      },
    } as unknown as Fetcher;
    const res = await call('/evolucao', {}, { env: testEnv({ ASSETS: assets }) });
    expect(await res.text()).toBe('app');
    expect(seen).toEqual(['/evolucao']);
  });
});
