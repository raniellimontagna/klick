// As ligações do Worker (wrangler.jsonc, spec 8.1 e 8.4). Os segredos chegam por `wrangler secret put`, por ambiente; nos testes, pelo
// vitest.worker.config.ts. O repositório é público: aqui só há nomes.
import type { AccountStore } from './account-store';

export interface Env {
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada de pedidos de sync por conta (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
  BETTER_AUTH_SECRET: string; // segredo
  E2E_MAILBOX?: string; // 'true' só no wrangler dev dos ponta a ponta: o código fica numa caixa local, nunca é enviado
}
