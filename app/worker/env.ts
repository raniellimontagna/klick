// As ligações do Worker (wrangler.jsonc, spec 8.1 e 8.4). Os segredos chegam por `wrangler secret put`, por ambiente; nos testes, pelo
// vitest.worker.config.ts. O repositório é público: aqui só há nomes.
import type { AccountStore } from './account-store';

export interface Env {
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNT: DurableObjectNamespace<AccountStore>; // um objeto por conta, idFromName(userId)
  API_BURST: RateLimit; // rajada por conta: o sync, e listar e restaurar as cópias (o binding só conta janelas de 10 ou 60 s)
  DB: D1Database; // as contas, as sessões e as passkeys (Better Auth), e os pedidos de código da última hora
  OTP_BURST: RateLimit; // rajada de pedidos de código (e das opções da passkey sem sessão) por IP
  SNAPSHOTS: R2Bucket; // as cópias diárias, snap/<userId>/<nome>.json.gz
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
  BETTER_AUTH_SECRET: string; // segredo
  TURNSTILE_SECRET: string; // segredo; sem ele, a Cloudflare recusa todo token e nenhum código é pedido
  RESEND_API_KEY?: string; // segredo; sem ele, nenhum e-mail sai
  E2E_MAILBOX?: string; // 'true' só no wrangler dev dos ponta a ponta: o código fica numa caixa local, nunca é enviado
}
