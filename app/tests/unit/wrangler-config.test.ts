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
interface R2 {
  binding: string;
  bucket_name: string;
}
interface Observability {
  enabled?: boolean;
  logs?: { enabled?: boolean; invocation_logs?: boolean };
}
const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
  vars: Record<string, string>;
  triggers?: { crons?: string[] };
  assets: { run_worker_first: string[] };
  d1_databases: D1[];
  r2_buckets: R2[];
  observability?: Observability;
  env: {
    production: {
      vars: Record<string, string>;
      assets: { run_worker_first: string[] };
      d1_databases: D1[];
      r2_buckets: R2[];
      observability?: Observability;
      triggers?: { crons?: string[] };
    };
  };
};
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];

describe('wrangler.jsonc', () => {
  it('a conta ligada no beta e desligada na raiz até o ok do Ranielli (spec 8.4 e 12)', () => {
    expect(config.vars.ACCOUNTS_ENABLED).toBe('true');
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

  // Spec 8.5 e 10: o log de invocação dos Workers guarda cada pedido (com os cabeçalhos) por dias; desligado nos dois ambientes. Os nossos
  // console.log (ids, contagens, durações e erros) continuam.
  it('os logs ficam ligados, sem o log de invocação de cada pedido, nos dois ambientes', () => {
    for (const o of [config.observability, config.env.production.observability]) {
      expect(o?.enabled).toBe(true);
      expect(o?.logs?.invocation_logs).toBe(false);
      expect(o?.logs?.enabled).not.toBe(false);
    }
  });

  // Spec 10 e a revisão final (I5): a limpeza diária (os pedidos de código com mais de uma hora e os códigos vencidos) é um Cron Trigger do
  // Worker, nos dois ambientes, e não depende de nenhuma conta: uma vez por dia, como a política diz.
  it('a limpeza diária roda por um Cron Trigger, uma vez por dia, nos dois ambientes', () => {
    for (const triggers of [config.triggers, config.env.production.triggers]) {
      expect(triggers?.crons).toHaveLength(1);
      expect(triggers?.crons?.[0]).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    }
  });

  it('cada ambiente tem o próprio bucket das cópias diárias', () => {
    expect(config.r2_buckets).toEqual([{ binding: 'SNAPSHOTS', bucket_name: 'klick-snapshots-beta' }]);
    expect(config.env.production.r2_buckets).toEqual([{ binding: 'SNAPSHOTS', bucket_name: 'klick-snapshots' }]);
  });
});
