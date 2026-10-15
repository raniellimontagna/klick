// Apoio dos testes do sync: um servidor falso, com o mesmo applyChanges do Durable Object (spec 11). Não é um arquivo de teste: a
// simulação e os testes do motor importam daqui.
import { applyChanges, type RecordView } from '../../src/core/sync/apply';
import { sessionOfChange } from '../../src/core/sync/records';
import { syncKey, type Change, type SyncRequest, type SyncResponse, type SyncStore } from '../../src/core/sync/types';

export class MapView implements RecordView {
  readonly records: Map<string, Change>;
  constructor(records: Map<string, Change>) {
    this.records = records;
  }
  get(store: SyncStore, id: string): Change | undefined {
    return this.records.get(syncKey(store, id));
  }
  solvesOf(sessionId: string): Change[] {
    return [...this.records.values()].filter((c) => c.store === 'solves' && sessionOfChange(c) === sessionId);
  }
}

// O servidor de uma conta: registros com revisão, um pedido por vez. `batch` é o tamanho do lote na volta (pequeno nos testes, para
// exercitar `more`); `now` é a hora do servidor.
export class FakeServer {
  readonly records = new Map<string, Change & { rev: number }>();
  rev = 0;
  now = 0;
  requests = 0;
  readonly batch: number;
  constructor(batch = 500) {
    this.batch = batch;
  }
  sync(req: SyncRequest): SyncResponse {
    this.requests++;
    const view = new MapView(this.records);
    const result = applyChanges(view, req.changes, { mode: 'server' });
    for (const w of result.writes) this.records.set(syncKey(w.store, w.id), { ...w, rev: ++this.rev });
    const after = [...this.records.values()].filter((r) => r.rev > req.cursor).sort((a, b) => a.rev - b.rev);
    const page = after.slice(0, this.batch);
    return {
      accepted: req.changes.length - result.rejected.length,
      rejected: result.rejected,
      changes: page.map(({ rev: _rev, ...c }) => c),
      cursor: page.length > 0 ? page[page.length - 1].rev : req.cursor,
      more: after.length > page.length,
      serverTime: this.now,
    };
  }
  // O que está ativo no servidor (prefs inclusive), sem a revisão.
  active(): Map<string, Change> {
    const out = new Map<string, Change>();
    for (const [k, { rev: _rev, ...c }] of this.records) if (c.deletedAt === null) out.set(k, c);
    return out;
  }
}
