// Apoio dos testes do Worker: chama o router como o Worker chamaria, com o env do wrangler.jsonc (conta ligada) e as trocas de cada teste.
// Não é um arquivo de teste.
import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import type { Env } from '../../worker/env';
import { handle, type Deps } from '../../worker/router';

export const ORIGIN = 'https://beta.klick.ranimontagna.com';
export const T0 = 1_791_500_000_000;

export function testEnv(over: Partial<Env> = {}): Env {
  return { ...(env as unknown as Env), ACCOUNTS_ENABLED: 'true', ...over };
}

export function testDeps(over: Partial<Deps> = {}): Deps {
  return { now: () => T0, ...over };
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
