-- O teto de linhas lidas por dia (a auditoria de segurança, NV-7): as 5 milhões de linhas lidas por dia nos Durable Objects do grátis são da
-- conta da Cloudflare inteira, e o orçamento de leituras de cada conta (DAILY_READ_BUDGET) não limita a soma. Aqui, as que os objetos das
-- contas deste ambiente reservaram no dia, em lotes (account-store.ts, readsRoom; budget.ts, reserveReads). day = AAAA-MM-DD, em UTC.
CREATE TABLE reads_day (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
