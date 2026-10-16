// Aplica worker/migrations no D1 local antes dos testes. Os arquivos de setup rodam fora do isolamento de cada arquivo de teste, e talvez
// mais de uma vez: applyD1Migrations só aplica o que falta.
import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
