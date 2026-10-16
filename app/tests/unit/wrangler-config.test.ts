import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// O wrangler.jsonc vai para o repositório público: nenhum segredo nele, e a conta desligada na raiz até o ok do Ranielli (spec 8.4).
const text = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../wrangler.jsonc'), 'utf8');
interface D1 {
  binding: string;
  database_name: string;
  database_id: string;
}
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  assets: { run_worker_first: string[] };
  d1_databases: D1[];
  env: { production: { vars: Record<string, string>; assets: { run_worker_first: string[] }; d1_databases: D1[] } };
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

  it('cada ambiente tem o próprio D1, com o id que o `wrangler d1 create` deu (spec 8.1)', () => {
    const [beta] = config.d1_databases;
    const [root] = config.env.production.d1_databases;
    expect([beta.binding, root.binding]).toEqual(['DB', 'DB']);
    expect([beta.database_name, root.database_name]).toEqual(['klick-auth-beta', 'klick-auth']);
    for (const db of [beta, root]) expect(db.database_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(beta.database_id).not.toBe(root.database_id);
  });
});
