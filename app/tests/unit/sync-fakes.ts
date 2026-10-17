// Apoio dos testes do sync: um servidor falso, com o mesmo applyChanges do Durable Object (spec 11). Não é um arquivo de teste: a
// simulação e os testes do motor importam daqui.
import { applyChanges, type ApplyOptions, type RecordView } from '../../src/core/sync/apply';
import { ACCOUNT_LIMITS, isCounted, zeroCounts, type ActiveCounts } from '../../src/core/sync/limits';
import { sessionOfChange } from '../../src/core/sync/records';
import { SYNC_PROTOCOL, syncKey, type Change, type CopiesPaused, type SyncRequest, type SyncResponse, type SyncStore } from '../../src/core/sync/types';
import { ApiError } from '../../src/sync/api';

const DAY_MS = 86_400_000;

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
// exercitar `more`); `now` é a hora do servidor. Recusa como o objeto da conta (worker/account-store.ts): outra versão do protocolo é 426;
// a cota vale sempre, com os ativos gravados e `limits` (ACCOUNT_LIMITS, se faltar), a vaga da sessão que um solve pede inclusive; `admit`
// faz o papel do teto de bytes; com `budget`, só as primeiras mudanças que cabem no que sobra das gravações do dia são lidas, e o resto
// volta em `deferred`, com `retryAt` na virada do dia UTC de `now` (newDay() zera o dia). `copiesPaused` vai em toda resposta.
export class FakeServer {
  readonly records = new Map<string, Change & { rev: number }>();
  rev = 0;
  now = 0;
  requests = 0;
  written = 0; // registros gravados no dia, a cascata inclusive (o orçamento)
  copiesPaused: CopiesPaused | null = null;
  admit: ApplyOptions['admit'] = undefined;
  readonly batch: number;
  readonly limits: Readonly<ActiveCounts>;
  readonly budget: number | null;
  constructor(batch = 500, opts: { limits?: Readonly<ActiveCounts>; budget?: number } = {}) {
    this.batch = batch;
    this.limits = opts.limits ?? ACCOUNT_LIMITS;
    this.budget = opts.budget ?? null;
  }
  sync(req: SyncRequest): SyncResponse {
    if (req.v !== SYNC_PROTOCOL) throw new ApiError('update', 426);
    this.requests++;
    const view = new MapView(this.records);
    const read = this.budget === null ? req.changes : req.changes.slice(0, Math.max(0, this.budget - this.written));
    const result = applyChanges(view, read, { mode: 'server', quota: { active: this.counts(), limits: this.limits }, admit: this.admit });
    for (const w of result.writes) this.records.set(syncKey(w.store, w.id), { ...w, rev: ++this.rev });
    this.written += result.writes.length;
    const after = [...this.records.values()].filter((r) => r.rev > req.cursor).sort((a, b) => a.rev - b.rev);
    const page = after.slice(0, this.batch);
    const deferred = req.changes.length - read.length;
    return {
      accepted: read.length - result.rejected.length,
      rejected: result.rejected,
      changes: page.map(({ rev: _rev, ...c }) => c),
      cursor: page.length > 0 ? page[page.length - 1].rev : req.cursor,
      more: after.length > page.length,
      serverTime: this.now,
      ...(deferred > 0 ? { deferred, retryAt: (Math.floor(this.now / DAY_MS) + 1) * DAY_MS } : {}),
      copiesPaused: this.copiesPaused,
    };
  }
  // A virada do dia do orçamento: as gravações do dia voltam a zero (a hora fica a de `now`).
  newDay(): void {
    this.written = 0;
  }
  // Os ativos de cada store contada, como o objeto da conta guarda no estado.
  counts(): ActiveCounts {
    const counts = zeroCounts();
    for (const r of this.records.values()) if (r.deletedAt === null && isCounted(r.store)) counts[r.store]++;
    return counts;
  }
  // O que está ativo no servidor (prefs inclusive), sem a revisão.
  active(): Map<string, Change> {
    const out = new Map<string, Change>();
    for (const [k, { rev: _rev, ...c }] of this.records) if (c.deletedAt === null) out.set(k, c);
    return out;
  }
}
