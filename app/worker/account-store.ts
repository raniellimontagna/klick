// O Durable Object de uma conta (spec 8.2): um SQLite com os registros da conta, cada um com a revisão em que mudou. Um pedido por vez: o
// sync roda inteiro numa transação síncrona, sem espera no meio, então as revisões saem em ordem sem lock extra. As regras são as mesmas do
// app (src/core/sync).
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type RecordView } from '../src/core/sync/apply';
import { sessionOfChange } from '../src/core/sync/records';
import { restoreChanges } from '../src/core/sync/restore';
import { accountPrefsOf, exportFromRecords } from '../src/core/sync/snapshot';
import { SYNC_BATCH, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../src/core/sync/types';
import type { KlickExport } from '../src/core/types';
import { forgetExpired } from './abuse';
import type { Env } from './env';
import { dayOf, gunzipJson, gzipJson, nextSnapshotAt, preRestoreName, snapshotKey } from './snapshots';

type Row = {
  store: string;
  id: string;
  data: string;
  updated_at: number;
  deleted_at: number | null;
  deletion_stamp: number;
  rev: number;
  parent: string | null;
};

const rowToChange = (r: Row): Change => ({
  store: r.store as SyncStore,
  id: r.id,
  data: JSON.parse(r.data) as unknown,
  updatedAt: r.updated_at,
  deletedAt: r.deleted_at,
  deletionStamp: r.deletion_stamp,
});

const activeSolves = (data: KlickExport): number => data.solves.filter((s) => s.deletedAt === null).length;

export class AccountStore extends DurableObject<Env> {
  private readonly sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.migrate();
  }

  // `parent` é a sessão do solve (decisão 8): a cascata (spec 6.3) acha os solves de uma sessão pelo índice.
  private migrate(): void {
    this.sql.exec(`CREATE TABLE IF NOT EXISTS records (
      store TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL,
      updated_at INTEGER NOT NULL, deleted_at INTEGER, deletion_stamp INTEGER NOT NULL,
      rev INTEGER NOT NULL, parent TEXT, PRIMARY KEY (store, id)
    )`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS records_rev ON records (rev)');
    this.sql.exec('CREATE INDEX IF NOT EXISTS records_parent ON records (store, parent)');
    // rev, userId, snapshotRev, lastSnapshotDay e deleted (a conta foi apagada: wipe)
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS devices (device_id TEXT PRIMARY KEY, last_sync_at INTEGER NOT NULL)');
  }

  private getState(key: string): string | null {
    return this.sql.exec<{ value: string }>('SELECT value FROM state WHERE key = ?', key).toArray()[0]?.value ?? null;
  }

  private setState(key: string, value: string): void {
    this.sql.exec('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
  }

  private view(): RecordView {
    return {
      get: (store, id) => {
        const row = this.sql.exec<Row>('SELECT * FROM records WHERE store = ? AND id = ?', store, id).toArray()[0];
        return row ? rowToChange(row) : undefined;
      },
      solvesOf: (sessionId) => this.sql.exec<Row>("SELECT * FROM records WHERE store = 'solves' AND parent = ?", sessionId).toArray().map(rowToChange),
    };
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

  // Grava cada registro que mudou com a próxima revisão da conta. `parent` segue o conteúdo gravado: um solve que passou para outra sessão
  // sai da cascata da de antes e entra na da nova.
  private write(changes: readonly Change[]): void {
    let rev = Number(this.getState('rev') ?? '0');
    for (const c of changes) {
      rev += 1;
      this.sql.exec(
        `INSERT INTO records (store, id, data, updated_at, deleted_at, deletion_stamp, rev, parent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(store, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at,
         deletion_stamp = excluded.deletion_stamp, rev = excluded.rev, parent = excluded.parent`,
        c.store, c.id, JSON.stringify(c.data), c.updatedAt, c.deletedAt, c.deletionStamp, rev, sessionOfChange(c),
      );
    }
    this.setState('rev', String(rev));
  }

  // POST /api/sync (spec 6.1): valida e junta o lote, dá revisão ao que mudou e devolve o que mudou desde o cursor, até SYNC_BATCH.
  // Um cursor além da revisão da conta não saiu daqui (o banco do objeto recomeçou por fora; uma conta apagada já recusa o sync): o aparelho
  // recomeça do zero, senão nunca mais receberia nada. A comparação é com a revisão de antes do lote, a última que algum aparelho pode ter
  // visto.
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse | 'deleted'> {
    const response = this.ctx.storage.transactionSync((): SyncResponse | 'deleted' => {
      if (this.deleted()) return 'deleted';
      if (this.getState('userId') === null) this.setState('userId', userId);
      const from = req.cursor > Number(this.getState('rev') ?? '0') ? 0 : req.cursor;
      const result = applyChanges(this.view(), req.changes, { mode: 'server' });
      this.write(result.writes);
      this.sql.exec(
        'INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
        req.deviceId, now,
      );
      const rows = this.sql.exec<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', from, SYNC_BATCH + 1).toArray();
      const page = rows.slice(0, SYNC_BATCH);
      return {
        accepted: req.changes.length - result.rejected.length,
        rejected: result.rejected,
        changes: page.map(rowToChange),
        cursor: page.length > 0 ? page[page.length - 1].rev : from,
        more: rows.length > SYNC_BATCH,
        serverTime: now,
      };
    });
    if (response === 'deleted') return response;
    // A cópia diária: o primeiro sync marca o alarme. Pela hora de verdade, não pela do pedido: um alarme no passado dispararia na hora.
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(nextSnapshotAt(Date.now()));
    return response;
  }

  // Uma vez por dia (spec 8.3 e 10): a cópia do dia, só se a conta mudou desde a última, os pedidos de código que passaram da hora e os
  // códigos vencidos. Uma conta apagada (ou sem dono) não marca o próximo.
  async alarm(): Promise<void> {
    await this.exclusive(async () => {
      if (this.deleted() || this.getState('userId') === null) return;
      const now = Date.now();
      await this.takeSnapshot(now);
      await forgetExpired(this.env.DB, now);
      await this.ctx.storage.setAlarm(nextSnapshotAt(now));
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
  // Tudo sem um sync no meio: o que a cópia de antes guarda é o que a restauração substitui. Os aparelhos recebem pelo sync normal.
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
        this.write(applyChanges(this.view(), changes, { mode: 'server' }).writes);
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
