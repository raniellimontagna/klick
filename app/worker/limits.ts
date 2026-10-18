// Os tetos do Worker (spec 4, 7.1, 7.6 e 7.7). Os que mudam por ambiente (o espaço das cópias, as operações do R2 por mês, os e-mails por
// dia e por mês, e os tamanhos de conta que a cópia do dia e a restauração aceitam) são vars do wrangler.jsonc, lidas por capOf/capsOf; os
// que valem para todos são as constantes daqui. Uma var ausente, vazia ou que não seja um inteiro maior que 0 vale 0 (falha fechada: nada
// passa) e vai para o log, nunca "sem teto".
//
// Os tamanhos vêm da medição de uma conta de 100 mil solves (docs/superpowers/measurements/2026-10-17-conta-100k.md, Task 11) e das
// decisões da Task 12. A cópia do dia e a restauração seguem a leitura de 30 s do limite de CPU de um Durable Object (a tabela dos objetos
// com SQLite, os únicos do grátis, diz 30 s por pedido): decidem a memória e as linhas do dia. Se valer a leitura de 10 ms, as duas vars vão
// a 0 (nenhuma cópia, toda restauração recusada), só na configuração.
import { MAX_DATA_CHARS } from '../src/core/sync/shape';
import type { Env } from './env';

export interface Caps {
  snapshotBytes: number;
  classAMonth: number;
  classBMonth: number;
  mailDay: number;
  mailMonth: number;
  snapshotRecords: number; // acima disto (registros da conta), a cópia do dia não sai: CopiesPaused 'size'
  restoreRecords: number; // acima disto, a restauração é 'too-big', antes de ler o R2
}

export type CapName =
  | 'SNAPSHOT_BYTES_CAP'
  | 'R2_CLASS_A_MONTH'
  | 'R2_CLASS_B_MONTH'
  | 'MAIL_PER_DAY'
  | 'MAIL_PER_MONTH'
  | 'SNAPSHOT_MAX_RECORDS'
  | 'RESTORE_MAX_RECORDS';

// O orçamento do dia (decisão 6) conta linhas gravadas no SQLite do objeto, o que o grátis conta (100 mil por dia, somadas entre todas as
// contas): 20 mil por conta por dia UTC, 20% do dia de todas. A chave do estado continua 'writes' ({ day, n }), agora em linhas (rowsOf).
export const DAILY_WRITE_BUDGET = 20_000;
export const RESTORES_PER_DAY = 3; // restaurações por conta por dia UTC (spec 7.1)
export const COPIES_CACHE_MS = 600_000; // a lista de cópias guardada (spec 7.1)
// Solves compactados por alarme. A medição (seção 9 (d)): 2.000 ficam na linha dos 5 ms de CPU e mudam de lado entre as rodadas; 1.000
// chegam no máximo a 2,9 ms.
export const COMPACT_PER_DAY = 1_000;
export const STORAGE_HEADROOM = 0.95; // grava só até 95% do teto do espaço

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
export function capOf(env: Env, name: CapName): number {
  const raw: unknown = env[name];
  const n = typeof raw === 'string' && /^[1-9]\d*$/.test(raw) ? Number(raw) : 0;
  if (!Number.isSafeInteger(n) || n <= 0) {
    console.log(JSON.stringify({ evt: 'cap-missing', name }));
    return 0;
  }
  return n;
}

export function capsOf(env: Env): Caps {
  return {
    snapshotBytes: capOf(env, 'SNAPSHOT_BYTES_CAP'),
    classAMonth: capOf(env, 'R2_CLASS_A_MONTH'),
    classBMonth: capOf(env, 'R2_CLASS_B_MONTH'),
    mailDay: capOf(env, 'MAIL_PER_DAY'),
    mailMonth: capOf(env, 'MAIL_PER_MONTH'),
    snapshotRecords: capOf(env, 'SNAPSHOT_MAX_RECORDS'),
    restoreRecords: capOf(env, 'RESTORE_MAX_RECORDS'),
  };
}
