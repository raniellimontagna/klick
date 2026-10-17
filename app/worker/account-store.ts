// O Durable Object de uma conta (spec 8.2): um SQLite com os registros da conta, cada um com a revisão em que mudou. Um pedido por vez: o
// sync roda inteiro numa transação síncrona, sem espera no meio, então as revisões saem em ordem sem lock extra. As regras são as mesmas do
// app (src/core/sync). O SQL dos registros mora em records-sql.ts.
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type ApplyResult, type RecordView } from '../src/core/sync/apply';
import { isCounted, TOMBSTONE_KEEP_MS, zeroCounts, type ActiveCounts, type CountedStore } from '../src/core/sync/limits';
import { sessionOfChange } from '../src/core/sync/records';
import { restoreChanges } from '../src/core/sync/restore';
import { accountPrefsOf, exportFromRecords } from '../src/core/sync/snapshot';
import { SYNC_BATCH, syncKey, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../src/core/sync/types';
import type { KlickExport } from '../src/core/types';
import type { Env } from './env';
import { ACCOUNT_BYTES_CAP, COMPACT_PER_DAY, DAILY_WRITE_BUDGET, nextUtcDay, utcDay } from './limits';
import {
  COMPACT_SOLVE,
  COMPACTABLE,
  COMPACTED_BYTES,
  COUNT_ACTIVE,
  RECORDS_SCHEMA,
  rowToChange,
  STORED_BYTES,
  UPSERT_RECORD,
  utf8Bytes,
  type Row,
} from './records-sql';
import { dayOf, gunzipJson, gzipJson, nextSnapshotAt, preRestoreName, snapshotKey } from './snapshots';

const activeSolves = (data: KlickExport): number => data.solves.filter((s) => s.deletedAt === null).length;

// Os contadores da conta, na tabela `state` (endurecimento 4.1, decisões 5 e 6): os ativos de cada store (`active`, a cota), o tamanho do
// conteúdo gravado em bytes (`bytes`, o teto de bytes) e as gravações do dia UTC (`writes`, { day, n }: o orçamento). Toda gravação de
// registro passa por commit() ou pela compactação, que os acertam na mesma transação.
interface Usage {
  active: ActiveCounts;
  bytes: number;
  writes: number; // gravadas hoje (UTC)
}

// Os registros que um lote lê (um sync, uma restauração), cada um uma vez: applyChanges os lê pela vista, e o teto de bytes e write() pegam
// o tamanho do conteúdo gravado de cada um sem ler de novo. `json` é o texto de um `data`, guardado: o teto o mede e write() o grava.
interface Batch {
  view: RecordView;
  storedBytes(store: SyncStore, id: string): number;
  json(data: unknown): string;
}

// O teto de bytes (o `admit` de applyChanges): a mudança que faria o conteúdo gravado da conta passar de ACCOUNT_BYTES_CAP volta com o
// motivo da cota; a que encolhe ou mantém o tamanho (editar, apagar) passa sempre, mesmo numa conta já acima do teto. A conta corre pelo
// lote: o tamanho de cada registro depois do que o lote já deixou passar, e o total.
function bytesCap(batch: Batch, stored: number): (before: Change | undefined, next: Change) => boolean {
  const sizes = new Map<string, number>();
  let total = stored;
  return (before, next) => {
    const key = syncKey(next.store, next.id);
    const size = utf8Bytes(batch.json(next.data));
    const growth = size - (sizes.get(key) ?? (before === undefined ? 0 : batch.storedBytes(next.store, next.id)));
    if (growth > 0 && total + growth > ACCOUNT_BYTES_CAP) return false;
    total += growth;
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
    // rev, userId, snapshotRev, lastSnapshotDay, deleted (a conta foi apagada: wipe) e os contadores (active, bytes, writes: Usage)
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
  // gravar qualquer coisa. As gravações contam no dia UTC de `now`: num dia novo, o orçamento volta inteiro.
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
    const writes = JSON.parse(this.getState('writes') ?? 'null') as { day: string; n: number } | null;
    return { active: JSON.parse(active) as ActiveCounts, bytes: Number(bytes), writes: writes?.day === utcDay(now) ? writes.n : 0 };
  }

  // Soma nos contadores, gravando só o que mudou: um sync que só recebe não grava nada no estado.
  private addUsage(usage: Usage, now: number, add: { active?: ActiveCounts; bytes: number; writes: number }): void {
    const delta = add.active;
    if (delta && Object.values(delta).some((n) => n !== 0)) {
      const active = { ...usage.active };
      for (const store of Object.keys(delta) as CountedStore[]) active[store] += delta[store];
      this.setState('active', JSON.stringify(active));
    }
    if (add.bytes !== 0) this.setState('bytes', String(usage.bytes + add.bytes));
    if (add.writes > 0) this.setState('writes', JSON.stringify({ day: utcDay(now), n: usage.writes + add.writes }));
  }

  // Grava o que um lote mudou e acerta os contadores: os ativos pelo activeDelta, os bytes pelo que write() gravou, e cada registro gravado
  // (a cascata e a versão vencedora que volta para quem mandou a velha, inclusive) conta no orçamento do dia.
  private commit(result: Pick<ApplyResult, 'writes' | 'activeDelta'>, batch: Batch, usage: Usage, now: number): void {
    const grew = this.write(result.writes, batch);
    this.addUsage(usage, now, { active: result.activeDelta, bytes: grew, writes: result.writes.length });
  }

  private all(): Change[] {
    return this.sql.exec<Row>('SELECT * FROM records').toArray().map(rowToChange);
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

  // POST /api/sync (spec 6.1): valida e junta o lote, dá revisão ao que mudou e devolve o que mudou desde o cursor, até SYNC_BATCH.
  // Um cursor além da revisão da conta não saiu daqui (o banco do objeto recomeçou por fora; uma conta apagada já recusa o sync): o aparelho
  // recomeça do zero, senão nunca mais receberia nada. A comparação é com a revisão de antes do lote, a última que algum aparelho pode ter
  // visto.
  //
  // A cota (endurecimento 4.1): applyChanges recusa, com o motivo da cota, o registro que passaria do teto de ativos, e o teto de bytes
  // (bytesCap), a mudança que faria a conta passar de ACCOUNT_BYTES_CAP. O orçamento do dia (decisão 6): só as primeiras mudanças que cabem
  // no que sobra de DAILY_WRITE_BUDGET hoje são lidas; as outras não são gravadas e voltam em `deferred` (as últimas N do lote), com
  // `retryAt`, a meia-noite UTC, quando o orçamento volta. O recebimento segue igual, com ou sem orçamento.
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse | 'deleted'> {
    const response = this.ctx.storage.transactionSync((): SyncResponse | 'deleted' => {
      if (this.deleted()) return 'deleted';
      if (this.getState('userId') === null) this.setState('userId', userId);
      const from = req.cursor > Number(this.getState('rev') ?? '0') ? 0 : req.cursor;
      const usage = this.usage(now);
      const read = req.changes.slice(0, Math.max(0, DAILY_WRITE_BUDGET - usage.writes));
      const batch = this.batch();
      const result = applyChanges(batch.view, read, { mode: 'server', quota: { active: usage.active }, admit: bytesCap(batch, usage.bytes) });
      this.commit(result, batch, usage, now);
      this.sql.exec(
        'INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
        req.deviceId, now,
      );
      const rows = this.sql.exec<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', from, SYNC_BATCH + 1).toArray();
      const page = rows.slice(0, SYNC_BATCH);
      const deferred = req.changes.length - read.length;
      return {
        accepted: read.length - result.rejected.length,
        rejected: result.rejected,
        changes: page.map(rowToChange),
        cursor: page.length > 0 ? page[page.length - 1].rev : from,
        more: rows.length > SYNC_BATCH,
        serverTime: now,
        ...(deferred > 0 ? { deferred, retryAt: nextUtcDay(now) } : {}),
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
  // COMPACT_PER_DAY por dia e dentro do que sobra do orçamento de gravações do dia, onde contam. A data é a exclusão gravada, que vem do
  // aparelho: o mesmo prazo em que ele tira o solve da lixeira. Sem revisão nova: quem já viu o solve não recebe nada, e quem ainda não
  // chegou à revisão dele recebe a marca (que um aparelho sem o solve não grava). `parent` fica. Um aparelho que ainda tem o conteúdo e o
  // manda de novo grava uma revisão nova, como qualquer mudança, e a compactação de outro dia o tira de novo.
  private compact(now: number): number {
    return this.ctx.storage.transactionSync(() => {
      const usage = this.usage(now);
      const limit = Math.min(COMPACT_PER_DAY, Math.max(0, DAILY_WRITE_BUDGET - usage.writes));
      if (limit === 0) return 0;
      const due = this.sql.exec<{ id: string; bytes: number }>(COMPACTABLE, now - TOMBSTONE_KEEP_MS, limit).toArray();
      let freed = 0;
      for (const r of due) {
        this.sql.exec(COMPACT_SOLVE, r.id);
        freed += r.bytes - COMPACTED_BYTES;
      }
      this.addUsage(usage, now, { bytes: -freed, writes: due.length });
      return due.length;
    });
  }

  async snapshot(now: number): Promise<boolean> {
    return this.exclusive(() => this.takeSnapshot(now));
  }

  private async takeSnapshot(now: number): Promise<boolean> {
    const userId = this.getState('userId');
    const rev = this.getState('rev') ?? '0';
    if (this.deleted() || userId === null || this.getState('snapshotRev') === rev) return false;
    const data = exportFromRecords(this.all(), now);
    const day = dayOf(now);
    await this.env.SNAPSHOTS.put(snapshotKey(userId, day), await gzipJson(data), {
      customMetadata: { kind: 'daily', day, solves: String(activeSolves(data)) },
    });
    this.setState('snapshotRev', rev);
    this.setState('lastSnapshotDay', day);
    return true;
  }

  // POST /api/snapshots/:name/restore (spec 8.3): grava antes a cópia "antes de restaurar"; depois, cada registro da cópia com datas novas,
  // e o que existe hoje e não está nela vai para a lixeira. A temporada passa por mergeSeason, como num sync: o progresso não volta atrás.
  // Tudo sem um sync no meio: o que a cópia de antes guarda é o que a restauração substitui. Os aparelhos recebem pelo sync normal. As
  // gravações entram nos contadores como as de um sync (commit), sem a cota nem o teto de bytes: a cópia volta inteira ou não volta.
  async restoreSnapshot(name: string, now: number): Promise<'ok' | 'not-found' | 'deleted'> {
    return this.exclusive(async () => {
      if (this.deleted()) return 'deleted';
      const userId = this.getState('userId');
      if (userId === null) return 'not-found';
      const object = await this.env.SNAPSHOTS.get(snapshotKey(userId, name));
      if (!object) return 'not-found';
      const copy = (await gunzipJson(await object.arrayBuffer())) as KlickExport;
      // Uma segunda restauração no mesmo segundo (o clique duplo) acha a cópia de antes da primeira, que já guarda o estado de antes: ela
      // fica como está.
      const key = snapshotKey(userId, preRestoreName(now));
      if ((await this.env.SNAPSHOTS.head(key)) === null) {
        const before = exportFromRecords(this.all(), now);
        await this.env.SNAPSHOTS.put(key, await gzipJson(before), {
          customMetadata: { kind: 'pre-restore', day: dayOf(now), solves: String(activeSolves(before)) },
        });
      }
      this.ctx.storage.transactionSync(() => {
        const current = this.all();
        const stamp = current.reduce((max, c) => Math.max(max, c.updatedAt + 1, c.deletionStamp + 1), now); // vence tudo o que existe
        const practice = Array.isArray(copy.practice) ? copy.practice : null;
        const changes = restoreChanges(current, { sessions: copy.sessions, solves: copy.solves, practice }, accountPrefsOf(copy.profile), stamp);
        const usage = this.usage(now);
        const batch = this.batch();
        this.commit(applyChanges(batch.view, changes, { mode: 'server' }), batch, usage, now);
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
