-- O teto de linhas gravadas por dia (decisão 6 do endurecimento; o portão 11 do README): as 100 mil linhas gravadas por dia nos Durable
-- Objects do grátis são da conta da Cloudflare inteira. Aqui, as que os objetos das contas deste ambiente reservaram no dia, somadas entre
-- todas as contas (account-store.ts, reserveDay; budget.ts, reserveRows). day = AAAA-MM-DD, em UTC.
CREATE TABLE rows_day (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
