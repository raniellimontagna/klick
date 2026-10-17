import { createExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authLog, createAuth } from '../../worker/auth';
import { fakeMailer, testEnv } from './helpers';

// O log do Better Auth (spec 8.5 e a revisão final, I5). O padrão da biblioteca escreve a mensagem e os argumentos inteiros no console (e
// daí nos Workers Logs): o objeto de um erro interno (api/index: logger.error(e.status, e)), o de uma tarefa em segundo plano, e mensagens
// com o e-mail (sign-up: "Sign-up attempt for existing email: ..."). O nosso guarda o nível, a mensagem sem e-mail e sem código, e de cada
// erro só o nome e o status.
describe('o log do Better Auth', () => {
  afterEach(() => vi.restoreAllMocks());

  it('não escreve o e-mail nem o código; guarda o nível, o nome e o status dos erros', () => {
    const lines: string[] = [];
    const keep = (...args: unknown[]) => void lines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    vi.spyOn(console, 'error').mockImplementation(keep);
    vi.spyOn(console, 'warn').mockImplementation(keep);
    vi.spyOn(console, 'log').mockImplementation(keep);
    const internal = Object.assign(new Error('D1_ERROR: falhou para alguem@exemplo.com'), { name: 'APIError', status: 'INTERNAL_SERVER_ERROR', statusCode: 500 });
    authLog('error', 'INTERNAL_SERVER_ERROR', internal, { body: { email: 'alguem@exemplo.com', otp: '123456' } });
    authLog('warn', 'Sign-up attempt for existing email: alguem@exemplo.com com o código 654321');
    authLog('info', 'Failed to run background task:', new TypeError('Resend respondeu para alguem@exemplo.com'));
    const all = lines.join('\n');
    expect(all).not.toContain('alguem@exemplo.com');
    expect(all).not.toContain('123456');
    expect(all).not.toContain('654321');
    expect(all).toContain('INTERNAL_SERVER_ERROR');
    expect(all).toContain('APIError');
    expect(all).toContain('500');
    expect(all).toContain('TypeError');
    expect(lines).toHaveLength(3);
  });

  it('o Better Auth do Worker usa este log, e não o padrão', () => {
    const auth = createAuth(testEnv(), createExecutionContext(), fakeMailer());
    expect(auth.options.logger?.log).toBe(authLog);
  });
});
