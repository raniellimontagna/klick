// Apoio dos testes do Worker: chama o router como o Worker chamaria, com o env do wrangler.jsonc (conta ligada) e as trocas de cada teste.
// Não é um arquivo de teste.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Env } from '../../worker/env';
import { handle, type Deps } from '../../worker/router';

export const ORIGIN = 'https://beta.klick.ranimontagna.com';
export const T0 = 1_791_500_000_000;

// O limite de rajada sempre deixa passar nos testes (o binding do Miniflare conta de verdade); os testes de limite passam o deles.
export const allow: RateLimit = { limit: async () => ({ success: true }) };

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', API_BURST: allow, ...over };
}

// `user`: quem tem sessão neste pedido (sem login de verdade, etapa 3); null, ninguém.
export function testDeps(over: Partial<Deps> & { user?: string | null } = {}): Deps {
  const { user = null, ...rest } = over;
  return { now: () => T0, resolveUser: async () => (user ? { id: user, email: `${user}@exemplo.com` } : null), ...rest };
}

export async function call(path: string, init: RequestInit = {}, o: { env?: Env; deps?: Deps } = {}): Promise<Response> {
  const ctx = createExecutionContext();
  const res = await handle(new Request(ORIGIN + path, init), o.env ?? testEnv(), ctx, o.deps ?? testDeps());
  await waitOnExecutionContext(ctx);
  return res;
}

export const postJson = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...headers },
  body: JSON.stringify(body),
});
