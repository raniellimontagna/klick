// Script único (spec D10 e etapa 9): busca no Supabase da v1 os solves de uma conta e grava num arquivo do Klick só os que faltam no export
// de comparação. Quem roda é o Ranielli, no terminal dele: a service key nunca vai para o repositório nem para a conversa.
//
//   SUPABASE_URL=https://<projeto>.supabase.co SUPABASE_SERVICE_KEY=<chave> \
//     node scripts/v1-supabase.mjs --email <e-mail da v1> --compare ~/Downloads/klick-export.json --out ~/Downloads/klick-v1-faltando.json
//
// Imprime só contagens. O arquivo de saída entra no app por Ajustes > Importar arquivo, e o sync leva para a conta.
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { missingFromV1 } from './v1-supabase-map.mjs';

const { values } = parseArgs({ options: { email: { type: 'string' }, compare: { type: 'string' }, out: { type: 'string' } } });
const { email, compare, out } = values;
const url = process.env.SUPABASE_URL?.replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key || !email || !compare || !out) {
  console.error('Uso: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/v1-supabase.mjs --email ... --compare export.json --out saida.json');
  process.exit(1);
}
const headers = { apikey: key, Authorization: `Bearer ${key}` };

// Uma falha que o próprio script descreve. As outras saem sem detalhe: o erro do fetch traz o endereço do projeto.
class Failure extends Error {}

/** @param {string} path */
async function get(path) {
  const name = path.split('?')[0];
  let res;
  try {
    res = await fetch(`${url}${path}`, { headers });
  } catch {
    throw new Failure(`${name}: sem conexão`);
  }
  if (!res.ok) throw new Failure(`${name}: ${res.status}`);
  return res.json();
}

// Todas as linhas de uma tabela da conta, de mil em mil, até vir uma página vazia (o Supabase pode limitar a página a menos de mil).
/** @param {string} table @param {string} userId */
async function all(table, userId) {
  const rows = [];
  for (let from = 0; ; ) {
    const page = await get(`/rest/v1/${table}?user_id=eq.${userId}&select=*&order=created_at,id&limit=1000&offset=${from}`);
    if (page.length === 0) return rows;
    rows.push(...page);
    from += page.length;
  }
}

// A conta da v1 pelo e-mail, página por página da lista de usuários.
/** @param {string} email */
async function findUser(email) {
  for (let page = 1; ; page++) {
    const { users = [] } = await get(`/auth/v1/admin/users?page=${page}&per_page=1000`);
    const user = users.find((/** @type {{ email?: string }} */ u) => u.email?.toLowerCase() === email.toLowerCase());
    if (user || users.length === 0) return user;
  }
}

/** @param {string} path */
function readCompare(path) {
  let data;
  try {
    data = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Failure('o arquivo de comparação não abre como JSON');
  }
  if (data?.format !== 'klick' || !Array.isArray(data.sessions) || !Array.isArray(data.solves)) {
    throw new Failure('o arquivo de comparação não é um export do Klick (Ajustes > Exportar)');
  }
  return data;
}

const main = async () => {
  const existing = readCompare(compare);
  const user = await findUser(email);
  if (!user) {
    console.log('Nenhuma conta da v1 com esse e-mail.');
    return;
  }
  const [sessions, solves] = await Promise.all([all('sessions', user.id), all('solves', user.id)]);
  const file = missingFromV1(sessions, solves, existing, Date.now());
  console.log(`Na v1: ${sessions.length} sessões e ${solves.length} solves. Faltam no Klick: ${file.solves.length} solves em ${file.sessions.length} sessões novas.`);
  if (file.solves.length > 0) {
    writeFileSync(out, JSON.stringify(file, null, 2));
    console.log(`Arquivo gravado em ${out}. Importe em Ajustes > Importar arquivo.`);
  }
};

main().catch((err) => {
  console.error(err instanceof Failure ? `Falhou: ${err.message}.` : 'Falhou.');
  process.exitCode = 1;
});
