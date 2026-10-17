-- Os tetos do grátis (spec 4 e 7): o que o Worker gasta de Cloudflare e de Resend, contado no D1 de cada ambiente.
-- As operações do R2 por mês e por classe ('A': gravar e listar; 'B': ler). month = AAAA-MM, em UTC.
CREATE TABLE r2_ops (month TEXT NOT NULL, class TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY (month, class));
-- O espaço das cópias diárias: uma linha só. counted_at é a última recontagem (listar snap/), em ms.
CREATE TABLE r2_storage (id INTEGER PRIMARY KEY CHECK (id = 1), bytes INTEGER NOT NULL, counted_at INTEGER NOT NULL);
-- Os e-mails de código enviados: uma linha por dia ('d:AAAA-MM-DD') e uma por mês ('m:AAAA-MM'), em UTC.
CREATE TABLE mail_sent (period TEXT PRIMARY KEY, count INTEGER NOT NULL);
