import { createExecutionContext, createScheduledController, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../worker/env';
import worker from '../../worker/index';
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
