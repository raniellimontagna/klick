import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O wrangler.jsonc vai para o repositório público: nenhum segredo nele, e a conta desligada na raiz até o ok do Ranielli (spec 8.4).
const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../wrangler.jsonc'), 'utf8');
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] } } };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];

describe('wrangler.jsonc', () => {
  it('a conta fica desligada na raiz', () => {
    expect(config.env.production.vars.ACCOUNTS_ENABLED).toBe('false');
  });

  it('nenhum segredo (nem a caixa do ponta a ponta) nas variáveis de nenhum ambiente', () => {
    for (const vars of [config.vars, config.env.production.vars]) for (const name of SECRETS) expect(vars).not.toHaveProperty(name);
    expect(text).not.toMatch(/re_[A-Za-z0-9]{8,}/); // uma chave do Resend colada por engano
  });

  it('o script roda antes dos arquivos só em /api/*', () => {
    expect(config.assets.run_worker_first).toEqual(['/api/*']);
    expect(config.env.production.assets.run_worker_first).toEqual(['/api/*']);
  });
});
