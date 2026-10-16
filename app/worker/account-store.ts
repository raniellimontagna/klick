// O Durable Object de uma conta (spec 8.2): um SQLite com os registros da conta, cada um com a revisão em que mudou. Um pedido por vez: o
// sync roda inteiro numa transação síncrona, sem espera no meio, então as revisões saem em ordem sem lock extra. As regras são as mesmas do
// app (src/core/sync).
import { DurableObject } from 'cloudflare:workers';
import { applyChanges, type RecordView } from '../src/core/sync/apply';
import { sessionOfChange } from '../src/core/sync/records';
import { SYNC_BATCH, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../src/core/sync/types';
import type { Env } from './env';

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
    this.sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL)'); // rev, userId, snapshotRev, lastSnapshotDay
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
  async syncBatch(userId: string, req: SyncRequest, now: number): Promise<SyncResponse> {
    return this.ctx.storage.transactionSync((): SyncResponse => {
      if (this.getState('userId') === null) this.setState('userId', userId);
      const result = applyChanges(this.view(), req.changes, { mode: 'server' });
      this.write(result.writes);
      this.sql.exec(
        'INSERT INTO devices (device_id, last_sync_at) VALUES (?, ?) ON CONFLICT(device_id) DO UPDATE SET last_sync_at = excluded.last_sync_at',
        req.deviceId, now,
      );
      const rows = this.sql.exec<Row>('SELECT * FROM records WHERE rev > ? ORDER BY rev LIMIT ?', req.cursor, SYNC_BATCH + 1).toArray();
      const page = rows.slice(0, SYNC_BATCH);
      return {
        accepted: req.changes.length - result.rejected.length,
        rejected: result.rejected,
        changes: page.map(rowToChange),
        cursor: page.length > 0 ? page[page.length - 1].rev : req.cursor,
        more: rows.length > SYNC_BATCH,
        serverTime: now,
      };
    });
  }
}
