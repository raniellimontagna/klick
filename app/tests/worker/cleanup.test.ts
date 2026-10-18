import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reserveStorage, storageUsed } from '../../worker/budget';
import type { Env } from '../../worker/env';
import worker from '../../worker/index';
import { capsOf, utcMonth } from '../../worker/limits';
import { authDeps, call, postJson, testEnv } from './helpers';

const HOUR = 3_600_000;

// A limpeza diária (spec 10 e a revisão final, I5): um Cron Trigger do Worker, nos dois ambientes (wrangler.jsonc), apaga os pedidos de
// código com mais de uma hora e os códigos vencidos. Ela não depende de nenhuma conta existir, nem de a cópia diária no R2 dar certo: a
// política diz "uma vez por dia" sem condição.
async function runCron(e: Env = testEnv()): Promise<void> {
  const ctx = createExecutionContext();
  await worker.scheduled!(createScheduledController({ scheduledTime: Date.now(), cron: '15 3 * * *' }), e, ctx);
  await waitOnExecutionContext(ctx);
}

describe('a limpeza diária (Cron Trigger)', () => {
  it('apaga os pedidos de código com mais de uma hora; os da última hora ficam', async () => {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('e:cron-velho', now - 2 * HOUR),
      env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('i:cron-recente', now - 10 * 60_000),
    ]);
    await runCron();
    const keys = await env.DB.prepare("SELECT key FROM otp_requests WHERE key IN ('e:cron-velho', 'i:cron-recente')").all<{ key: string }>();
    expect(keys.results.map((r) => r.key)).toEqual(['i:cron-recente']);
  });

  it('apaga os códigos vencidos, de qualquer e-mail, com ou sem conta; um código ainda válido fica', async () => {
    const SEND = '/api/auth/email-otp/send-verification-otp';
    const deps = authDeps();
    for (const [email, ip] of [['cron-vencido@exemplo.com', '198.51.100.40'], ['cron-valido@exemplo.com', '198.51.100.41']]) {
      const res = await call(SEND, postJson({ email, type: 'sign-in' }, { 'x-turnstile-token': 'ok', 'cf-connecting-ip': ip }), { deps });
      expect(res.status).toBe(200);
    }
    // O código do primeiro já venceu: o mesmo formato que o adaptador grava (texto ISO), um minuto atrás.
    await env.DB.prepare('UPDATE verification SET expiresAt = ? WHERE identifier = ?')
      .bind(new Date(Date.now() - 60_000).toISOString(), 'sign-in-otp-cron-vencido@exemplo.com')
      .run();
    await runCron();
    const left = await env.DB.prepare(
      "SELECT identifier FROM verification WHERE identifier IN ('sign-in-otp-cron-vencido@exemplo.com', 'sign-in-otp-cron-valido@exemplo.com')",
    ).all<{ identifier: string }>();
    expect(left.results.map((r) => r.identifier)).toEqual(['sign-in-otp-cron-valido@exemplo.com']);
  });

  it('roda com a conta desligada no ambiente: o que já foi gravado sai do mesmo jeito', async () => {
    await env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('e:cron-desligada', Date.now() - 2 * HOUR).run();
    await runCron(testEnv({ ACCOUNTS_ENABLED: 'false' }));
    const left = await env.DB.prepare("SELECT key FROM otp_requests WHERE key = 'e:cron-desligada'").all<{ key: string }>();
    expect(left.results).toEqual([]);
  });
});

// A recontagem do espaço das cópias (endurecimento 4.2): a mesma limpeza diária lista snap/ e troca o uso contado pelo que existe, para que
// o que a regra de 30 dias do bucket apagou saia da conta. Cada página da listagem é uma operação A, reservada antes.
describe('a recontagem do espaço das cópias (Cron Trigger)', () => {
  const caps = capsOf(env as unknown as Env);
  const month = (): string => utcMonth(Date.now());
  const opsA = async (): Promise<number> =>
    (await env.DB.prepare("SELECT count FROM r2_ops WHERE month = ? AND class = 'A'").bind(month()).first<{ count: number }>())?.count ?? 0;
  const seedOpsA = (count: number) =>
    env.DB.prepare("INSERT INTO r2_ops (month, class, count) VALUES (?1, 'A', ?2) ON CONFLICT (month, class) DO UPDATE SET count = excluded.count")
      .bind(month(), count)
      .run();
  const seedUsed = (bytes: number) => env.DB.prepare('INSERT INTO r2_storage (id, bytes, counted_at) VALUES (1, ?, 0)').bind(bytes).run();
  const countedAt = async (): Promise<number | undefined> =>
    (await env.DB.prepare('SELECT counted_at AS at FROM r2_storage WHERE id = 1').first<{ at: number }>())?.at;
  // O bucket em páginas de um objeto só (as listagens contadas), e o que roda antes de cada uma.
  const paged = (pages: { n: number }, before: () => Promise<unknown> = async () => undefined): Env =>
    testEnv({
      SNAPSHOTS: new Proxy(env.SNAPSHOTS, {
        get(target, key) {
          if (key === 'list') {
            return async (o?: R2ListOptions) => {
              pages.n++;
              await before();
              return target.list({ ...o, limit: 1 });
            };
          }
          const value = Reflect.get(target, key) as unknown;
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      }),
    });

  beforeEach(async () => {
    await env.DB.batch([env.DB.prepare('DELETE FROM r2_ops'), env.DB.prepare('DELETE FROM r2_storage')]);
    await env.SNAPSHOTS.put('snap/conta-1/2026-10-01.json.gz', new Uint8Array(100));
    await env.SNAPSHOTS.put('snap/conta-2/2026-10-02.json.gz', new Uint8Array(250));
    await env.SNAPSHOTS.put('fora/outra-coisa.bin', new Uint8Array(999)); // fora de snap/: não é cópia
  });

  it('a limpeza reconta o espaço listando snap/: o que a regra de 30 dias apagou sai da conta', async () => {
    await seedUsed(10_000_000); // inclui as cópias que a regra de 30 dias já apagou
    const pages = { n: 0 };
    await runCron(paged(pages));
    expect(await storageUsed(env.DB)).toBe(350);
    expect(await countedAt()).toBeGreaterThan(0);
    expect(pages.n).toBeGreaterThan(1);
    expect(await opsA()).toBe(pages.n); // uma operação A por página
  });

  it('sem operações A no mês, não reconta e o valor fica', async () => {
    await seedUsed(12_345);
    await seedOpsA(caps.classAMonth);
    const pages = { n: 0 };
    await runCron(paged(pages));
    expect([await storageUsed(env.DB), await countedAt(), pages.n, await opsA()]).toEqual([12_345, 0, 0, caps.classAMonth]);
    // As operações acabam no meio da listagem: a conta pela metade não vale, e o valor fica.
    await seedOpsA(caps.classAMonth - 1);
    await runCron(paged(pages));
    expect([await storageUsed(env.DB), await countedAt(), pages.n, await opsA()]).toEqual([12_345, 0, 1, caps.classAMonth]);
  });

  // A recontagem lê r2_storage e r2_ops, da migração 0003. Uma raiz que recebe este código antes de o D1 dela ser migrado não pode perder a
  // limpeza do dia (nem o log dela) por isso: a recontagem falha sozinha, com um código fixo no log.
  it('sem as tabelas da migração 0003, a recontagem falha com um código fixo no log, e a limpeza roda e loga', async () => {
    const unmigrated = new Proxy(env.DB, {
      get(target, key) {
        if (key === 'prepare') {
          return (query: string) => {
            if (/r2_(storage|ops)/.test(query)) throw new Error('D1_ERROR: no such table: r2_storage: SQLITE_ERROR');
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    await env.DB.prepare('INSERT INTO otp_requests (key, at) VALUES (?, ?)').bind('e:cron-sem-0003', Date.now() - 2 * HOUR).run();
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await runCron(testEnv({ DB: unmigrated }));
      const logged = out.mock.calls.flat().map((l) => JSON.parse(String(l)) as Record<string, unknown>);
      expect(logged).toContainEqual({ evt: 'recount-failed' });
      expect(logged).toContainEqual(expect.objectContaining({ evt: 'cleanup', storage: null }));
    } finally {
      out.mockRestore();
    }
    const left = await env.DB.prepare("SELECT key FROM otp_requests WHERE key = 'e:cron-sem-0003'").all<{ key: string }>();
    expect(left.results).toEqual([]);
    expect(await storageUsed(env.DB)).toBe(0); // nada foi trocado
  });

  it('uma cópia reservada durante a recontagem fica na conta', async () => {
    // A cópia de uma conta reserva o espaço com a listagem já em andamento, e o put dela chega depois de a listagem passar pelo nome dela.
    await seedUsed(500);
    const pages = { n: 0 };
    await runCron(paged(pages, () => (pages.n === 1 ? reserveStorage(env.DB, 40, Date.now(), caps.snapshotBytes) : Promise.resolve())));
    expect(await storageUsed(env.DB)).toBe(350 + 40);
  });
});
