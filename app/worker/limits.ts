// Os tetos do Worker (spec 4, 7.1, 7.6 e 7.7). Os que mudam por ambiente (o espaço das cópias, as operações do R2 por mês, os e-mails por
// dia e por mês, os tamanhos de conta que a cópia do dia e a restauração aceitam, e as linhas gravadas por dia somadas entre todas as
// contas) são vars do wrangler.jsonc, lidas por capOf/capsOf; os que valem para todos são as constantes daqui. Uma var ausente, vazia ou
// que não seja um inteiro maior que 0 vale 0 (falha fechada: nada passa) e vai para o log, nunca "sem teto".
//
// Os tamanhos vêm da medição de uma conta de 100 mil solves (docs/superpowers/measurements/2026-10-17-conta-100k.md, Task 11) e das
// decisões da Task 12. A cópia do dia, a restauração e a cascata de apagar uma sessão seguem a leitura de 30 s do limite de CPU de um
// Durable Object (a tabela dos objetos com SQLite, os únicos do grátis, diz 30 s por pedido): decidem a memória e as linhas do dia. Se
// valer a leitura de 10 ms, a cópia e a restauração param só na configuração (as duas vars a 0: nenhuma cópia, toda restauração recusada);
// a cascata não: a de 5 mil solves passou muito dos 10 ms na medição (a tabela da seção 9 (e)), e nos 10 ms só cabem umas centenas, então
// ela pediria um teto no código (RECORDS_PER_DAY ou a cascata em partes).
import { MAX_DATA_CHARS } from '../src/core/sync/shape';

export interface Caps {
  snapshotBytes: number;
  classAMonth: number;
  classBMonth: number;
  mailDay: number;
  mailMonth: number;
  snapshotRecords: number; // acima disto (registros da conta), nenhuma cópia sai: CopiesPaused 'size'. Até aí, sai em partes (COPY_PART_RECORDS)
  restoreRecords: number; // acima disto em mudanças (ou do dia útil), a restauração no servidor é 'too-big' (o app novo restaura no aparelho)
  rowsDay: number; // as linhas gravadas nos objetos das contas por dia UTC, somadas entre todas as contas do ambiente
}

export type CapName =
  | 'SNAPSHOT_BYTES_CAP'
  | 'R2_CLASS_A_MONTH'
  | 'R2_CLASS_B_MONTH'
  | 'MAIL_PER_DAY'
  | 'MAIL_PER_MONTH'
  | 'SNAPSHOT_MAX_RECORDS'
  | 'RESTORE_MAX_RECORDS'
  | 'ROWS_WRITTEN_DAY_CAP';
// As vars dos tetos, como o env do Worker as tem (worker/env.ts). Sem o tipo dele, limits.ts não puxa os tipos da Cloudflare, e os testes
// de unidade também o leem (tests/unit/wrangler-config.test.ts, o dia útil de cada ambiente).
export type CapVars = Partial<Record<CapName, unknown>>;

// O orçamento do dia (decisão 6) conta linhas gravadas no SQLite do objeto, o que o grátis conta (100 mil por dia, somadas entre todas as
// contas): 20 mil por conta por dia UTC, 20% do dia de todas. A chave do estado continua 'writes' ({ day, n }), agora em linhas (rowsOf).
export const DAILY_WRITE_BUDGET = 20_000;
// O teto do dia somado entre todas as contas do ambiente é a var ROWS_WRITTEN_DAY_CAP (a tabela rows_day do D1): cada pedido que grava
// reserva nele, antes, exatamente as linhas que conta aqui (rowsOf), numa instrução do D1 (account-store.ts, reserveDay). Nada fica na
// memória do objeto, e sair dela não perde nada.
// A compactação do alarme só reserva na metade de baixo desse dia (COMPACT_ROWS_SHARE do teto): as compactações das 03:05, uma por conta,
// nunca tiram o dia dos syncs. Um D1 que falha na reserva não para o sync: as gravações esperam ROWS_RETRY_MS (retryAt), e a página volta.
export const COMPACT_ROWS_SHARE = 0.5;
export const ROWS_RETRY_MS = 300_000;
// O orçamento de leituras do dia (revisão final, I2 c): as linhas que os pedidos de uma conta leem no SQLite do objeto por dia UTC (a página do
// sync, as mudanças do lote, a cascata, a cópia do dia e a restauração). O grátis tem 5 milhões por dia somadas entre todas as contas; pedir
// sempre do cursor 0 lê uma página inteira por pedido, e na rajada uma conta só as esvaziaria em horas. Folgado: o primeiro sync inteiro de
// uma conta de 100 mil solves (~110 mil registros) cabe quatro vezes. A conta corre na memória do objeto e vai para o estado a cada
// READS_SAVE_EVERY linhas (contar não grava uma linha por pedido); o que ainda estava só na memória quando o objeto sai dela se perde.
export const DAILY_READ_BUDGET = 500_000;
export const READS_SAVE_EVERY = 10_000;
// O aparelho de cada pedido (a tabela `devices`, que a página de privacidade cita e nada lê): gravado só quando é novo ou quando a linha dele
// passou de DEVICE_TOUCH_MS, e só os MAX_DEVICES mais recentes ficam. Assim um sync que só recebe não grava nada, e um id de aparelho novo a
// cada pedido não enche o espaço que todas as contas dividem.
export const DEVICE_TOUCH_MS = 3_600_000;
export const MAX_DEVICES = 20;
export const RESTORES_PER_DAY = 3; // restaurações por conta por dia UTC (spec 7.1)
// As tentativas de restaurar que chegam ao R2 (as duas operações B reservadas), por conta por dia UTC, deem certo ou não: uma recusa depois
// de ler a cópia (o nome que sumiu, too-big, write-budget, no-room) também gasta as B do mês, que todas as contas dividem.
export const RESTORE_ATTEMPTS_PER_DAY = 10;
export const COPIES_CACHE_MS = 600_000; // a lista de cópias guardada (spec 7.1)
// A cópia de uma conta grande (spec das cópias grandes, seção 4): uma conta com mais registros que COPY_PART_RECORDS sai em partes dessa
// medida, lidas do banco uma página por vez (a memória do objeto fica em torno de uma página, e não da conta), mais um manifesto gravado por
// último; até ela, o arquivo só de sempre. Uma conta acima do dia útil (recordsPerDay) copia só a cada BIG_COPY_EVERY_DAYS dias: com a regra
// de 30 dias do bucket, ficam umas 4 cópias por conta grande, e não 30 de 74 MB. COPY_PART_READS_PER_DAY são as partes que se leem por conta
// por dia (as operações B do R2 que a cópia grande gasta ao voltar pelo aparelho: copyPart, cada objeto da cópia que ele baixa).
export const COPY_PART_RECORDS = 5_000;
export const BIG_COPY_EVERY_DAYS = 7;
export const COPY_PART_READS_PER_DAY = 200;
// As leituras de uma cópia grande além das páginas (as contagens limitadas de antes, ao dia útil + 1 e a COPY_PART_RECORDS + 1, o teto da
// conta e os ajustes): com as páginas, a estimativa que a cópia grande confere contra o que sobra do orçamento de leituras do dia, antes de
// começar (a revisão final, I4). Sem lugar hoje, ela fica para a próxima vez dela, sem pausa; maior que um dia inteiro, ela nunca caberia,
// e pausa com 'size'.
export const COPY_READS_EXTRA = 10_000;
// A restauração no servidor de uma conta grande lê a conta duas vezes: a comparação (a conta, faixa a faixa) e a cópia de antes. Antes de
// comparar, com a cópia lida, a estimativa (2 × os registros da cópia, mais RESTORE_READS_EXTRA para o que a conta cresceu depois dela e os
// ajustes) vai contra o que sobra do orçamento de leituras do dia: sem lugar, ela não compara (o app novo restaura no aparelho; o de antes
// ouve restore-limit). A revisão final, I5 b.
export const RESTORE_READS_EXTRA = 50_000;
// O piso que um aparelho manda depois de restaurar nele (SyncRequest.floor, o acabamento A1) vem do relógio dele: até a primeira resposta do
// servidor, um aparelho adiantado o daria no futuro, e cada mudança dos outros aparelhos até lá perderia. O servidor o aceita até a hora
// dele mais isto.
export const DEVICE_FLOOR_AHEAD_MS = 10 * 60_000;
// Solves compactados por alarme. A medição (seção 9 (d)): 2.000 ficam na linha dos 5 ms de CPU e mudam de lado entre as rodadas; 1.000
// chegam no máximo a 2,9 ms.
export const COMPACT_PER_DAY = 1_000;
export const STORAGE_HEADROOM = 0.95; // grava só até 95% do teto do espaço
// A parte de uma conta no espaço das cópias (a auditoria de segurança, NV-5): as cópias dela dos últimos COPY_KEEP_DAYS dias (a regra de
// ciclo de vida do bucket) não passam de COPY_SHARE do espaço usável. Sem isso, poucas contas de notas que não comprimem enchiam o espaço de
// todas, e as cópias e as restaurações de todo mundo paravam até as cópias vencerem. Folgado: uma conta comum (~0,5 MB comprimida) cabe
// com as 30 cópias do mês no beta; acima da parte, a cópia dela pausa com 'space' (e a restauração no servidor, no-room), sem tocar as outras.
export const COPY_SHARE = 0.1;
export const COPY_KEEP_DAYS = 30;
export const copyShareOf = (snapshotBytes: number): number => Math.floor(snapshotBytes * STORAGE_HEADROOM * COPY_SHARE);

// O tamanho de um pedido do sync (spec 6.1; a medição, seções 6, 7 e 10). O servidor lê no máximo MAX_WRITES_PER_REQUEST mudanças de um
// pedido; o resto volta em `deferred` com retryAt = a hora do pedido, e o motor do app o manda em seguida, na mesma rodada. O app manda
// SYNC_BATCH (src/core/sync/types.ts, o mesmo número); o pedido pode ter até MAX_SYNC_REQUEST (o router recusa acima), o lote de um app de
// antes da Task 12. A página de volta tem PULL_PAGE registros quando o pedido só recebe, e PULL_PAGE_WITH_PUSH quando ele traz mudanças:
// 250 gravados e a página de 500 no mesmo pedido ficavam na linha dos 5 ms; a página de 500 sozinha, em 1 ms.
export const MAX_SYNC_REQUEST = 500;
export const MAX_WRITES_PER_REQUEST = 250;
export const PULL_PAGE = 500;
export const PULL_PAGE_WITH_PUSH = 250;

// As linhas que uma gravação custa no orçamento do dia, contadas por cima (a regra da seção 9 (a) da medição, conferida no workerd):
// ROWS_PER_WRITE por registro gravado, seja qual for (novo, editado, apagado, restaurado, apagado pela cascata: o pior é 4), ROWS_PER_COMPACT
// por solve compactado e, quando o pedido grava alguma coisa, as REQUEST_ROWS do estado (a revisão, os contadores que mudaram e o aparelho).
// Um pedido que só recebe não conta.
export const ROWS_PER_WRITE = 4;
export const ROWS_PER_COMPACT = 1;
export const REQUEST_ROWS = 5;
export function rowsOf(writes: number, compacted = 0): number {
  const rows = writes * ROWS_PER_WRITE + compacted * ROWS_PER_COMPACT;
  return rows > 0 ? rows + REQUEST_ROWS : 0;
}

// O máximo de registros que um pedido grava num dia (o dia útil): a exclusão de uma sessão com a cascata dela (acima disto, ela volta com a
// cota) e a restauração (acima disto em mudanças, o servidor não a grava). O dia é o menor entre o orçamento da conta (DAILY_WRITE_BUDGET) e o
// teto do ambiente (`rowsDay`, ROWS_WRITTEN_DAY_CAP): acima de um dia inteiro de qualquer um dos dois, o pedido ficaria para amanhã todo dia
// (no beta, com 10 mil, uma cascata de uns 2.500 solves). Deixa no dia a compactação do alarme: rowsOf(o dia útil) mais
// rowsOf(0, COMPACT_PER_DAY) cabem no dia. Sem essa folga, uma cascata perto do máximo perderia o dia para a compactação das 03:05 (ou
// qualquer gravação antes dela) e escorregaria de um dia para o outro. Com o teto do ambiente em 0 (a var torta), nada cabe de qualquer
// jeito e tudo fica para depois: vale só o orçamento da conta, e um erro de configuração não devolve exclusões com a cota.
// O "nunca fica para amanhã todo dia" supõe o dia do ambiente vazio, sem as outras contas: num dia em que elas gastaram o teto, o pedido
// que cabe espera. Na prática cabe: o aparelho adiado tenta de novo logo depois da virada (00:00 UTC, o retryAt), com o dia ainda vazio,
// e as compactações das 03:05 só usam a metade de baixo do dia (COMPACT_ROWS_SHARE).
export function recordsPerDay(rowsDay: number): number {
  const day = rowsDay > 0 ? Math.min(DAILY_WRITE_BUDGET, rowsDay) : DAILY_WRITE_BUDGET;
  return Math.max(0, Math.floor((day - rowsOf(0, COMPACT_PER_DAY) - REQUEST_ROWS) / ROWS_PER_WRITE));
}
// O dia útil só com o orçamento da conta (o teto do ambiente acima dele, como na raiz): o que o app consegue restaurar, e o tamanho que a
// cópia do dia aceita (SNAPSHOT_MAX_RECORDS, no wrangler.jsonc).
export const RECORDS_PER_DAY = recordsPerDay(DAILY_WRITE_BUDGET);
// O conteúdo gravado de uma conta, em bytes (a soma dos `data`). A cota conta registros, não tamanho: 16 KB de nota em cada solve levariam
// uma conta só a ~1,6 GB dos 5 GB de Durable Objects que todas dividem no grátis. Folgado: 100 mil solves comuns ficam em ~25 MB.
export const ACCOUNT_BYTES_CAP = 50_000_000;
// O que um solve que pede a vaga de uma sessão reserva no teto de bytes, para a sessão que chega depois dele (e passa de qualquer jeito): o
// maior `data` de uma sessão em UTF-8. MAX_DATA_CHARS conta unidades de UTF-16, e cada uma vira no máximo 3 bytes.
export const SESSION_PREPAY = 3 * MAX_DATA_CHARS;

const DAY_MS = 86_400_000;
export const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const utcMonth = (t: number): string => new Date(t).toISOString().slice(0, 7);
export const nextUtcDay = (t: number): number => (Math.floor(t / DAY_MS) + 1) * DAY_MS;

// Só dígitos, sem zero à frente, e dentro dos inteiros seguros: "1GB", "-5", "1.5", "1e3", "0" e " 10" não valem.
export function capOf(env: CapVars, name: CapName): number {
  const raw: unknown = env[name];
  const n = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(n) || n <= 0) {
    console.log(JSON.stringify({ evt: 'cap-missing', name }));
    return 0;
  }
  return n;
}

export function capsOf(env: CapVars): Caps {
  return {
    snapshotBytes: capOf(env, 'SNAPSHOT_BYTES_CAP'),
    classAMonth: capOf(env, 'R2_CLASS_A_MONTH'),
    classBMonth: capOf(env, 'R2_CLASS_B_MONTH'),
    mailDay: capOf(env, 'MAIL_PER_DAY'),
    mailMonth: capOf(env, 'MAIL_PER_MONTH'),
    snapshotRecords: capOf(env, 'SNAPSHOT_MAX_RECORDS'),
    restoreRecords: capOf(env, 'RESTORE_MAX_RECORDS'),
    rowsDay: capOf(env, 'ROWS_WRITTEN_DAY_CAP'),
  };
}
