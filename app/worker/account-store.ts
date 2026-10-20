// O Durable Object de uma conta (spec 8.2): um SQLite com os registros da conta, cada um com a revisão em que mudou. Um pedido por vez: o
// sync roda em exclusive (a reserva das linhas do dia no D1 espera a rede) e grava numa transação síncrona, então as revisões saem em
// ordem. As regras são as mesmas do app (src/core/sync). O SQL dos registros mora em records-sql.ts.
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type ApplyResult, type RecordView } from '../src/core/sync/apply';
import { isCounted, QUOTA_REASON, TOMBSTONE_KEEP_MS, zeroCounts, type ActiveCounts, type CountedStore } from '../src/core/sync/limits';
import { sessionOfChange } from '../src/core/sync/records';
import { isCopyPart, isManifest, MAX_PARTS, sliceOf, type CopyKey, type CopyManifest, type CopyPart } from '../src/core/sync/copy-parts';
import { diffSlice, prefsRestoreChanges, stampSteps, type RestoreCopy, type RestoreStep } from '../src/core/sync/restore';
import { checkChange } from '../src/core/sync/shape';
import { accountPrefsOf, exportFromRecords } from '../src/core/sync/snapshot';
import {
  syncKey,
  type Change,
  type CloudCopies,
  type CloudCopy,
  type CopiesPaused,
  type Rejected,
  type RestoreRefusal,
  type SyncRequest,
  type SyncResponse,
  type SyncStore,
} from '../src/core/sync/types';
import type { KlickExport, ProfilePatch } from '../src/core/types';
import { copyRoom, countRows, releaseStorage, reserveCopy, reserveRows, reserveStorage, rowsRoom, takeOps } from './budget';
import type { Env } from './env';
import {
  ACCOUNT_BYTES_CAP,
  BIG_COPY_EVERY_DAYS,
  capsOf,
  type Caps,
  COMPACT_PER_DAY,
  COMPACT_ROWS_SHARE,
  COPIES_CACHE_MS,
  COPY_PART_READS_PER_DAY,
  COPY_PART_RECORDS,
  COPY_READS_EXTRA,
  DAILY_READ_BUDGET,
  DAILY_WRITE_BUDGET,
  DEVICE_TOUCH_MS,
  MAX_DEVICES,
  MAX_WRITES_PER_REQUEST,
  nextUtcDay,
  PULL_PAGE,
  PULL_PAGE_WITH_PUSH,
  READS_SAVE_EVERY,
  recordsPerDay,
  REQUEST_ROWS,
  RESTORE_ATTEMPTS_PER_DAY,
  RESTORE_READS_EXTRA,
  RESTORES_PER_DAY,
  rowsOf,
  ROWS_PER_COMPACT,
  ROWS_RETRY_MS,
  SESSION_PREPAY,
  utcDay,
} from './limits';
import {
  ACTIVE_CHILDREN,
  COMPACT_SOLVE,
  COMPACTABLE,
  COMPACTED_BYTES,
  COUNT_ACTIVE,
  COUNT_RECORDS,
  PAGE_AFTER,
  PREFS_ROWS,
  RANGE_AFTER,
  RECORDS_BOUND,
  RECORDS_SCHEMA,
  rowToChange,
  SLICE_PAGE,
  STORED_BYTES,
  UPSERT_RECORD,
  utf8Bytes,
  type Row,
} from './records-sql';
import { copySlot, dayOf, daySlot, gunzipJson, gzipJson, listCopiesIn, nextSnapshotAt, partKey, preRestoreName, snapshotKey } from './snapshots';

const activeSolves = (data: KlickExport): number => data.solves.filter((s) => s.deletedAt === null).length;
// Os registros de uma cópia de arquivo só (as listas dela), para a estimativa das leituras da restauração.
const copyRecords = (copy: RestoreCopy): number => copy.sessions.length + copy.solves.length + (copy.practice?.length ?? 0) + (copy.duels?.length ?? 0);

// O arquivo só de uma cópia (um KlickExport) como a faixa única da restauração, com o perfil dele; null quando ele nem tem as listas de um
// export (torto). Uma cópia de antes do treino ou dos desafios (sem a lista) não mexe neles.
function fileCopy(v: unknown): (RestoreCopy & { profile: ProfilePatch | null }) | null {
  if (typeof v !== 'object' || v === null) return null;
  const data = v as Partial<KlickExport>;
  if (!Array.isArray(data.sessions) || !Array.isArray(data.solves)) return null;
  const practice = Array.isArray(data.practice) ? data.practice : null;
  const duels = Array.isArray(data.duels) ? data.duels : null;
  return { sessions: data.sessions, solves: data.solves, practice, duels, profile: data.profile ?? null };
}

// As cópias na nuvem da conta, no estado (`copies`, endurecimento 4.2 e decisão 1): a lista guardada (`list`, de quando `at`; null, nenhuma
// ainda), a pausa da cópia do dia (`paused`: o espaço ou as operações do R2 acabaram; null, as cópias seguem), que todo sync leva, e o
// tamanho comprimido da última cópia da conta (`gz`, a do dia ou a de antes de restaurar, gravada ou não; null, nenhuma ainda), a
// estimativa da próxima: com ela, o espaço e a operação A são conferidos antes de ler a conta (copyRoom). A lista vale por
// COPIES_CACHE_MS; uma cópia gravada e uma que sumiu (a restauração achou 404) a renovam (`at` 0: a próxima lista o R2 de novo).
interface Copies {
  at: number;
  list: CloudCopy[] | null;
  paused: CopiesPaused | null;
  gz: number | null;
}

// Uma contagem por dia UTC no estado (`writes`, as linhas gravadas, rowsOf; `restores`, as restaurações que deram certo, as que o aparelho
// faz inclusive; `attempts`, as tentativas de restaurar que chegaram ao R2; `reads`, as linhas lidas, guardadas a cada READS_SAVE_EVERY;
// `partReads`, os objetos de cópia que o aparelho baixou, copyPart).
interface DayCount {
  day: string;
  n: number;
}

// Quem reserva no teto de linhas do ambiente (reserveDay), no log quando o teto recusa ou o D1 falha. O que a reserva diz: reservado
// ('ok'), o dia acabou ('full'), ou o D1 falhou ('error': nada foi reservado, e quem chama não grava).
type RowsOp = 'sync' | 'device' | 'compact' | 'restore';
type Reserved = 'ok' | 'full' | 'error';

// O bucket de `listCopiesIn` com o teto: cada página reserva a operação A dela antes de ir ao R2, e sem ela a listagem para aqui.
const OUT_OF_OPS = new Error('r2-budget');

// Os contadores da conta, na tabela `state` (endurecimento 4.1, decisões 5 e 6): os ativos de cada store (`active`, a cota), o tamanho do
// conteúdo gravado em bytes (`bytes`, o teto de bytes) e as linhas gravadas no dia UTC (`writes`, { day, n }: o orçamento, contado por
// rowsOf; até a Task 12 contava mudanças, e o dia em que ela chega ao beta começa com as mudanças daquele dia). Toda gravação de registro
// passa por commit() ou pela compactação, que os acertam na mesma transação.
interface Usage {
  active: ActiveCounts;
  bytes: number;
  day: string; // o dia UTC do orçamento
  writes: number; // linhas gravadas nesse dia
}

// O que um pedido do sync lê do lote (cut): as mudanças lidas, as recusadas pela cascata, quantas do começo do lote foram tomadas (lidas
// ou recusadas; as outras voltam em `deferred`), se o corte foi o do pedido (MAX_WRITES_PER_REQUEST: o resto vai já) ou o do orçamento
// (o resto vai na virada do dia), as linhas que contar a cascata leu no índice (o orçamento de leituras) e os registros que o lido grava.
interface Cut {
  read: unknown[];
  refused: Rejected[];
  taken: number;
  now: boolean;
  rows: number;
  writes: number; // os registros que o lido grava, a cascata inclusive: rowsOf(writes) é o que o pedido reserva no teto do ambiente
}

// Os registros que um lote lê (um sync, uma restauração), cada um uma vez: applyChanges os lê pela vista, e o teto de bytes e write() pegam
// o tamanho do conteúdo gravado de cada um sem ler de novo. `json` é o texto de um `data`, guardado: o teto o mede e write() o grava.
// `rows`: as linhas que o lote leu até aqui (uma por registro procurado, e os solves de cada sessão da cascata), o orçamento de leituras.
interface Batch {
  view: RecordView;
  storedBytes(store: SyncStore, id: string): number;
  json(data: unknown): string;
  rows(): number;
}

// O teto de bytes (o `admit` de applyChanges): a mudança que faria o conteúdo gravado da conta passar de ACCOUNT_BYTES_CAP volta com o
// motivo da cota; a que encolhe ou mantém o tamanho (editar, apagar) passa sempre, mesmo numa conta já acima do teto. Uma exclusão que chega
// com o conteúdo maior cresce, e conta como crescer. Os ajustes (poucos, cada um com o tamanho limitado, e a temporada, que o servidor
// decide) passam sem conferir, mas contam. A conta corre pelo lote: o tamanho de cada registro depois do que o lote já deixou passar, e o
// total.
//
// A vaga de sessão paga adiantado: o solve que pede a vaga de uma sessão (asks) pode não crescer nada (movido para uma sessão nova,
// restaurado numa sessão da lixeira), e a sessão que chega depois dele passa de qualquer jeito (required). Por isso ele só passa se couber
// também o maior tamanho de uma sessão (SESSION_PREPAY), que fica reservado; quando a sessão chega, o crescimento dela sai da reserva, e o
// que a reserva não usou só sai do total no fim do lote (o `bytes` gravado vem do que write() gravou). Assim nada passa do teto.
function bytesCap(batch: Batch, stored: number): (before: Change | undefined, next: Change, required: boolean, asks: string | null) => boolean {
  const sizes = new Map<string, number>();
  const prepaid = new Map<string, number>(); // sessão -> o que sobra da reserva
  let total = stored;
  return (before, next, required, asks) => {
    const key = syncKey(next.store, next.id);
    const size = utf8Bytes(batch.json(next.data));
    const growth = size - (sizes.get(key) ?? (before === undefined ? 0 : batch.storedBytes(next.store, next.id)));
    const left = prepaid.get(key);
    if (left !== undefined) {
      total += Math.max(0, growth - left);
      prepaid.set(key, Math.max(0, left - growth));
      sizes.set(key, size);
      return true;
    }
    const reserve = asks === null ? 0 : SESSION_PREPAY;
    const need = Math.max(growth, 0) + reserve;
    if (!required && next.store !== 'prefs' && need > 0 && total + need > ACCOUNT_BYTES_CAP) return false;
    total += growth + reserve;
    if (asks !== null) prepaid.set(syncKey('sessions', asks), reserve);
    sizes.set(key, size);
    return true;
  };
}

export class AccountStore extends DurableObject<Env> {
  private readonly sql: SqlStorage;
  // As linhas lidas no dia que ainda não foram para o estado (o orçamento de leituras: readsOf, countReads, saveReads).
  private unsaved: DayCount = { day: '', n: 0 };
  // A menor reserva que o teto do ambiente recusou no dia UTC `day`, com o teto `cap` (reserveDay, dayRoom; a compactação reserva só na
  // metade dele): no mesmo dia, o D1 só sobe, então pedir o mesmo ou mais contra o mesmo teto seria recusado de novo, e o objeto não volta
  // a ele (nem ao log). Perdê-la ao sair da memória só faz a próxima perguntar de novo.
  private refused = { day: '', cap: 0, rows: Infinity };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.migrate();
  }

  private migrate(): void {
    for (const statement of RECORDS_SCHEMA) this.sql.exec(statement);
    // rev, userId, snapshotRev, lastSnapshotDay, deleted (a conta foi apagada: wipe), os contadores (active, bytes, writes: Usage), as
    // restaurações do dia (restores) e as cópias na nuvem (copies: a lista guardada e a pausa)
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, last_sync_at INTEGER NOT NULL)');
  }

  private getState(key: string): string | null {
    return this.sql.exec<{ value: string }>('SELECT value FROM state WHERE key = ?', key).toArray()[0]?.value ?? null;
  }

  private setState(key: string, value: string): void {
    this.sql.exec('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  private batch(): Batch {
    const rows = new Map<string, Row | null>();
    let read = 0;
    const load = (store: string, id: string): Row | null => {
      const key = syncKey(store, id);
      let row = rows.get(key);
      if (row === undefined) {
        row = this.sql.exec<Row>('SELECT * FROM records WHERE store = ? AND id = ?', store, id).toArray()[0] ?? null;
        rows.set(key, row);
        read += 1;
      }
      return row;
    };
    const texts = new WeakMap<object, string>();
    return {
      view: {
        get: (store, id) => {
          const row = load(store, id);
          return row ? rowToChange(row) : undefined;
        },
        solvesOf: (sessionId) => {
          const found = this.sql.exec<Row>("SELECT * FROM records WHERE store = 'solves' AND parent = ?", sessionId).toArray();
          read += found.length;
          return found.map((row) => {
            const key = syncKey('solves', row.id);
            if (!rows.has(key)) rows.set(key, row);
            return rowToChange(row);
          });
        },
      },
      storedBytes: (store, id) => {
        const row = load(store, id);
        return row ? utf8Bytes(row.data) : 0;
      },
      json: (data) => {
        if (typeof data !== 'object' || data === null) return JSON.stringify(data);
        let text = texts.get(data);
        if (text === undefined) {
          text = JSON.stringify(data);
          texts.set(data, text);
        }
        return text;
      },
      rows: () => read,
    };
  }

  // Os contadores (Usage), lidos do estado. Uma conta de antes deles (as do beta) os ganha da contagem do banco, uma vez, antes de o lote
  // gravar qualquer coisa. As gravações contam no dia UTC de `now`: num dia novo, o orçamento volta inteiro. O dia nunca volta atrás: um
  // pedido com a hora de um dia que já passou (o relógio de outro Worker, atrasado), atendido depois de um do dia seguinte, conta no dia mais
  // novo que o objeto já viu, sem zerar o que foi gravado nele. Cada contagem do banco varre a tabela inteira, e conta no orçamento de
  // leituras como os registros dela (STORED_BYTES diz quantos).
  private usage(now: number): Usage {
    let active = this.getState('active');
    let bytes = this.getState('bytes');
    if (active === null || bytes === null) {
      const stored = this.sql.exec<{ n: number; rows: number }>(STORED_BYTES).one();
      let scans = 1;
      if (active === null) {
        const counts = zeroCounts();
        for (const r of this.sql.exec<{ store: string; n: number }>(COUNT_ACTIVE)) {
          if (isCounted(r.store as SyncStore)) counts[r.store as CountedStore] = r.n;
        }
        active = JSON.stringify(counts);
        this.setState('active', active);
        scans += 1;
      }
      if (bytes === null) {
        bytes = String(stored.n);
        this.setState('bytes', bytes);
      }
      this.countReads(scans * stored.rows, now);
    }
    const writes = this.dayCount('writes', now);
    // Uma conta de antes dos desafios tem o contador gravado sem a chave deles: nenhum desafio existia nela (o protocolo 3 os trouxe), então
    // ela começa do zero, e não de undefined (que viraria NaN na primeira soma e tiraria os desafios da cota).
    const counted: ActiveCounts = { ...zeroCounts(), ...(JSON.parse(active) as Partial<ActiveCounts>) };
    return { active: counted, bytes: Number(bytes), day: writes.day, writes: writes.n };
  }

  // A contagem do dia UTC de `now` (num dia novo, 0), sem gravar nada. O dia nunca volta atrás (usage, acima).
  private dayCount(key: 'writes' | 'restores' | 'attempts' | 'reads' | 'partReads', now: number): DayCount {
    const stored = JSON.parse(this.getState(key) ?? 'null') as DayCount | null;
    const today = utcDay(now);
    const day = stored !== null && stored.day > today ? stored.day : today;
    return { day, n: stored?.day === day ? stored.n : 0 };
  }

  // As linhas lidas no dia UTC de `now` (o orçamento de leituras, DAILY_READ_BUDGET): as guardadas no estado mais as que ainda estão só na
  // memória. Num dia novo, o que estava na memória era do dia de antes, e sai.
  private readsOf(now: number): DayCount {
    const stored = this.dayCount('reads', now);
    if (this.unsaved.day !== stored.day) this.unsaved = { day: stored.day, n: 0 };
    return { day: stored.day, n: stored.n + this.unsaved.n };
  }

  // Soma `n` linhas lidas, na memória.
  private countReads(n: number, now: number): void {
    this.readsOf(now);
    this.unsaved.n += n;
  }

  // As linhas lidas vão para o estado só quando juntam READS_SAVE_EVERY: contar não grava uma linha por pedido. Fora da transação de quem
  // leu, e uma falha (no grátis, passadas as linhas gravadas do dia de todas as contas) fica para a próxima vez. O que está só na memória
  // quando o objeto sai dela se perde, no máximo READS_SAVE_EVERY por vez.
  private saveReads(now: number): void {
    if (this.unsaved.n < READS_SAVE_EVERY) return;
    try {
      const reads = this.readsOf(now);
      this.setState('reads', JSON.stringify(reads));
      this.unsaved = { day: reads.day, n: 0 };
    } catch {
      console.log(JSON.stringify({ evt: 'reads-unsaved' }));
    }
  }

  // Antes de gravar (o sync, o aparelho, a compactação e a restauração; apagar a conta não passa por aqui): reserva no teto do ambiente
  // (ROWS_WRITTEN_DAY_CAP) exatamente as `rows` linhas que a gravação conta no orçamento da conta (rowsOf), numa instrução do D1 (reserveRows),
  // no dia do orçamento (dayCount, que nunca volta atrás). A compactação reserva só na metade de baixo do dia (COMPACT_ROWS_SHARE). Nada fica
  // na memória do objeto, e sair dela não perde nada. Sem linhas no dia, 'full', e vai para o log ({evt:'rows-cap'}); um D1 que falha,
  // 'error' ({evt:'rows-cap-error'}): nos dois, nada foi reservado, e quem chama não grava. Quem chama roda em exclusive
  // (blockConcurrencyWhile): nada muda na conta entre conferir, reservar e gravar.
  private async reserveDay(rows: number, now: number, op: RowsOp): Promise<Reserved> {
    if (rows <= 0) return 'ok';
    const day = this.dayCount('writes', now).day;
    const full = capsOf(this.env).rowsDay;
    const cap = op === 'compact' ? Math.floor(full * COMPACT_ROWS_SHARE) : full;
    if (this.refusedBefore(day, cap, rows)) return 'full';
    try {
      if (await reserveRows(this.env.DB, rows, Date.parse(day), cap)) return 'ok';
    } catch {
      console.log(JSON.stringify({ evt: 'rows-cap-error', user: this.getState('userId'), op }));
      return 'error';
    }
    this.refuse(day, cap, rows, op);
    return 'full';
  }

  // Sem reservar (a restauração, antes de ir ao R2 e antes da cópia de antes, quando ainda não grava): o dia mais `rows` linhas cabe no teto
  // do ambiente? Só lê; a reserva de depois (reserveDay) continua a autoridade. Como a reserva: 'ok', cabe; 'full', o dia acabou; 'error', o
  // D1 falhou (vai para o log), e quem chama não grava. A restauração distingue os dois: um D1 que falha não é "não cabe hoje" (M2).
  private async dayRoom(rows: number, now: number, op: RowsOp): Promise<Reserved> {
    if (rows <= 0) return 'ok';
    const day = this.dayCount('writes', now).day;
    const cap = capsOf(this.env).rowsDay;
    if (this.refusedBefore(day, cap, rows)) return 'full';
    try {
      if (await rowsRoom(this.env.DB, rows, Date.parse(day), cap)) return 'ok';
    } catch {
      console.log(JSON.stringify({ evt: 'rows-cap-error', user: this.getState('userId'), op }));
      return 'error';
    }
    this.refuse(day, cap, rows, op);
    return 'full';
  }

  private refusedBefore(day: string, cap: number, rows: number): boolean {
    return this.refused.day === day && this.refused.cap === cap && rows >= this.refused.rows;
  }

  // O teto recusou `rows` linhas no dia: fica lembrado (refused), e vai para o log.
  private refuse(day: string, cap: number, rows: number, op: RowsOp): void {
    const same = this.refused.day === day && this.refused.cap === cap;
    this.refused = { day, cap, rows: same ? Math.min(this.refused.rows, rows) : rows };
    console.log(JSON.stringify({ evt: 'rows-cap', user: this.getState('userId'), op, rows }));
  }

  // Depois de gravar: o que passou do reservado (a sessão que a cascata devolve, que o corte não prevê: cut) já está gravado, e conta no D1
  // sem recusar; uma falha nessa conta vai só para o log, e a gravação fica. O reservado que não foi gravado (a mudança que a cota recusou,
  // ou que não mudou nada) fica contado: a conta erra para mais, nunca para menos.
  private async settleRows(reserved: number, wrote: number, now: number): Promise<void> {
    if (wrote <= reserved) return;
    try {
      await countRows(this.env.DB, wrote - reserved, Date.parse(this.dayCount('writes', now).day));
    } catch {
      console.log(JSON.stringify({ evt: 'rows-uncounted', rows: wrote - reserved }));
    }
  }

  private copies(): Copies {
    const stored = JSON.parse(this.getState('copies') ?? 'null') as Partial<Copies> | null;
    return { at: stored?.at ?? 0, list: stored?.list ?? null, paused: stored?.paused ?? null, gz: stored?.gz ?? null };
  }

  private setCopies(copies: Copies): void {
    this.setState('copies', JSON.stringify(copies));
  }

  // Uma cópia foi gravada ou sumiu: a lista guardada fica velha, e a próxima lista o R2 de novo (a guardada ainda serve sem operações).
  private renewCopies(): void {
    this.setCopies({ ...this.copies(), at: 0 });
  }

  // Soma nos contadores, gravando só o que mudou: um sync que só recebe não grava nada no estado. `writes` em linhas (rowsOf).
  private addUsage(usage: Usage, add: { active?: ActiveCounts; bytes: number; writes: number }): void {
    const delta = add.active;
    if (delta && Object.values(delta).some((n) => n !== 0)) {
      const active = { ...usage.active };
      for (const store of Object.keys(delta) as CountedStore[]) active[store] += delta[store];
      this.setState('active', JSON.stringify(active));
    }
    if (add.bytes !== 0) this.setState('bytes', String(usage.bytes + add.bytes));
    if (add.writes > 0) this.setState('writes', JSON.stringify({ day: usage.day, n: usage.writes + add.writes }));
  }

  // Grava o que um lote mudou e acerta os contadores: os ativos pelo activeDelta, os bytes pelo que write() gravou, e cada registro gravado
  // (a cascata e a versão vencedora que volta para quem mandou a velha, inclusive) conta no orçamento do dia, em linhas (rowsOf). Devolve
  // essas linhas: quem chama as confere com o que reservou no teto do ambiente (settleRows).
  private commit(result: Pick<ApplyResult, 'writes' | 'activeDelta'>, batch: Batch, usage: Usage): number {
    const grew = this.write(result.writes, batch);
    const rows = rowsOf(result.writes.length);
    this.addUsage(usage, { active: result.activeDelta, bytes: grew, writes: rows });
    return rows;
  }

  // A conta inteira, de uma vez (a cópia de arquivo só, até COPY_PART_RECORDS registros: writeCopyIn), contada no orçamento de leituras. A
  // restauração não a lê assim: compara faixa a faixa (currentOf).
  private all(now: number): Change[] {
    const rows = this.sql.exec<Row>('SELECT * FROM records').toArray();
    this.countReads(rows.length, now);
    return rows.map(rowToChange);
  }

  // O tamanho da conta em registros (COUNT_RECORDS), até `limit` + 1: a cópia do dia o confere antes de ler (o teto, o dia útil e o arquivo
  // só ou as partes), e o COUNT não percorre o resto de uma conta enorme. A restauração não conta a conta: compara (restoreSnapshot). Conta
  // no orçamento de leituras as linhas que contou.
  private recordCount(limit: number, now: number): number {
    const n = this.sql.exec<{ n: number }>(COUNT_RECORDS, limit + 1).one().n;
    this.countReads(n, now);
    return n;
  }

  // A sessão que a mudança apaga (o id), ou null: só uma exclusão de sessão que passa por checkChange tem cascata.
  private deletedSession(raw: unknown): string | null {
    const r = raw as { store?: unknown; deletedAt?: unknown } | null;
    if (r?.store !== 'sessions' || r.deletedAt === null || r.deletedAt === undefined) return null;
    const checked = checkChange(raw);
    return checked.ok && checked.change.deletedAt !== null ? checked.change.id : null;
  }

  // O que um pedido do sync lê do lote (decisão 6 e Task 12): no máximo MAX_WRITES_PER_REQUEST mudanças, e só as que cabem, com a cascata,
  // nas linhas que sobram hoje (`room`), contadas por cima (rowsOf: cada mudança grava um registro). A exclusão de uma sessão grava também
  // os solves ativos dela (a cascata, em applyChanges), contados antes pelo índice (ACTIVE_CHILDREN, até `most`, o bastante para saber que
  // não cabem; uma vez por sessão no lote): a que não cabe no que sobra hoje fica para amanhã, com o resto do lote; a que passa de `most`
  // registros (o dia útil, recordsPerDay: não caberia num dia inteiro da conta ou do teto do ambiente, com a compactação do alarme ao lado)
  // volta com o motivo da cota (o aparelho a guarda, "só neste aparelho", e Enviar de novo manda os solves antes dela: repository.ts,
  // requeueHeld), sem gravar nada dela, e o resto do lote segue. Assim nenhum pedido grava mais que um dia, e nenhum espera um dia que nunca
  // chega. A cascata em partes, pelo servidor, fica para uma spec própria.
  //
  // O que cut() não prevê: a sessão apagada que a cascata devolve (um solve ativo do lote, mais novo que a exclusão dela, a traz de volta;
  // apply.ts e merge.ts, cascade) grava uma sessão a mais por sessão apagada distinta no lote. É pouco e limitado (no máximo uma por
  // mudança lida), e entra no orçamento pelo que commit() conta de verdade (e no teto do ambiente, por settleRows).
  //
  // `children`: os solves ativos de cada sessão apagada no lote, lidos uma vez; o corte de novo do mesmo pedido (sem linhas no teto do
  // ambiente, syncBatch) os passa, e não lê o índice outra vez.
  private cut(changes: readonly unknown[], room: number, most: number, children = new Map<string, number>()): Cut {
    const read: unknown[] = [];
    const refused: Rejected[] = [];
    let writes = 0; // registros que o que foi lido grava, a cascata inclusive
    let taken = 0;
    let rows = 0; // as linhas que as contagens leram no índice
    for (const raw of changes) {
      if (taken === MAX_WRITES_PER_REQUEST) return { read, refused, taken, now: true, rows, writes };
      const sid = this.deletedSession(raw);
      let n = 1;
      if (sid !== null) {
        let count = children.get(sid);
        if (count === undefined) {
          count = this.sql.exec<{ n: number }>(ACTIVE_CHILDREN, sid, most).one().n;
          children.set(sid, count);
          rows += count;
        }
        n += count;
      }
      if (sid !== null && n > most) refused.push({ store: 'sessions', id: sid, reason: QUOTA_REASON });
      else if (rowsOf(writes + n) > room) break;
      else {
        writes += n;
        read.push(raw);
      }
      taken++;
    }
    return { read, refused, taken, now: false, rows, writes };
  }

  // A marca que wipe deixa: o objeto de uma conta apagada recusa o sync, a restauração e a cópia, e não marca alarme. Sem ela, um sync com a
  // sessão ainda aberta (antes de as linhas do D1 sumirem) traria a conta de volta, guardada para sempre e sem dono para apagá-la.
  private deleted(): boolean {
    return this.getState('deleted') !== null;
  }

  // O que espera o R2 ou o D1 (a cópia do dia, a restauração, o sync que reserva as linhas do dia) e o apagar rodam sem nenhum outro pedido
  // no meio: blockConcurrencyWhile segura os pedidos que chegam até o fim. O erro sai daqui de fora: lançado lá dentro, ele reiniciaria o
  // objeto.
  private async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const out: { value?: T; failed?: boolean; error?: unknown } = {};
    await this.ctx.blockConcurrencyWhile(async () => {
      try {
        out.value = await fn();
      } catch (error) {
        out.failed = true;
        out.error = error;
      }
    });
    if (out.failed) throw out.error;
    return out.value as T;
  }

  // Grava cada registro que mudou com a próxima revisão da conta e devolve quanto o conteúdo gravado cresceu, em bytes (negativo: encolheu).
  // `parent` segue o conteúdo gravado: um solve que passou para outra sessão sai da cascata da de antes e entra na da nova.
  private write(changes: readonly Change[], batch: Batch): number {
    if (changes.length === 0) return 0;
    let rev = Number(this.getState('rev') ?? '0');
    let grew = 0;
    for (const c of changes) {
      rev += 1;
      const data = batch.json(c.data);
      grew += utf8Bytes(data) - batch.storedBytes(c.store, c.id);
      this.sql.exec(UPSERT_RECORD, c.store, c.id, data, c.updatedAt, c.deletedAt, c.deletionStamp, rev, sessionOfChange(c));
    }
    this.setState('rev', String(rev));
    return grew;
  }

  // POST /api/sync (spec 6.1): valida e junta o lote, dá revisão ao que mudou e devolve o que mudou desde o cursor, em páginas de PULL_PAGE
  // (só recebendo) ou PULL_PAGE_WITH_PUSH (com mudanças no pedido: gravar e a página grande passariam da CPU de um pedido; Task 12).
  // Um cursor além da revisão da conta não saiu daqui (o banco do objeto recomeçou por fora; uma conta apagada já recusa o sync): o aparelho
  // recomeça do zero, senão nunca mais receberia nada. A comparação é com a revisão de antes do lote, a última que algum aparelho pode ter
  // visto.
  //
  // A cota (endurecimento 4.1): applyChanges recusa, com o motivo da cota, o registro que passaria do teto de ativos, e o teto de bytes
  // (bytesCap), a mudança que faria a conta passar de ACCOUNT_BYTES_CAP. O orçamento do dia (decisão 6) e o corte do pedido (cut): só as
  // primeiras mudanças que cabem no que sobra de DAILY_WRITE_BUDGET hoje, até MAX_WRITES_PER_REQUEST, são lidas; as outras não são gravadas
  // e voltam em `deferred` (as últimas N do lote), com `retryAt`: a meia-noite UTC do fim do dia do orçamento, quando ele volta, ou a hora
  // do pedido, quando foi o corte do pedido (o app manda o resto em seguida). A exclusão de uma sessão cuja cascata não caberia num dia (o
  // dia útil, recordsPerDay) volta em `rejected`, com o motivo da cota. O recebimento segue igual, com ou sem orçamento. Toda resposta leva
  // `copiesPaused`, a pausa das cópias na nuvem (null quando elas seguem).
  //
  // O teto do ambiente (ROWS_WRITTEN_DAY_CAP): as linhas do que o corte leu são reservadas (reserveDay) antes de gravar, exatamente elas,
  // numa instrução do D1. A reserva espera o D1, e a transação síncrona não espera nada: o pedido corta o lote numa transação, reserva, e
  // grava noutra, tudo em exclusive, sem outro pedido no meio. Sem linhas no teto, nada do lote é lido (o corte de novo, sem linhas: só as
  // recusas da cota do começo dele), e o resto volta em `deferred` como no orçamento da conta, com `retryAt` na virada do dia UTC; o
  // recebimento segue. Um pedido que não grava nada (só recebe, ou com o orçamento da conta no fim) não reserva nada e não espera o D1.
  //
  // O orçamento de leituras (revisão final, I2 c): passadas DAILY_READ_BUDGET linhas lidas no dia, o pedido não lê nada (unread). Senão, as
  // linhas que ele leu (as contagens da cascata, os registros do lote, a página) contam. O aparelho do pedido vem depois, fora da transação
  // (touchDevice): um sync que só recebe, com a linha do aparelho fresca, não grava nada, e o recebimento nunca cai por uma gravação.
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse | 'deleted'> {
    const done = await this.exclusive(async (): Promise<{ response: SyncResponse; unread: boolean } | 'deleted'> => {
      const plan = this.ctx.storage.transactionSync(() => {
        if (this.deleted()) return 'deleted' as const;
        if (this.getState('userId') === null) this.setState('userId', userId);
        const reads = this.readsOf(now);
        if (reads.n >= DAILY_READ_BUDGET) return { unread: this.unread(req, now, reads.day) };
        const usage = this.usage(now);
        const most = recordsPerDay(capsOf(this.env).rowsDay);
        const children = new Map<string, number>();
        const cut = this.cut(req.changes, DAILY_WRITE_BUDGET - usage.writes, most, children);
        this.countReads(cut.rows, now);
        return { usage, most, children, cut };
      });
      if (plan === 'deleted') return plan;
      if (plan.unread !== undefined) return { response: plan.unread, unread: true };
      const { usage } = plan;
      let { cut } = plan;
      let reserved = rowsOf(cut.writes);
      const got = await this.reserveDay(reserved, now, 'sync');
      if (got !== 'ok') {
        cut = this.cut(req.changes, 0, plan.most, plan.children);
        reserved = 0;
      }
      // O resto do lote volta: logo, no corte do pedido; em ROWS_RETRY_MS, depois de um D1 que falhou na reserva; na virada do dia do
      // orçamento, sem linhas na conta ou no teto do ambiente.
      const retryAt = got === 'error' ? now + ROWS_RETRY_MS : cut.now ? now : nextUtcDay(Date.parse(usage.day));
      const { response, rows } = this.ctx.storage.transactionSync(() => {
        const from = req.cursor > Number(this.getState('rev') ?? '0') ? 0 : req.cursor;
        const batch = this.batch();
        const floor = Number(this.getState('restoreFloor') ?? '0'); // a última restauração no servidor (I1): o que vem de antes dela perde
        const result = applyChanges(batch.view, cut.read, { mode: 'server', quota: { active: usage.active }, admit: bytesCap(batch, usage.bytes), floor });
        const rows = this.commit(result, batch, usage);
        const size = req.changes.length > 0 ? PULL_PAGE_WITH_PUSH : PULL_PAGE;
        const found = this.sql.exec<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', from, size + 1).toArray();
        this.countReads(batch.rows() + found.length, now);
        const page = found.slice(0, size);
        const deferred = req.changes.length - cut.taken;
        const response: SyncResponse = {
          accepted: cut.read.length - result.rejected.length,
          rejected: [...result.rejected, ...cut.refused],
          changes: page.map(rowToChange),
          cursor: page.length > 0 ? page[page.length - 1].rev : from,
          more: found.length > size,
          serverTime: now,
          ...(deferred > 0 ? { deferred, retryAt } : {}),
          copiesPaused: this.copies().paused,
        };
        return { response, rows };
      });
      await this.settleRows(reserved, rows, now);
      await this.touchDevice(req.deviceId, now, rows > 0);
      return { response, unread: false };
    });
    if (done === 'deleted') return done;
    this.saveReads(now);
    // A cópia diária: o primeiro sync marca o alarme. Pela hora de verdade, não pela do pedido: um alarme no passado dispararia na hora.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextSnapshotAt(Date.now()));
    return done.response;
  }

  // O pedido que chega depois do orçamento de leituras do dia: nada é lido nem gravado. A página volta vazia, com o cursor do pedido e sem
  // `more` (o aparelho não pede de novo na mesma rodada), o lote volta todo em `deferred`, e os dois esperam a virada do dia UTC (retryAt),
  // com `readsDeferred`, que diz ao app que o recebimento também ficou para lá.
  private unread(req: SyncRequest, now: number, day: string): SyncResponse {
    const deferred = req.changes.length;
    return {
      accepted: 0,
      rejected: [],
      changes: [],
      cursor: req.cursor,
      more: false,
      serverTime: now,
      ...(deferred > 0 ? { deferred } : {}),
      retryAt: nextUtcDay(Date.parse(day)),
      readsDeferred: true,
      copiesPaused: this.copies().paused,
    };
  }

  // O aparelho do pedido, na tabela `devices` (a página de privacidade a cita; nada a lê): gravado só quando é novo ou quando a linha dele
  // passou de DEVICE_TOUCH_MS, e só os MAX_DEVICES mais recentes ficam (um aparelho novo além deles tira o mais velho dos outros). A
  // gravação conta no orçamento do dia: num pedido que gravou mudanças (`paid`), ela já está nas REQUEST_ROWS dele; num que só recebe, ela
  // conta as REQUEST_ROWS, que também são reservadas no teto do ambiente (reserveDay, antes de gravar), e sem elas no dia, numa conta ou na
  // outra, fica para depois. Fora da transação do pedido, e uma falha só vai para o log: no grátis, passadas as linhas gravadas do dia de
  // todas as contas, toda gravação falha, e o recebimento não pode cair por isso. Roda no exclusive do sync: nada muda entre conferir e
  // gravar.
  private async touchDevice(deviceId: string, now: number, paid: boolean): Promise<void> {
    try {
      const seen = this.sql.exec<{ at: number }>('SELECT last_sync_at AS at FROM devices WHERE device_id = ?', deviceId).toArray()[0]?.at;
      if (seen !== undefined && now - seen <= DEVICE_TOUCH_MS) return;
      const writes = this.dayCount('writes', now);
      const rows = paid ? 0 : REQUEST_ROWS;
      if (writes.n + rows > DAILY_WRITE_BUDGET || (await this.reserveDay(rows, now, 'device')) !== 'ok') return;
      this.ctx.storage.transactionSync(() => {
        this.sql.exec(
          'INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
          deviceId, now,
        );
        if (seen === undefined) {
          this.sql.exec(
            'DELETE FROM devices WHERE device_id IN (SELECT device_id FROM devices WHERE device_id <> ? ORDER BY last_sync_at DESC, device_id DESC LIMIT -1 OFFSET ?)',
            deviceId, MAX_DEVICES - 1,
          );
        }
        if (rows > 0) this.setState('writes', JSON.stringify({ day: writes.day, n: writes.n + rows }));
      });
    } catch {
      console.log(JSON.stringify({ evt: 'device-skipped' }));
    }
  }

  // Uma vez por dia (spec 8.3): a compactação e depois a cópia do dia, só se a conta mudou desde a última. Uma conta apagada (ou sem dono)
  // não marca o próximo. A limpeza dos pedidos de código e dos códigos vencidos (spec 10) é do Cron Trigger do Worker (worker/index.ts): ela
  // não pode depender de uma conta viva nem da cópia no R2 dar certo. Um erro da cópia (o R2 que falha no meio das partes) não sai do
  // alarme (a revisão final, I4): lançado, o runtime repetiria o alarme, e cada repetição leria e regravaria as partes. Ele vai para o log
  // ({evt:'copy-failed'}), a cópia já limpou o que gravou (writeParts) e não marcou snapshotRev, e o alarme de amanhã é marcado sempre (a
  // cópia de uma conta grande espera a próxima vez dela, bigCopyDue).
  async alarm(): Promise<void> {
    await this.exclusive(async () => {
      if (this.deleted()) return;
      const userId = this.getState('userId');
      if (userId === null) return;
      const now = Date.now();
      await this.compact(now);
      try {
        await this.takeSnapshot(now);
      } catch (error) {
        console.log(JSON.stringify({ evt: 'copy-failed', user: userId, error: error instanceof Error ? error.message : String(error) }));
      }
      this.saveReads(now);
      await this.ctx.storage.setAlarm(nextSnapshotAt(now));
    });
  }

  // A marca compactada (endurecimento, decisão 5): dos solves apagados há mais de TOMBSTONE_KEEP_MS fica só a marca (data '{}'), no máximo
  // COMPACT_PER_DAY por dia e dentro das linhas que sobram do orçamento do dia, onde contam (rowsOf). A data é a exclusão gravada, que vem do
  // aparelho: o mesmo prazo em que ele tira o solve da lixeira. Sem revisão nova: quem já viu o solve não recebe nada, e quem ainda não
  // chegou à revisão dele recebe a marca (que um aparelho sem o solve não grava). `parent` fica. Um aparelho que ainda tem o conteúdo e o
  // manda de novo grava uma revisão nova, como qualquer mudança, e a compactação de outro dia o tira de novo.
  //
  // As linhas dela são reservadas também no teto do ambiente (reserveDay), exatamente elas, entre achar os vencidos e gravar (o alarme roda
  // em exclusive); sem elas, a compactação fica para o alarme de amanhã, e a cópia do dia segue.
  private async compact(now: number): Promise<number> {
    const plan = this.ctx.storage.transactionSync(() => {
      const usage = this.usage(now);
      const fit = Math.floor((DAILY_WRITE_BUDGET - usage.writes - REQUEST_ROWS) / ROWS_PER_COMPACT); // rowsOf(0, fit) cabe no que sobra
      const limit = Math.min(COMPACT_PER_DAY, Math.max(0, fit));
      if (limit === 0) return null;
      const due = this.sql.exec<{ id: string; bytes: number }>(COMPACTABLE, now - TOMBSTONE_KEEP_MS, limit).toArray();
      this.countReads(due.length, now);
      return { usage, due };
    });
    if (plan === null || plan.due.length === 0) return 0;
    const rows = rowsOf(0, plan.due.length);
    if ((await this.reserveDay(rows, now, 'compact')) !== 'ok') return 0;
    this.ctx.storage.transactionSync(() => {
      let freed = 0;
      for (const r of plan.due) {
        this.sql.exec(COMPACT_SOLVE, r.id);
        freed += r.bytes - COMPACTED_BYTES;
      }
      this.addUsage(plan.usage, { bytes: -freed, writes: rows });
    });
    return plan.due.length;
  }

  async snapshot(now: number): Promise<boolean> {
    const done = await this.exclusive(() => this.takeSnapshot(now));
    this.saveReads(now);
    return done;
  }

  // A cópia do dia, dentro do grátis (endurecimento 4.2, Task 12 e as cópias grandes): uma conta com mais registros que SNAPSHOT_MAX_RECORDS
  // não tem cópia (o tempo de relógio e a memória do objeto; 'size'). Uma conta grande, com mais registros que o dia útil (recordsPerDay),
  // copia só na vez dela (bigCopyDue: de BIG_COPY_EVERY_DAYS em BIG_COPY_EVERY_DAYS dias, no dia da semana dela); fora da vez volta sem pausa
  // e sem marcar snapshotRev, e o alarme de amanhã pergunta de novo. Por isso a primeira contagem vai só até o dia útil + 1: nos dias sem
  // cópia, uma conta grande não gasta as leituras. Na vez dela, a conta não é contada de novo até o teto (a revisão final, I5 a: as páginas
  // já leem a conta inteira, e a contagem a leria duas vezes): as páginas conferem o teto (writeParts), e um arquivo só, a contagem dele
  // (writeCopyIn). Antes, as leituras dela contra o que sobra do dia (I4). Com o tamanho da última cópia (`gz`), o espaço e a operação A
  // também são conferidos antes de ler (copyRoom): uma conta pausada por eles não lê nem comprime a conta todo dia para descobrir de novo
  // que não cabe (a primeira cópia lê, como antes). A gravação é de writeCopy (um arquivo ou as partes, e a reserva de cada uma). Recusada,
  // ela não é gravada nem marca snapshotRev (o alarme de amanhã tenta de novo; uma conta grande, na próxima vez dela), e a pausa fica no
  // estado, com o motivo; gravada, a pausa sai e a lista guardada se renova.
  private async takeSnapshot(now: number): Promise<boolean> {
    const userId = this.getState('userId');
    const rev = this.getState('rev') ?? '0';
    if (this.deleted() || userId === null || this.getState('snapshotRev') === rev) return false;
    const caps = capsOf(this.env);
    if (caps.snapshotRecords === 0) return this.pauseCopies(userId, 'size');
    // A primeira contagem para no menor dos dois limites + 1: o bastante para saber se a conta passou do teto ('size') ou do dia útil (é
    // grande). Uma grande fora da vez volta aqui, depois de contar no máximo recordsPerDay + 1 linhas (e não as do teto). Uma pequena já
    // sabe o tamanho exato.
    const useful = recordsPerDay(caps.rowsDay);
    const records = this.recordCount(Math.min(useful, caps.snapshotRecords), now);
    if (records > caps.snapshotRecords) return this.pauseCopies(userId, 'size');
    if (records > useful) {
      if (!this.bigCopyDue(userId, now)) return false;
      // O teto da conta (recordsBound, uma linha): acima do teto da cópia, ou com as leituras dela (as páginas e COPY_READS_EXTRA) maiores
      // que um dia inteiro, ela nunca cabe, e pausa com 'size' antes de reservar ou ler qualquer coisa (a rodada residual da revisão final).
      // Que passaria só do que sobra hoje, fica sem pausa para a próxima vez dela (bigCopyDue: o dia dela, ou 13 dias depois da última; I4):
      // parada no meio, ela já teria lido, e o sync da conta esperaria a virada do dia.
      const bound = this.recordsBound(now);
      if (bound > caps.snapshotRecords || bound + COPY_READS_EXTRA > DAILY_READ_BUDGET) return this.pauseCopies(userId, 'size');
      if (this.readsOf(now).n + bound + COPY_READS_EXTRA > DAILY_READ_BUDGET) return false;
    }
    const estimate = this.copies().gz;
    const short = estimate === null ? null : await copyRoom(this.env.DB, estimate, now, caps);
    if (short !== null) return this.pauseCopies(userId, short);
    const day = dayOf(now);
    const done = await this.writeCopy(userId, day, { kind: 'daily', day }, now, caps);
    if (typeof done === 'string') return this.pauseCopies(userId, done);
    this.setState('snapshotRev', rev);
    this.setState('lastSnapshotDay', day);
    this.setCopies({ ...this.copies(), at: 0, paused: null, gz: done.gz });
    return true;
  }

  // Já é a vez da cópia de uma conta grande? No dia dela (copySlot da conta igual ao daySlot do dia de Brasília de agora: as contas grandes
  // não copiam todas no mesmo dia, a revisão final, I5 c), quando nenhuma foi gravada (lastSnapshotDay falta) ou quando a última ficou
  // BIG_COPY_EVERY_DAYS dias inteiros ou mais para trás; e, em qualquer dia, quando ficou 2 × BIG_COPY_EVERY_DAYS − 1 ou mais (o dia dela
  // passou sem cópia: sem espaço, sem leituras, um erro). Os dois são AAAA-MM-DD, então a diferença é de dias inteiros; um valor que não lê
  // como data (nunca grava assim) vale como ausente, e um dia no futuro (o relógio voltou) espera.
  private bigCopyDue(userId: string, now: number): boolean {
    const today = dayOf(now);
    const ownDay = daySlot(today) === copySlot(userId);
    const last = this.getState('lastSnapshotDay');
    const gone = last === null ? NaN : (Date.parse(today) - Date.parse(last)) / 86_400_000;
    if (Number.isNaN(gone)) return ownDay;
    return (ownDay && gone >= BIG_COPY_EVERY_DAYS) || gone >= 2 * BIG_COPY_EVERY_DAYS - 1;
  }

  // Grava uma cópia da conta com o nome `name` (a do dia, e depois a de antes de restaurar) e volta o tamanho comprimido dela e as partes,
  // ou o motivo da recusa: o teto da cópia ('size'), o espaço ou as operações A. Recusada, nada fica gravado nem o espaço reservado; as
  // operações A que a cópia em partes reservou de uma vez ficam contadas (a mais, nunca a menos). Até COPY_PART_RECORDS registros, o
  // arquivo só de sempre, com a conta inteira lida de uma vez (`all`). Acima, a cópia em partes (writeParts): o objeto nunca tem a conta
  // inteira na memória, só uma página; acima do teto da cópia pelo teto da conta (recordsBound), 'size' antes de reservar ou ler as páginas.
  // A contagem é limitada a COPY_PART_RECORDS + 1 linhas, e entra no orçamento de leituras como as outras.
  // Uma recusa deixa a estimativa (`gz`) com o tamanho do que chegou a ser comprimido, para o copyRoom do dia seguinte. A cópia gravada vai
  // para o log ({evt:'copy'}) com as partes (0 num arquivo só) e o tempo de relógio dela (`ms`): tudo roda dentro de blockConcurrencyWhile,
  // que tem 30 s, e o `wrangler tail` mostra quanto uma conta grande gasta de verdade (o portão do README).
  private async writeCopy(
    userId: string,
    name: string,
    meta: { kind: 'daily' | 'pre-restore'; day: string },
    now: number,
    caps: Caps,
  ): Promise<{ gz: number; parts: number } | CopiesPaused> {
    const started = Date.now();
    const done = await this.writeCopyIn(userId, name, meta, now, caps);
    if (typeof done === 'string') return done;
    console.log(JSON.stringify({ evt: 'copy', user: userId, kind: meta.kind, parts: done.parts, ms: Date.now() - started }));
    return done;
  }

  private async writeCopyIn(
    userId: string,
    name: string,
    meta: { kind: 'daily' | 'pre-restore'; day: string },
    now: number,
    caps: Caps,
  ): Promise<{ gz: number; parts: number } | CopiesPaused> {
    const records = this.recordCount(COPY_PART_RECORDS, now);
    if (records > COPY_PART_RECORDS) {
      const bound = this.recordsBound(now);
      if (bound > caps.snapshotRecords) return 'size'; // antes de reservar as operações ou ler as páginas
      return this.writeParts(userId, name, meta, now, caps, bound);
    }
    if (records > caps.snapshotRecords) return 'size'; // o teto vale também para um arquivo só (as partes o conferem página a página)
    const data = exportFromRecords(this.all(now), now);
    const gz = await gzipJson(data);
    const paused = await reserveCopy(this.env.DB, gz.byteLength, now, caps);
    if (paused !== null) {
      this.setCopies({ ...this.copies(), gz: gz.byteLength });
      return paused;
    }
    try {
      await this.env.SNAPSHOTS.put(snapshotKey(userId, name), gz, { customMetadata: { ...meta, solves: String(activeSolves(data)) } });
    } catch (error) {
      // O put que falha devolve o espaço reservado na hora (a recontagem do Cron só o acharia no dia seguinte), e o erro segue para quem
      // chamou (o alarme o pega). A operação A fica contada, como nas partes: a mais, nunca a menos.
      await releaseStorage(this.env.DB, gz.byteLength).catch(() => undefined); // o erro que importa é o do put
      throw error;
    }
    return { gz: gz.byteLength, parts: 0 };
  }

  // Um teto do número de registros da conta, lido numa linha (RECORDS_BOUND, o maior rowid), contado no orçamento de leituras.
  private recordsBound(now: number): number {
    this.countReads(1, now);
    return this.sql.exec<{ n: number }>(RECORDS_BOUND).one().n;
  }

  // A cópia em partes (spec das cópias grandes, seção 4). A conta é lida por páginas de COPY_PART_RECORDS registros na ordem da chave
  // (PAGE_AFTER), cada uma vira uma parte (snap/<conta>/<nome>/001.json.gz, ...: os registros que a cópia leva, as listas de CopyPart), e a
  // memória fica em torno de uma página. As páginas particionam as chaves: a primeira começa depois de ('', ''), e cada uma depois da última
  // linha do SQL da anterior, mesmo a que a cópia não leva (marca compactada, treino apagado); `last` do manifesto é essa chave, e
  // `records`, as linhas da página, para a faixa de cada parte (sliceOf) ser a página dela na restauração. Os ajustes (`prefs`) ficam fora
  // das páginas e vão no perfil do manifesto. Uma cópia é o manifesto mais todas as partes, ou nada (o manifesto, gravado por último, é o
  // que a lista mostra, e o que faltar não aparece).
  //
  // As operações A de todas as partes e do manifesto saem antes de gravar, numa reserva só (a revisão final, I3: cada ida ao D1 é tempo de
  // relógio dentro de blockConcurrencyWhile, que tem 30 s), pelo teto do tamanho da conta (`bound`, recordsBound) e pelo teto da cópia, o
  // menor dos dois: N partes no máximo, mais o manifesto. Sem elas, nada é gravado ('ops'). O espaço continua reservado parte a parte, antes de cada put, e o do manifesto também. Uma
  // recusa no meio, ou um erro do R2 (ou do SQLite), apaga as partes já gravadas (apagar no R2 não custa operação), devolve o espaço delas
  // uma vez só (discard pode rodar de novo no catch) e segue; as operações já reservadas ficam contadas (a mais, nunca a menos). Uma parte
  // além das N (o teto nunca fica abaixo da conta, mas a regra não depende disso) reserva a operação dela antes. As páginas conferem o teto
  // da cópia (SNAPSHOT_MAX_RECORDS, a revisão final, I5 a: a conta não é contada até ele antes): a página que passa dele, ou uma parte
  // depois de MAX_PARTS, é 'size', com as partes já gravadas apagadas e o espaço delas devolvido.
  private async writeParts(
    userId: string,
    name: string,
    meta: { kind: 'daily' | 'pre-restore'; day: string },
    now: number,
    caps: Caps,
    bound: number,
  ): Promise<{ gz: number; parts: number } | CopiesPaused> {
    const bucket = this.env.SNAPSHOTS;
    const keys: string[] = [];
    let bytes = 0; // o espaço reservado até aqui, as partes gravadas
    let released = false;
    const discard = async (): Promise<void> => {
      if (keys.length > 0) await bucket.delete(keys);
      if (released) return;
      released = true;
      await releaseStorage(this.env.DB, bytes);
    };
    const refuse = async (why: CopiesPaused, pending: number): Promise<CopiesPaused> => {
      await discard();
      this.setCopies({ ...this.copies(), gz: Math.max(this.copies().gz ?? 0, bytes + pending) });
      return why;
    };
    const ops = Math.min(MAX_PARTS, Math.max(1, Math.min(Math.ceil(bound / COPY_PART_RECORDS), Math.ceil(caps.snapshotRecords / COPY_PART_RECORDS))));
    if (!(await takeOps(this.env.DB, 'A', ops + 1, now, caps.classAMonth))) return refuse('ops', 0);
    try {
      const parts: CopyManifest['parts'] = [];
      let solves = 0;
      let paged = 0;
      let after: CopyKey = ['', ''];
      for (;;) {
        const rows = this.sql.exec<Row>(PAGE_AFTER, after[0], after[1], COPY_PART_RECORDS).toArray();
        this.countReads(rows.length, now);
        if (rows.length === 0) break;
        paged += rows.length;
        if (parts.length === MAX_PARTS || paged > caps.snapshotRecords) return await refuse('size', 0);
        const end = rows[rows.length - 1];
        after = [end.store, end.id];
        const data = exportFromRecords(rows.map(rowToChange), now);
        const part: CopyPart = { sessions: data.sessions, solves: data.solves, practice: data.practice ?? [], duels: data.duels ?? [] };
        const gz = await gzipJson(part);
        if (parts.length >= ops && !(await takeOps(this.env.DB, 'A', 1, now, caps.classAMonth))) return await refuse('ops', gz.byteLength);
        if (!(await reserveStorage(this.env.DB, gz.byteLength, now, caps.snapshotBytes))) return await refuse('space', gz.byteLength);
        const key = partKey(userId, name, parts.length + 1);
        keys.push(key);
        bytes += gz.byteLength; // reservado: se o put falhar, o catch o devolve
        await bucket.put(key, gz);
        solves += part.solves.filter((s) => s.deletedAt === null).length;
        parts.push({ last: after, records: rows.length });
        if (rows.length < COPY_PART_RECORDS) break; // a última página: não pergunta de novo ao SQLite
      }
      const prefs = this.sql.exec<Row>(PREFS_ROWS).toArray();
      this.countReads(prefs.length, now);
      const manifest: CopyManifest = { format: 'klick-parts', version: 1, exportedAt: now, day: meta.day, profile: exportFromRecords(prefs.map(rowToChange), now).profile, solves, parts };
      const gz = await gzipJson(manifest);
      if (!(await reserveStorage(this.env.DB, gz.byteLength, now, caps.snapshotBytes))) return await refuse('space', gz.byteLength);
      bytes += gz.byteLength;
      await bucket.put(snapshotKey(userId, name), gz, { customMetadata: { ...meta, solves: String(solves), parts: String(parts.length) } });
      return { gz: bytes, parts: parts.length };
    } catch (error) {
      await discard().catch(() => undefined); // o erro que importa é o primeiro
      throw error;
    }
  }

  // A cópia do dia não saiu: a pausa fica no estado, com o motivo (e o tamanho dela, quando chegou a ser comprimida), e vai no log.
  private pauseCopies(userId: string, why: CopiesPaused, gz?: number): false {
    const copies = this.copies();
    this.setCopies({ ...copies, paused: why, gz: gz ?? copies.gz });
    console.log(JSON.stringify({ evt: 'copy-paused', user: userId, why }));
    return false;
  }

  // GET /api/snapshots (spec 8.3 e decisão 1): a lista guardada, enquanto vale (COPIES_CACHE_MS); senão o R2, com cada página reservada
  // antes como operação A, e a lista nova fica guardada. Sem operações A no mês: a guardada, mesmo velha, com a pausa 'ops' (é por isso que
  // ela não se renova), ou 'r2-budget' se não há nenhuma. Uma conta que nunca sincronizou não tem cópias, e não pergunta ao R2.
  async listCopies(now: number): Promise<CloudCopies | 'r2-budget' | 'deleted'> {
    return this.exclusive(async (): Promise<CloudCopies | 'r2-budget' | 'deleted'> => {
      if (this.deleted()) return 'deleted';
      const copies = this.copies();
      if (copies.list !== null && now - copies.at < COPIES_CACHE_MS) return { copies: copies.list, paused: copies.paused };
      const userId = this.getState('userId');
      if (userId === null) return { copies: [], paused: copies.paused };
      const cap = capsOf(this.env).classAMonth;
      const bucket = this.env.SNAPSHOTS;
      const metered: Pick<R2Bucket, 'list'> = {
        list: async (options) => {
          if (!(await takeOps(this.env.DB, 'A', 1, now, cap))) throw OUT_OF_OPS;
          return bucket.list(options);
        },
      };
      try {
        const { copies: list } = await listCopiesIn(metered, userId);
        this.setCopies({ ...copies, at: now, list });
        return { copies: list, paused: copies.paused };
      } catch (error) {
        if (error !== OUT_OF_OPS) throw error;
        return copies.list === null ? 'r2-budget' : { copies: copies.list, paused: copies.paused ?? 'ops' };
      }
    });
  }

  // POST /api/snapshots/:name/restore (spec 8.3 e spec das cópias grandes, seções 3 e 5): grava só o que muda entre a conta e a cópia
  // (diffSlice: o registro da cópia que difere do de agora volta com datas novas, e o que existe hoje e não está nela vai para a lixeira;
  // o que é igual nos dois lados fica), com a cópia "antes de restaurar" guardada antes. A temporada passa por mergeSeason, como num sync:
  // o progresso não volta atrás. Tudo sem um sync no meio: o que a cópia de antes guarda é o que a restauração substitui. Os aparelhos
  // recebem pelo sync normal. As gravações entram nos contadores como as de um sync (commit), sem a cota nem o teto de bytes: a cópia volta
  // inteira ou não volta.
  //
  // A comparação vai faixa a faixa, com a memória em torno de uma parte: a cópia em partes (o manifesto) compara cada parte com a faixa de
  // chaves dela (sliceOf), na ordem, e o arquivo só, com uma faixa que cobre tudo. Os registros de agora de cada faixa vêm por páginas
  // (currentOf) que a comparação consome aos poucos, cada um lido uma vez; os ajustes, uma vez, à parte (PREFS_ROWS). Ela para assim que as
  // mudanças passam do limite (o menor de RESTORE_MAX_RECORDS e do dia útil, recordsPerDay, como no corte do sync), e a data da restauração
  // fica acima de tudo o que ela viu (o `floor` das faixas e os ajustes de agora).
  //
  // Dentro do grátis (decisões 1, 2, 3 e 6, Task 12, a revisão final e as cópias grandes), nesta ordem, e uma recusa não grava nada na conta
  // (só a tentativa, abaixo, conta): a conta apagada; as restaurações do dia UTC (RESTORES_PER_DAY), as tentativas do dia que chegaram ao R2
  // (RESTORE_ATTEMPTS_PER_DAY) e as leituras do dia da conta (DAILY_READ_BUDGET), restore-limit; um nome fora da lista guardada ainda
  // válida (not-found, sem perguntar ao R2: toda cópia passa por este objeto e renova a lista, então a lista válida tem tudo o que existe);
  // RESTORE_MAX_RECORDS torta (0, a falha fechada: too-big, sem o R2); com o tamanho da última cópia da conta, o espaço e a operação A da
  // cópia de antes (copyRoom: no-room, r2-budget; sem a estimativa, só a reserva de depois confere). O tamanho da conta e as linhas de hoje
  // não se conferem antes: decidem as mudanças, que só se sabem lendo a cópia. Depois: as duas leituras do R2, ler a cópia e conferir a de
  // antes (operações B, r2-budget), e a tentativa conta no dia; a cópia (not-found; a lista só se renova quando o nome estava nela, ou quando
  // ela já não valia); num manifesto, uma operação B por parte (r2-budget), e a parte que falta ou vem torta é not-found (a lista se
  // renova). As mudanças, as das faixas e as dos ajustes, contra o limite (too-big); nenhuma mudança é 'ok', sem a cópia de antes e sem
  // reservar linhas (a restauração conta no dia, e o piso dela, restoreFloor, sobe: a única gravação, no estado); as linhas delas (rowsOf)
  // contra o que sobra hoje, na conta e no teto do ambiente (write-budget: dayRoom, que só lê o D1); a cópia de antes (writeCopy, um arquivo
  // ou as partes: no-room, r2-budget; nunca se restaura sem ela, decisão 3), que não sai quando a última cópia do dia já é a conta de agora
  // (snapshotRev igual à revisão: ela guarda o estado de antes; I6 a); por fim, com ela guardada, a reserva das linhas no teto do ambiente
  // (write-budget: reserveDay, a autoridade). Sem o
  // atalho da lista, alternar "restaurar um nome que não existe" com "abrir a lista" gastaria uma operação A por par.
  //
  // A resposta pelo aparelho (`device`: o app que sabe restaurar no aparelho diz que sabe; o de antes manda {} e nunca a recebe): onde o
  // app de antes ouve too-big ou write-budget pelas mudanças (o limite, o que sobra hoje, a reserva), este ouve { parts }, as partes da
  // cópia (0 num arquivo só), e baixa a cópia pelo Worker (copyPart). Nada é gravado na conta nem reservado, e a restauração conta no dia,
  // como uma que deu certo. Só na recusa da reserva a cópia de antes já está no R2, e fica, como a de um clique duplo. Um D1 que falha (na
  // conferência das linhas ou na reserva) é write-budget também para este (a revisão final, M2). As leituras de hoje sem lugar para a
  // comparação (I5 b) e a segunda cópia de antes em partes do dia (I6 b) dão a mesma resposta, e restore-limit ao de antes.
  async restoreSnapshot(name: string, now: number, device = false): Promise<'ok' | { parts: number } | 'not-found' | 'deleted' | RestoreRefusal> {
    type Outcome = 'ok' | { parts: number } | 'not-found' | 'deleted' | RestoreRefusal;
    const outcome = await this.exclusive(async (): Promise<Outcome> => {
      if (this.deleted()) return 'deleted';
      const restores = this.dayCount('restores', now);
      const attempts = this.dayCount('attempts', now);
      if (restores.n >= RESTORES_PER_DAY || attempts.n >= RESTORE_ATTEMPTS_PER_DAY) return 'restore-limit';
      if (this.readsOf(now).n >= DAILY_READ_BUDGET) return 'restore-limit'; // as leituras do dia da conta acabaram: nem a comparação
      const userId = this.getState('userId');
      if (userId === null) return 'not-found'; // nunca sincronizou: nenhuma cópia, e nada a perguntar ao R2
      const { list, at, gz: estimate } = this.copies();
      if (list !== null && now - at < COPIES_CACHE_MS && !list.some((c) => c.name === name)) return 'not-found';
      const caps = capsOf(this.env);
      if (caps.restoreRecords === 0) return 'too-big';
      const short = estimate === null ? null : await copyRoom(this.env.DB, estimate, now, caps);
      if (short !== null) return short === 'space' ? 'no-room' : 'r2-budget';
      if (!(await takeOps(this.env.DB, 'B', 2, now, caps.classBMonth))) return 'r2-budget';
      this.setState('attempts', JSON.stringify({ day: attempts.day, n: attempts.n + 1 }));
      const object = await this.env.SNAPSHOTS.get(snapshotKey(userId, name));
      const top: unknown = object ? await gunzipJson(await object.arrayBuffer()) : null;
      const manifest = isManifest(top) ? top : null;
      const file = manifest === null ? fileCopy(top) : null;
      if (manifest === null && file === null) {
        this.renewCopies();
        return 'not-found';
      }
      const counted = (): void => this.setState('restores', JSON.stringify({ day: restores.day, n: restores.n + 1 }));
      const onDevice = (): { parts: number } => {
        counted();
        return { parts: manifest === null ? 0 : manifest.parts.length };
      };
      // A comparação e a cópia de antes leem a conta cada uma (a revisão final, I5 b): com as leituras de hoje, a estimativa delas (2 × os
      // registros da cópia, mais RESTORE_READS_EXTRA) tem de caber no orçamento do dia, senão a restauração nem compara.
      const copied = manifest !== null ? manifest.parts.reduce((sum, p) => sum + p.records, 0) : copyRecords(file!);
      if (this.readsOf(now).n + 2 * copied + RESTORE_READS_EXTRA > DAILY_READ_BUDGET) return device ? onDevice() : 'restore-limit';
      // Acima do teto da cópia (o teto da conta, uma linha), a cópia de antes seria 'size': a restauração no servidor não acontece, e nem
      // compara (o app de antes ouve no-room, como na cópia de antes recusada; o novo restaura no aparelho, com a cópia local de antes).
      if (this.recordsBound(now) > caps.snapshotRecords) return device ? onDevice() : 'no-room';
      if (manifest !== null && !(await takeOps(this.env.DB, 'B', manifest.parts.length, now, caps.classBMonth))) return 'r2-budget';
      const limit = Math.min(caps.restoreRecords, recordsPerDay(caps.rowsDay));
      const steps: RestoreStep[] = [];
      const seen = { n: 0 }; // os registros de agora que a comparação leu (sem os ajustes): na de 'ok', a conta inteira
      let floor = 0;
      const slices = manifest === null ? 1 : manifest.parts.length;
      for (let i = 0; i < slices && steps.length <= limit; i++) {
        let copy: RestoreCopy | null = file;
        let range: { lo: CopyKey | null; hi: CopyKey | null } = { lo: null, hi: null };
        if (manifest !== null) {
          range = sliceOf(manifest, i);
          copy = await this.readPart(userId, name, i + 1);
        }
        if (copy === null) {
          this.renewCopies();
          return 'not-found';
        }
        const diff = diffSlice(this.currentOf(range.lo, range.hi, now, seen), copy, limit - steps.length);
        for (const step of diff.steps) steps.push(step);
        floor = Math.max(floor, diff.floor);
      }
      if (steps.length > limit) return device ? onDevice() : 'too-big';
      const prefs = this.sql.exec<Row>(PREFS_ROWS).toArray().map(rowToChange);
      this.countReads(prefs.length, now);
      const stamp = prefs.reduce((max, c) => Math.max(max, c.updatedAt + 1, c.deletionStamp + 1), Math.max(now, floor)); // vence tudo o que existe
      const profile = manifest !== null ? manifest.profile : (file?.profile ?? null);
      const changes = [...stampSteps(steps, stamp), ...prefsRestoreChanges(prefs, accountPrefsOf(profile, prefs), stamp)];
      if (changes.length > limit) return device ? onDevice() : 'too-big';
      if (changes.length === 0) {
        counted(); // a cópia já é a conta: nada a gravar, nem a cópia de antes
        this.raiseFloor(stamp); // mas o que espera nas filas, de antes dela, perde como numa restauração que gravou
        return 'ok';
      }
      // Sem linhas hoje, a resposta do aparelho (o app novo) ou write-budget; um D1 que falha (na conferência ou na reserva, abaixo) é
      // write-budget nos dois (a revisão final, M2): não é a conta que não cabe, e o aparelho não deve regravar a conta por uma falha da rede.
      const unfit = (why: Reserved): Outcome => (why === 'full' && device ? onDevice() : 'write-budget');
      const rows = rowsOf(changes.length);
      const room = rows > DAILY_WRITE_BUDGET - this.dayCount('writes', now).n ? 'full' : await this.dayRoom(rows, now, 'restore');
      if (room !== 'ok') return unfit(room);
      // A cópia de antes (a revisão final, I6: elas ocupam o espaço que todas as contas dividem). Quando a última cópia do dia já é a conta
      // de agora (snapshotRev igual à revisão), ela guarda o estado de antes, e não sai outra (vai para o log). Uma segunda restauração no
      // mesmo segundo (o clique duplo) acha a cópia de antes da primeira, que já guarda o estado de antes: ela fica como está, e não precisa
      // de espaço nem de operação A. Uma conta grande (a cópia sai em partes: a comparação leu a conta inteira, e com os ajustes ela passa de
      // COPY_PART_RECORDS) grava no máximo uma cópia de antes em partes por dia UTC (bigPreRestore): a seguinte, a resposta do aparelho ou
      // restore-limit, antes de gravar qualquer coisa.
      const before = preRestoreName(now);
      if (this.getState('snapshotRev') === (this.getState('rev') ?? '0')) {
        console.log(JSON.stringify({ evt: 'pre-restore-skipped', user: userId }));
      } else if ((await this.env.SNAPSHOTS.head(snapshotKey(userId, before))) === null) {
        const today = utcDay(now);
        const big = seen.n + prefs.length > COPY_PART_RECORDS;
        if (big && this.getState('bigPreRestore') === today) return device ? onDevice() : 'restore-limit';
        const done = await this.writeCopy(userId, before, { kind: 'pre-restore', day: dayOf(now) }, now, caps);
        if (typeof done === 'string') return done === 'ops' ? 'r2-budget' : 'no-room'; // 'size' (passou do teto da cópia) também não cabe
        this.setCopies({ ...this.copies(), at: 0, gz: done.gz });
        if (done.parts > 0) this.setState('bigPreRestore', today);
      }
      // A reserva das linhas vem por último, com a cópia de antes já guardada (que não custa linhas): a cópia recusada, ou um R2 que falha
      // nela, não gasta o dia do ambiente. Recusada aqui, nada é gravado, e a cópia de antes fica no R2, como a de um clique duplo.
      const reserved = await this.reserveDay(rows, now, 'restore');
      if (reserved !== 'ok') return unfit(reserved);
      const wrote = this.ctx.storage.transactionSync(() => {
        const usage = this.usage(now);
        const batch = this.batch();
        const wrote = this.commit(applyChanges(batch.view, changes, { mode: 'server' }), batch, usage);
        this.countReads(batch.rows(), now);
        counted();
        this.raiseFloor(stamp);
        return wrote;
      });
      await this.settleRows(rows, wrote, now);
      return 'ok';
    });
    this.saveReads(now);
    return outcome;
  }

  // O piso da restauração (a revisão final das cópias grandes, I1): a data da última restauração no servidor, que só sobe. O sync o passa a
  // applyChanges: a mudança de antes dele (as duas datas abaixo), de um registro que a conta tem, perde, e a versão da conta volta com as
  // datas no piso (apply.ts). A restauração por diferenças deixa como está o que a cópia já tem; sem o piso, uma edição offline ou a fila de
  // uma restauração pelo aparelho, mais velhas que ela, venceriam esses registros.
  private raiseFloor(stamp: number): void {
    const floor = Number(this.getState('restoreFloor') ?? '0');
    if (stamp > floor) this.setState('restoreFloor', String(stamp));
  }

  // Os registros de agora da faixa de chaves (lo, hi] de uma restauração, sem os ajustes, em páginas de SLICE_PAGE na ordem da chave (lo
  // null: desde o começo; hi null: até o fim, as chaves que chegaram depois da cópia inclusive), cada página contada no orçamento de
  // leituras. Um gerador: a comparação o consome aos poucos, e quando ela para no meio, as páginas de depois não são lidas.
  private *currentOf(lo: CopyKey | null, hi: CopyKey | null, now: number, seen: { n: number }): Generator<Change> {
    let after: CopyKey = lo ?? ['', ''];
    for (;;) {
      const rows =
        hi === null
          ? this.sql.exec<Row>(PAGE_AFTER, after[0], after[1], SLICE_PAGE).toArray()
          : this.sql.exec<Row>(RANGE_AFTER, after[0], after[1], hi[0], hi[1], SLICE_PAGE).toArray();
      this.countReads(rows.length, now);
      seen.n += rows.length;
      for (const row of rows) yield rowToChange(row);
      if (rows.length < SLICE_PAGE) return;
      const end = rows[rows.length - 1];
      after = [end.store, end.id];
    }
  }

  // A parte `i` (de 1) da cópia em partes `name`, ou null quando ela falta no R2 (a regra de 30 dias, uma cópia pela metade) ou não tem a
  // forma de uma parte: a restauração não segue sem ela.
  private async readPart(userId: string, name: string, i: number): Promise<CopyPart | null> {
    const object = await this.env.SNAPSHOTS.get(partKey(userId, name, i));
    if (!object) return null;
    let data: unknown;
    try {
      data = await gunzipJson(await object.arrayBuffer());
    } catch {
      return null;
    }
    return isCopyPart(data) ? data : null;
  }

  // GET /api/snapshots/:name/parts/:index (spec das cópias grandes, seção 5): o aparelho baixa a cópia que restaura nele, um objeto por
  // pedido, como está no R2 (o gzip). `index` 0 é o objeto da cópia (o arquivo só ou o manifesto), e 1 a N, as partes; um índice além delas
  // não está no R2 (not-found). Cada leitura conta no dia UTC (`partReads`, até COPY_PART_READS_PER_DAY: restore-limit) e reserva antes a
  // operação B dela (r2-budget), as duas antes de ir ao R2: quem lê o que não existe também gasta. Uma conta apagada recusa (deleted), e
  // uma que nunca sincronizou não tem cópias, nem pergunta ao R2.
  async copyPart(name: string, index: number, now: number): Promise<ArrayBuffer | 'not-found' | 'deleted' | 'restore-limit' | 'r2-budget'> {
    return this.exclusive(async (): Promise<ArrayBuffer | 'not-found' | 'deleted' | 'restore-limit' | 'r2-budget'> => {
      if (this.deleted()) return 'deleted';
      const userId = this.getState('userId');
      if (userId === null || !Number.isInteger(index) || index < 0 || index > MAX_PARTS) return 'not-found';
      const reads = this.dayCount('partReads', now);
      if (reads.n >= COPY_PART_READS_PER_DAY) return 'restore-limit';
      if (!(await takeOps(this.env.DB, 'B', 1, now, capsOf(this.env).classBMonth))) return 'r2-budget';
      this.setState('partReads', JSON.stringify({ day: reads.day, n: reads.n + 1 }));
      const object = await this.env.SNAPSHOTS.get(index === 0 ? snapshotKey(userId, name) : partKey(userId, name, index));
      return object ? object.arrayBuffer() : 'not-found';
    });
  }

  // Apagar a conta (spec 7.7): o banco inteiro do objeto e o alarme somem na hora, e fica só a marca de apagada. Depois de uma cópia ou de
  // uma restauração em andamento, nunca no meio delas. Apagar de novo (um pedido que falhou no meio) dá no mesmo. Não passa pelo teto de
  // linhas do ambiente (reserveDay): nada impede apagar uma conta, e o deleteAll grava pouco (14 linhas numa conta de 4.006 registros, na
  // sonda do portão 8 do README).
  async wipe(): Promise<void> {
    await this.exclusive(async () => {
      await this.ctx.storage.deleteAll();
      this.migrate();
      this.setState('deleted', '1');
    });
  }
}
