// O Durable Object de uma conta (spec 8.2): um SQLite com os registros da conta, cada um com a revisão em que mudou. Um pedido por vez: o
// sync roda inteiro numa transação síncrona, sem espera no meio, então as revisões saem em ordem sem lock extra. As regras são as mesmas do
// app (src/core/sync). O SQL dos registros mora em records-sql.ts.
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type ApplyResult, type RecordView } from '../src/core/sync/apply';
import { isCounted, QUOTA_REASON, TOMBSTONE_KEEP_MS, zeroCounts, type ActiveCounts, type CountedStore } from '../src/core/sync/limits';
import { sessionOfChange } from '../src/core/sync/records';
import { restoreChanges } from '../src/core/sync/restore';
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
import type { KlickExport } from '../src/core/types';
import { reserveCopy, takeOps } from './budget';
import type { Env } from './env';
import {
  ACCOUNT_BYTES_CAP,
  capsOf,
  COMPACT_PER_DAY,
  COPIES_CACHE_MS,
  DAILY_WRITE_BUDGET,
  MAX_WRITES_PER_REQUEST,
  nextUtcDay,
  PULL_PAGE,
  PULL_PAGE_WITH_PUSH,
  REQUEST_ROWS,
  RESTORES_PER_DAY,
  rowsOf,
  ROWS_PER_COMPACT,
  ROWS_PER_WRITE,
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
  RECORDS_SCHEMA,
  rowToChange,
  STORED_BYTES,
  UPSERT_RECORD,
  utf8Bytes,
  type Row,
} from './records-sql';
import { dayOf, gunzipJson, gzipJson, listCopiesIn, nextSnapshotAt, preRestoreName, snapshotKey } from './snapshots';

const activeSolves = (data: KlickExport): number => data.solves.filter((s) => s.deletedAt === null).length;

// As cópias na nuvem da conta, no estado (`copies`, endurecimento 4.2 e decisão 1): a lista guardada (`list`, de quando `at`; null, nenhuma
// ainda) e a pausa da cópia do dia (`paused`: o espaço ou as operações do R2 acabaram; null, as cópias seguem), que todo sync leva. A lista
// vale por COPIES_CACHE_MS; uma cópia gravada e uma que sumiu (a restauração achou 404) a renovam (`at` 0: a próxima lista o R2 de novo).
interface Copies {
  at: number;
  list: CloudCopy[] | null;
  paused: CopiesPaused | null;
}

// Uma contagem por dia UTC no estado (`writes`, as linhas gravadas, rowsOf; `restores`, as restaurações que deram certo).
interface DayCount {
  day: string;
  n: number;
}

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
// ou recusadas; as outras voltam em `deferred`) e se o corte foi o do pedido (MAX_WRITES_PER_REQUEST: o resto vai já) ou o do orçamento
// (o resto vai na virada do dia).
interface Cut {
  read: unknown[];
  refused: Rejected[];
  taken: number;
  now: boolean;
}

// Os registros que um lote lê (um sync, uma restauração), cada um uma vez: applyChanges os lê pela vista, e o teto de bytes e write() pegam
// o tamanho do conteúdo gravado de cada um sem ler de novo. `json` é o texto de um `data`, guardado: o teto o mede e write() o grava.
interface Batch {
  view: RecordView;
  storedBytes(store: SyncStore, id: string): number;
  json(data: unknown): string;
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
    const load = (store: string, id: string): Row | null => {
      const key = syncKey(store, id);
      let row = rows.get(key);
      if (row === undefined) {
        row = this.sql.exec<Row>('SELECT * FROM records WHERE store = ? AND id = ?', store, id).toArray()[0] ?? null;
        rows.set(key, row);
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
        solvesOf: (sessionId) =>
          this.sql
            .exec<Row>("SELECT * FROM records WHERE store = 'solves' AND parent = ?", sessionId)
            .toArray()
            .map((row) => {
              const key = syncKey('solves', row.id);
              if (!rows.has(key)) rows.set(key, row);
              return rowToChange(row);
            }),
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
    };
  }

  // Os contadores (Usage), lidos do estado. Uma conta de antes deles (as do beta) os ganha da contagem do banco, uma vez, antes de o lote
  // gravar qualquer coisa. As gravações contam no dia UTC de `now`: num dia novo, o orçamento volta inteiro. O dia nunca volta atrás: um
  // pedido com a hora de um dia que já passou (o relógio de outro Worker, atrasado), atendido depois de um do dia seguinte, conta no dia mais
  // novo que o objeto já viu, sem zerar o que foi gravado nele.
  private usage(now: number): Usage {
    let active = this.getState('active');
    if (active === null) {
      const counts = zeroCounts();
      for (const r of this.sql.exec<{ store: string; n: number }>(COUNT_ACTIVE)) {
        if (isCounted(r.store as SyncStore)) counts[r.store as CountedStore] = r.n;
      }
      active = JSON.stringify(counts);
      this.setState('active', active);
    }
    let bytes = this.getState('bytes');
    if (bytes === null) {
      bytes = String(this.sql.exec<{ n: number }>(STORED_BYTES).one().n);
      this.setState('bytes', bytes);
    }
    const writes = this.dayCount('writes', now);
    return { active: JSON.parse(active) as ActiveCounts, bytes: Number(bytes), day: writes.day, writes: writes.n };
  }

  // A contagem do dia UTC de `now` (num dia novo, 0), sem gravar nada. O dia nunca volta atrás (usage, acima).
  private dayCount(key: 'writes' | 'restores', now: number): DayCount {
    const stored = JSON.parse(this.getState(key) ?? 'null') as DayCount | null;
    const today = utcDay(now);
    const day = stored !== null && stored.day > today ? stored.day : today;
    return { day, n: stored?.day === day ? stored.n : 0 };
  }

  private copies(): Copies {
    return (JSON.parse(this.getState('copies') ?? 'null') as Copies | null) ?? { at: 0, list: null, paused: null };
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
  // (a cascata e a versão vencedora que volta para quem mandou a velha, inclusive) conta no orçamento do dia, em linhas (rowsOf).
  private commit(result: Pick<ApplyResult, 'writes' | 'activeDelta'>, batch: Batch, usage: Usage): void {
    const grew = this.write(result.writes, batch);
    this.addUsage(usage, { active: result.activeDelta, bytes: grew, writes: rowsOf(result.writes.length) });
  }

  private all(): Change[] {
    return this.sql.exec<Row>('SELECT * FROM records').toArray().map(rowToChange);
  }

  // O tamanho da conta em registros (COUNT_RECORDS), o que a cópia do dia e a restauração conferem antes de ler tudo.
  private recordCount(): number {
    return this.sql.exec<{ n: number }>(COUNT_RECORDS).one().n;
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
  // os solves ativos dela (a cascata, em applyChanges), contados antes pelo índice (ACTIVE_CHILDREN, até o bastante para saber que não
  // cabem num dia): a que não cabe no que sobra hoje fica para amanhã, com o resto do lote; a que não caberia nem num dia inteiro volta com
  // o motivo da cota (o aparelho a guarda, "só neste aparelho"), sem gravar nada dela, e o resto do lote segue. Assim nenhum pedido grava
  // mais que o dia de uma conta. Apagar os solves antes passa pelo orçamento como sempre; a cascata em partes, pelo servidor, fica para uma
  // spec própria.
  private cut(changes: readonly unknown[], room: number): Cut {
    const read: unknown[] = [];
    const refused: Rejected[] = [];
    const most = Math.floor(DAILY_WRITE_BUDGET / ROWS_PER_WRITE); // contar até aqui basta: com tantos solves, a cascata já não cabe num dia
    let writes = 0; // registros que o que foi lido grava, a cascata inclusive
    let taken = 0;
    for (const raw of changes) {
      if (taken === MAX_WRITES_PER_REQUEST) return { read, refused, taken, now: true };
      const sid = this.deletedSession(raw);
      const n = 1 + (sid === null ? 0 : this.sql.exec<{ n: number }>(ACTIVE_CHILDREN, sid, most).one().n);
      if (sid !== null && rowsOf(n) > DAILY_WRITE_BUDGET) refused.push({ store: 'sessions', id: sid, reason: QUOTA_REASON });
      else if (rowsOf(writes + n) > room) break;
      else {
        writes += n;
        read.push(raw);
      }
      taken++;
    }
    return { read, refused, taken, now: false };
  }

  // A marca que wipe deixa: o objeto de uma conta apagada recusa o sync, a restauração e a cópia, e não marca alarme. Sem ela, um sync com a
  // sessão ainda aberta (antes de as linhas do D1 sumirem) traria a conta de volta, guardada para sempre e sem dono para apagá-la.
  private deleted(): boolean {
    return this.getState('deleted') !== null;
  }

  // O que espera o R2 (a cópia do dia, a restauração) e o apagar rodam sem nenhum outro pedido no meio: blockConcurrencyWhile segura os
  // pedidos que chegam até o fim. O erro sai daqui de fora: lançado lá dentro, ele reiniciaria o objeto.
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
  // primeiras mudanças que cabem no que sobra de DAILY_WRITE_BUDGET hoje, até MAX_WRITES_PER_REQUEST, são lidas; as outras não são gravadas e
  // voltam em `deferred` (as últimas N do lote), com `retryAt`: a meia-noite UTC do fim do dia do orçamento, quando ele volta, ou a hora do
  // pedido, quando foi o corte do pedido (o app manda o resto em seguida). A exclusão de uma sessão cuja cascata não caberia num dia volta
  // em `rejected`, com o motivo da cota. O recebimento segue igual, com ou sem orçamento. Toda resposta leva `copiesPaused`, a pausa das
  // cópias na nuvem (null quando elas seguem).
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse | 'deleted'> {
    const response = this.ctx.storage.transactionSync((): SyncResponse | 'deleted' => {
      if (this.deleted()) return 'deleted';
      if (this.getState('userId') === null) this.setState('userId', userId);
      const from = req.cursor > Number(this.getState('rev') ?? '0') ? 0 : req.cursor;
      const usage = this.usage(now);
      const cut = this.cut(req.changes, DAILY_WRITE_BUDGET - usage.writes);
      const batch = this.batch();
      const result = applyChanges(batch.view, cut.read, { mode: 'server', quota: { active: usage.active }, admit: bytesCap(batch, usage.bytes) });
      this.commit(result, batch, usage);
      this.sql.exec(
        'INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
        req.deviceId, now,
      );
      const size = req.changes.length > 0 ? PULL_PAGE_WITH_PUSH : PULL_PAGE;
      const rows = this.sql.exec<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', from, size + 1).toArray();
      const page = rows.slice(0, size);
      const deferred = req.changes.length - cut.taken;
      return {
        accepted: cut.read.length - result.rejected.length,
        rejected: [...result.rejected, ...cut.refused],
        changes: page.map(rowToChange),
        cursor: page.length > 0 ? page[page.length - 1].rev : from,
        more: rows.length > size,
        serverTime: now,
        ...(deferred > 0 ? { deferred, retryAt: cut.now ? now : nextUtcDay(Date.parse(usage.day)) } : {}),
        copiesPaused: this.copies().paused,
      };
    });
    if (response === 'deleted') return response;
    // A cópia diária: o primeiro sync marca o alarme. Pela hora de verdade, não pela do pedido: um alarme no passado dispararia na hora.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextSnapshotAt(Date.now()));
    return response;
  }

  // Uma vez por dia (spec 8.3): a compactação e depois a cópia do dia, só se a conta mudou desde a última. Uma conta apagada (ou sem dono)
  // não marca o próximo. A limpeza dos pedidos de código e dos códigos vencidos (spec 10) é do Cron Trigger do Worker (worker/index.ts): ela
  // não pode depender de uma conta viva nem da cópia no R2 dar certo.
  async alarm(): Promise<void> {
    await this.exclusive(async () => {
      if (this.deleted() || this.getState('userId') === null) return;
      const now = Date.now();
      this.compact(now);
      await this.takeSnapshot(now);
      await this.ctx.storage.setAlarm(nextSnapshotAt(now));
    });
  }

  // A marca compactada (endurecimento, decisão 5): dos solves apagados há mais de TOMBSTONE_KEEP_MS fica só a marca (data '{}'), no máximo
  // COMPACT_PER_DAY por dia e dentro das linhas que sobram do orçamento do dia, onde contam (rowsOf). A data é a exclusão gravada, que vem do
  // aparelho: o mesmo prazo em que ele tira o solve da lixeira. Sem revisão nova: quem já viu o solve não recebe nada, e quem ainda não
  // chegou à revisão dele recebe a marca (que um aparelho sem o solve não grava). `parent` fica. Um aparelho que ainda tem o conteúdo e o
  // manda de novo grava uma revisão nova, como qualquer mudança, e a compactação de outro dia o tira de novo.
  private compact(now: number): number {
    return this.ctx.storage.transactionSync(() => {
      const usage = this.usage(now);
      const fit = Math.floor((DAILY_WRITE_BUDGET - usage.writes - REQUEST_ROWS) / ROWS_PER_COMPACT); // rowsOf(0, fit) cabe no que sobra
      const limit = Math.min(COMPACT_PER_DAY, Math.max(0, fit));
      if (limit === 0) return 0;
      const due = this.sql.exec<{ id: string; bytes: number }>(COMPACTABLE, now - TOMBSTONE_KEEP_MS, limit).toArray();
      let freed = 0;
      for (const r of due) {
        this.sql.exec(COMPACT_SOLVE, r.id);
        freed += r.bytes - COMPACTED_BYTES;
      }
      this.addUsage(usage, { bytes: -freed, writes: rowsOf(0, due.length) });
      return due.length;
    });
  }

  async snapshot(now: number): Promise<boolean> {
    return this.exclusive(() => this.takeSnapshot(now));
  }

  // A cópia do dia, dentro do grátis (endurecimento 4.2 e Task 12): uma conta com mais registros que SNAPSHOT_MAX_RECORDS não tem cópia
  // (a cópia não cabe num pedido do objeto; 'size'), conferido por um COUNT antes de ler a conta; o espaço dela e a operação A do put são
  // reservados antes (reserveCopy). Recusada, ela não é gravada nem marca snapshotRev (o alarme de amanhã tenta de novo), e a pausa fica no
  // estado, com o motivo; gravada, a pausa sai e a lista guardada se renova.
  private async takeSnapshot(now: number): Promise<boolean> {
    const userId = this.getState('userId');
    const rev = this.getState('rev') ?? '0';
    if (this.deleted() || userId === null || this.getState('snapshotRev') === rev) return false;
    const caps = capsOf(this.env);
    if (caps.snapshotRecords === 0 || this.recordCount() > caps.snapshotRecords) return this.pauseCopies(userId, 'size');
    const data = exportFromRecords(this.all(), now);
    const day = dayOf(now);
    const gz = await gzipJson(data);
    const paused = await reserveCopy(this.env.DB, gz.byteLength, now, caps);
    if (paused !== null) return this.pauseCopies(userId, paused);
    await this.env.SNAPSHOTS.put(snapshotKey(userId, day), gz, { customMetadata: { kind: 'daily', day, solves: String(activeSolves(data)) } });
    this.setState('snapshotRev', rev);
    this.setState('lastSnapshotDay', day);
    this.setCopies({ ...this.copies(), at: 0, paused: null });
    return true;
  }

  // A cópia do dia não saiu: a pausa fica no estado, com o motivo, e vai no log.
  private pauseCopies(userId: string, why: CopiesPaused): false {
    this.setCopies({ ...this.copies(), paused: why });
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
        this.setCopies({ at: now, list, paused: copies.paused });
        return { copies: list, paused: copies.paused };
      } catch (error) {
        if (error !== OUT_OF_OPS) throw error;
        return copies.list === null ? 'r2-budget' : { copies: copies.list, paused: copies.paused ?? 'ops' };
      }
    });
  }

  // POST /api/snapshots/:name/restore (spec 8.3): grava antes a cópia "antes de restaurar"; depois, cada registro da cópia com datas novas,
  // e o que existe hoje e não está nela vai para a lixeira. A temporada passa por mergeSeason, como num sync: o progresso não volta atrás.
  // Tudo sem um sync no meio: o que a cópia de antes guarda é o que a restauração substitui. Os aparelhos recebem pelo sync normal. As
  // gravações entram nos contadores como as de um sync (commit), sem a cota nem o teto de bytes: a cópia volta inteira ou não volta.
  //
  // Dentro do grátis (decisões 1, 2, 3 e 6, e Task 12), as conferências vêm nesta ordem, todas antes de qualquer gravação, e uma recusa não
  // muda nada na conta: a conta apagada; as restaurações do dia UTC (RESTORES_PER_DAY, restore-limit); um nome fora da lista guardada ainda
  // válida (not-found, sem perguntar ao R2: toda cópia passa por este objeto e renova a lista, então a lista válida tem tudo o que existe);
  // o tamanho da conta, mais registros que RESTORE_MAX_RECORDS (too-big, num COUNT só: nem o D1, nem o R2, nem o gunzip); as duas leituras
  // do R2, ler a cópia e conferir a de antes (operações B, r2-budget); a cópia (not-found; a lista só se renova quando o nome estava nela,
  // ou quando ela já não valia); as linhas que as mudanças da restauração gravam (rowsOf) contra o orçamento de um dia inteiro (too-big) e
  // contra o que sobra hoje (write-budget); o espaço da cópia de antes (no-room: nunca se restaura sem ela, decisão 3) e a operação A do
  // put dela (r2-budget). Só a restauração que deu certo conta no dia. Sem o atalho da lista, alternar "restaurar um nome que não existe"
  // com "abrir a lista" gastaria uma operação A por par.
  async restoreSnapshot(name: string, now: number): Promise<'ok' | 'not-found' | 'deleted' | RestoreRefusal> {
    return this.exclusive(async (): Promise<'ok' | 'not-found' | 'deleted' | RestoreRefusal> => {
      if (this.deleted()) return 'deleted';
      const restores = this.dayCount('restores', now);
      if (restores.n >= RESTORES_PER_DAY) return 'restore-limit';
      const userId = this.getState('userId');
      if (userId === null) return 'not-found'; // nunca sincronizou: nenhuma cópia, e nada a perguntar ao R2
      const { list, at } = this.copies();
      if (list !== null && now - at < COPIES_CACHE_MS && !list.some((c) => c.name === name)) return 'not-found';
      const caps = capsOf(this.env);
      if (caps.restoreRecords === 0 || this.recordCount() > caps.restoreRecords) return 'too-big';
      if (!(await takeOps(this.env.DB, 'B', 2, now, caps.classBMonth))) return 'r2-budget';
      const object = await this.env.SNAPSHOTS.get(snapshotKey(userId, name));
      if (!object) {
        this.renewCopies();
        return 'not-found';
      }
      const copy = (await gunzipJson(await object.arrayBuffer())) as KlickExport;
      const current = this.all();
      const stamp = current.reduce((max, c) => Math.max(max, c.updatedAt + 1, c.deletionStamp + 1), now); // vence tudo o que existe
      const practice = Array.isArray(copy.practice) ? copy.practice : null;
      const changes = restoreChanges(current, { sessions: copy.sessions, solves: copy.solves, practice }, accountPrefsOf(copy.profile), stamp);
      const rows = rowsOf(changes.length);
      if (rows > DAILY_WRITE_BUDGET) return 'too-big';
      if (rows > DAILY_WRITE_BUDGET - this.dayCount('writes', now).n) return 'write-budget';
      // Uma segunda restauração no mesmo segundo (o clique duplo) acha a cópia de antes da primeira, que já guarda o estado de antes: ela
      // fica como está, e não precisa de espaço nem de operação A.
      const key = snapshotKey(userId, preRestoreName(now));
      if ((await this.env.SNAPSHOTS.head(key)) === null) {
        const before = exportFromRecords(current, now);
        const gz = await gzipJson(before);
        const refused = await reserveCopy(this.env.DB, gz.byteLength, now, caps);
        if (refused !== null) return refused === 'space' ? 'no-room' : 'r2-budget';
        await this.env.SNAPSHOTS.put(key, gz, { customMetadata: { kind: 'pre-restore', day: dayOf(now), solves: String(activeSolves(before)) } });
        this.renewCopies();
      }
      this.ctx.storage.transactionSync(() => {
        const usage = this.usage(now);
        const batch = this.batch();
        this.commit(applyChanges(batch.view, changes, { mode: 'server' }), batch, usage);
        this.setState('restores', JSON.stringify({ day: restores.day, n: restores.n + 1 }));
      });
      return 'ok';
    });
  }

  // Apagar a conta (spec 7.7): o banco inteiro do objeto e o alarme somem na hora, e fica só a marca de apagada. Depois de uma cópia ou de
  // uma restauração em andamento, nunca no meio delas. Apagar de novo (um pedido que falhou no meio) dá no mesmo.
  async wipe(): Promise<void> {
    await this.exclusive(async () => {
      await this.ctx.storage.deleteAll();
      this.migrate();
      this.setState('deleted', '1');
    });
  }
}
