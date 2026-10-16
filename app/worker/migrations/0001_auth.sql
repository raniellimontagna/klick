-- As tabelas do Better Auth 1.7.7 (núcleo e passkey) no D1, no formato que o adaptador Kysely dele escreve no SQLite: datas em "date",
-- booleanos em integer. O teste tests/worker/auth.test.ts confere este arquivo contra o esquema da biblioteca (getMigrations): se uma versão
-- nova mudar o esquema, o teste falha e mostra o SQL que falta.
CREATE TABLE "user" ("id" text NOT NULL PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL UNIQUE, "emailVerified" integer NOT NULL, "image" text, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "session" ("id" text NOT NULL PRIMARY KEY, "expiresAt" date NOT NULL, "token" text NOT NULL UNIQUE, "createdAt" date NOT NULL, "updatedAt" date NOT NULL, "ipAddress" text, "userAgent" text, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE);
CREATE TABLE "account" ("id" text NOT NULL PRIMARY KEY, "accountId" text NOT NULL, "providerId" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "verification" ("id" text NOT NULL PRIMARY KEY, "identifier" text NOT NULL, "value" text NOT NULL, "expiresAt" date NOT NULL, "createdAt" date NOT NULL, "updatedAt" date NOT NULL);
CREATE TABLE "passkey" ("id" text NOT NULL PRIMARY KEY, "name" text, "publicKey" text NOT NULL, "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE, "credentialID" text NOT NULL, "counter" integer NOT NULL, "deviceType" text NOT NULL, "backedUp" integer NOT NULL, "transports" text, "createdAt" date, "aaguid" text);
CREATE INDEX "session_userId_idx" ON "session" ("userId");
CREATE INDEX "account_userId_idx" ON "account" ("userId");
CREATE INDEX "verification_identifier_idx" ON "verification" ("identifier");
CREATE INDEX "passkey_userId_idx" ON "passkey" ("userId");
CREATE INDEX "passkey_credentialID_idx" ON "passkey" ("credentialID");
