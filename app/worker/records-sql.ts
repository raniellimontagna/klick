// O SQL dos registros de uma conta (spec 8.2), fora do Durable Object e sem cloudflare:workers: o objeto da conta (account-store.ts) e a
// medição de uma conta grande no node:sqlite (endurecimento, Task 11) rodam o mesmo esquema e as mesmas consultas.
import type { Change, SyncStore } from '../src/core/sync/types';

export type Row = {
  store: string;
  id: string;
  data: string;
  updated_at: number;
  deleted_at: number | null;
  deletion_stamp: number;
  rev: number;
  parent: string | null;
};

export const rowToChange = (r: Row): Change => ({
  store: r.store as SyncStore,
  id: r.id,
  data: JSON.parse(r.data) as unknown,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  deletionStamp: r.deletion_stamp,
});

// `parent` é a sessão do solve (decisão 8): a cascata (spec 6.3) acha os solves de uma sessão pelo índice. records_tombs guarda só os solves
// apagados que ainda têm conteúdo, pela data da exclusão: a compactação diária (COMPACTABLE) lê só os que vencem, e não a conta inteira,
// todo dia, em toda conta.
export const RECORDS_SCHEMA: readonly string[] = Object.freeze([
  `CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER, deletion_stamp INTEGER NOT NULL,
      rev INTEGER NOT NULL, parent TEXT, PRIMARY KEY (store, id)
    )`,
  'CREATE INDEX IF NOT EXISTS records_rev ON records (rev)',
  'CREATE INDEX IF NOT EXISTS records_parent ON records (store, parent)',
  "CREATE INDEX IF NOT EXISTS records_tombs ON records (store, deleted_at) WHERE store = 'solves' AND deleted_at IS NOT NULL AND data <> '{}'",
]);

// Grava um registro com a revisão dele: (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent).
export const UPSERT_RECORD = `INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
  deletion_stamp = excluded.deletion_stamp, rev = excluded.rev, parent = excluded.parent`;

// Os contadores de uma conta que ainda não os tem (as do beta), contados uma vez no banco: os ativos de cada store e o tamanho do conteúdo
// gravado, em bytes de UTF-8 (o mesmo que utf8Bytes conta de cada `data` gravado depois), com quantos registros a varredura leu (`rows`, o
// orçamento de leituras).
export const COUNT_ACTIVE = 'SELECT store, count(*) AS n FROM records WHERE deleted_at IS NULL GROUP BY store';
export const STORED_BYTES = 'SELECT coalesce(sum(length(CAST(data AS BLOB))), 0) AS n, count(*) AS rows FROM records';

// O tamanho da conta em registros (sessões, solves, treino, desafios e ajustes; na lixeira e as marcas compactadas inclusive), contado pelo
// índice até ?: a cópia do dia (SNAPSHOT_MAX_RECORDS, e COPY_PART_RECORDS para saber se sai em partes) o confere antes de ler a conta
// inteira (Task 12), com o limite em uso + 1, o bastante para saber que ela passou dele, sem percorrer uma conta enorme inteira (revisão
// final). A restauração não conta a conta: compara (account-store.ts, restoreSnapshot).
export const COUNT_RECORDS = 'SELECT count(*) AS n FROM (SELECT 1 FROM records LIMIT ?)';

// A cópia em partes (account-store.ts, writeCopy) lê a conta por páginas na ordem da chave (store, id), a ordem da tabela: os registros
// depois da chave (?1, ?2), no máximo ?3, sem os ajustes (`prefs`, que o manifesto leva à parte: PREFS_ROWS). A primeira página começa
// depois de ('', ''), e cada uma depois da última linha da anterior, as que a cópia não leva (marcas compactadas, treino apagado)
// inclusive: assim as páginas particionam as chaves, e a faixa de cada parte (sliceOf, copy-parts.ts) é a página dela. RANGE_AFTER é a
// mesma página fechada em cima, depois de (?1, ?2) até (?3, ?4) inclusive, no máximo ?5: a faixa de uma parte, para a restauração.
export const PAGE_AFTER = "SELECT * FROM records WHERE store <> 'prefs' AND (store, id) > (?, ?) ORDER BY store, id LIMIT ?";
export const RANGE_AFTER = "SELECT * FROM records WHERE store <> 'prefs' AND (store, id) > (?, ?) AND (store, id) <= (?, ?) ORDER BY store, id LIMIT ?";
// A página com que a restauração lê os registros de agora de uma faixa (PAGE_AFTER na última, RANGE_AFTER nas outras): a comparação
// (diffSlice) os consome aos poucos, e para no meio de uma página quando as mudanças passam do limite.
export const SLICE_PAGE = 1_000;
// Os ajustes da conta (poucas dezenas de linhas): o perfil do manifesto.
export const PREFS_ROWS = "SELECT * FROM records WHERE store = 'prefs'";

// Os solves ativos da sessão ?1, que a cascata de apagá-la grava, contados pelo índice records_parent até ?2: o bastante para saber que ela
// não cabe num dia, sem ler uma sessão enorme inteira (Task 12).
export const ACTIVE_CHILDREN =
  "SELECT count(*) AS n FROM (SELECT 1 FROM records WHERE store = 'solves' AND parent = ? AND deleted_at IS NULL LIMIT ?)";

// A compactação (endurecimento, decisão 5): os solves apagados antes de ?1 que ainda têm conteúdo, os mais antigos primeiro, no máximo ?2,
// com o tamanho do conteúdo de cada um; COMPACT_SOLVE deixa só a marca (data '{}'), sem revisão nova e com a coluna `parent`.
export const COMPACTABLE = `SELECT id, length(CAST(data AS BLOB)) AS bytes FROM records
  WHERE store = 'solves' AND deleted_at IS NOT NULL AND data <> '{}' AND deleted_at < ? ORDER BY deleted_at LIMIT ?`;
export const COMPACT_SOLVE = "UPDATE records SET data = '{}' WHERE store = 'solves' AND id = ?";
export const COMPACTED_BYTES = 2; // '{}'

// O tamanho de um texto em UTF-8, como o SQLite o guarda (length(CAST(data AS BLOB))), sem montar os bytes. Um par de surrogates é um
// caractere de 4 bytes; um surrogate solto (que o JSON.stringify nunca deixa) vira U+FFFD, de 3.
export function utf8Bytes(s: string): number {
  let n = s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) continue;
    if (c < 0x800) n += 1;
    else if (c >= 0xd800 && c <= 0xdbff && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 2; // 2 unidades de UTF-16, 4 bytes
      i++;
    } else n += 2;
  }
  return n;
}
