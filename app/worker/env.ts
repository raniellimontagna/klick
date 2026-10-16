// As ligações do Worker (wrangler.jsonc, spec 8.1 e 8.4). Os segredos chegam por `wrangler secret put`, por ambiente; nos testes, pelo
// vitest.worker.config.ts. O repositório é público: aqui só há nomes.
export interface Env {
  ASSETS: Fetcher; // os arquivos do app (dist/)
  ACCOUNTS_ENABLED: string; // 'true' liga a conta neste ambiente (spec 8.4)
  APP_ORIGIN: string; // https://beta.klick.ranimontagna.com ou https://klick.ranimontagna.com
  TURNSTILE_SITE_KEY: string; // pública
  MAIL_FROM: string;
}
