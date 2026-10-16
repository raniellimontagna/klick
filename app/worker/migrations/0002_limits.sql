-- Os pedidos de código da última hora (spec 7.5): uma linha por pedido, com a chave do e-mail (hash) ou do IP. O binding de rate limiting
-- só conta janelas de 10 ou 60 s; a hora fica aqui.
CREATE TABLE otp_requests (key TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX otp_requests_key_at ON otp_requests (key, at);
