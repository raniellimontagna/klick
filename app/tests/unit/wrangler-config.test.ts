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
const CAPS = ['SNAPSHOT_BYTES_CAP', 'R2_CLASS_A_MONTH', 'R2_CLASS_B_MONTH', 'MAIL_PER_DAY', 'MAIL_PER_MONTH'] as const;
const SECRETS = ['BETTER_AUTH_SECRET', 'TURNSTILE_SECRET', 'RESEND_API_KEY', 'E2E_MAILBOX'];

describe('wrangler.jsonc', () => {
  // A raiz ligou a conta em 19/10/2026, com o ok do Ranielli (spec 8.4 e 12; os portões do app/README.md).
  it('a conta ligada no beta e na raiz', () => {
    expect(config.vars.ACCOUNTS_ENABLED).toBe('true');
    expect(config.env.production.vars.ACCOUNTS_ENABLED).toBe('true');
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

  // Spec 4 e 7: os tetos do grátis (o espaço das cópias, as operações A e B do R2 por mês, os e-mails por dia e por mês) são vars de cada
  // ambiente, para subir sem mexer no código. O beta e a raiz dividem o Resend e o R2 da conta, mas cada um tem o próprio D1: os dois
  // juntos ficam abaixo do grátis.
  it('os tetos do grátis ficam na configuração, por ambiente', () => {
    const pick = (vars: Record<string, string>) => Object.fromEntries(CAPS.map((name) => [name, vars[name]]));
    expect(pick(config.vars)).toEqual({
      SNAPSHOT_BYTES_CAP: '256000000',
      R2_CLASS_A_MONTH: '50000',
      R2_CLASS_B_MONTH: '500000',
      MAIL_PER_DAY: '10',
      MAIL_PER_MONTH: '250',
    });
    expect(pick(config.env.production.vars)).toEqual({
      SNAPSHOT_BYTES_CAP: '1000000000',
      R2_CLASS_A_MONTH: '500000',
      R2_CLASS_B_MONTH: '5000000',
      MAIL_PER_DAY: '80',
      MAIL_PER_MONTH: '2500',
    });
  });

  // Task 12 (a leitura de 30 s do limite de CPU dos Durable Objects): os tamanhos que a cópia do dia e a restauração aceitam, em registros
  // da conta. Na leitura de 10 ms, as duas vão a 0 (nenhuma cópia, toda restauração recusada), só na configuração. A cópia do dia não pára
  // mais no que o app restaura num dia (o dia útil, recordsPerDay): uma conta grande sai em partes, a cada BIG_COPY_EVERY_DAYS dias, e a
  // restauração que não cabe no dia vira um download (spec das cópias grandes). O teto fica em 150 mil registros, nos dois ambientes (a
  // revisão final, I3): o tempo de relógio de uma cópia em partes e de uma restauração no servidor ainda não foi medido com a latência de
  // verdade, e 150 mil cobrem uma conta de 100 mil solves com a lixeira e as sessões; subir espera o portão do README.
  it('os tamanhos da cópia do dia e da restauração ficam na configuração, nos dois ambientes', () => {
    for (const vars of [config.vars, config.env.production.vars]) {
      expect(vars.SNAPSHOT_MAX_RECORDS).toBe('150000');
      expect(vars.RESTORE_MAX_RECORDS).toBe('5000');
    }
  });

  // Decisão 6 e o portão 11 do README: as 100 mil linhas gravadas por dia nos Durable Objects do grátis são da conta da Cloudflare inteira
  // (o beta, a raiz e os outros projetos). Cada ambiente tem o próprio teto, somado entre todas as contas dele; os dois juntos param em 70%
  // do dia, e o resto fica para os outros projetos e para as gravações que o teto não conta.
  it('o teto de linhas gravadas por dia fica na configuração, por ambiente, e os dois somados param em 70% do grátis', () => {
    expect([config.vars.ROWS_WRITTEN_DAY_CAP, config.env.production.vars.ROWS_WRITTEN_DAY_CAP]).toEqual(['10000', '60000']);
    expect(Number(config.vars.ROWS_WRITTEN_DAY_CAP) + Number(config.env.production.vars.ROWS_WRITTEN_DAY_CAP)).toBeLessThanOrEqual(70_000);
  });

  it('somados, os dois ambientes ficam abaixo do grátis do Resend e do R2', () => {
    const sum = (name: (typeof CAPS)[number]) => Number(config.vars[name]) + Number(config.env.production.vars[name]);
    expect(sum('MAIL_PER_DAY')).toBeLessThanOrEqual(100);
    expect(sum('MAIL_PER_MONTH')).toBeLessThanOrEqual(3000);
    expect(sum('R2_CLASS_A_MONTH')).toBeLessThanOrEqual(1_000_000);
    expect(sum('R2_CLASS_B_MONTH')).toBeLessThanOrEqual(10_000_000);
    expect(sum('SNAPSHOT_BYTES_CAP')).toBeLessThanOrEqual(10e9);
  });
});
