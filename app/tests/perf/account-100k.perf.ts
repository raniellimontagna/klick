// A medição de uma conta grande no plano gratuito (endurecimento, Task 11; spec 4.4 e 7.2). Fica fora do `pnpm test` e do `test:worker`:
// roda com `vitest run -c vitest.perf.config.ts` e escreve docs/superpowers/measurements/2026-10-17-conta-100k.md, com os números e um
// veredito por operação (a regra está em RULE, logo abaixo).
//
// Por que no Node: dentro do workerd o relógio não anda durante a CPU de um pedido, então a CPU só se mede fora dele. O objeto da conta de
// verdade (worker/account-store.ts) roda aqui, com `cloudflare:workers` trocado por uma casca (cloudflare-workers.ts), sobre um
// node:sqlite em memória com o mesmo esquema e o mesmo SQL (worker/records-sql.ts). O D1 e o R2 são falsos: o que eles fazem é rede, não
// CPU do objeto. Os módulos do núcleo e do Worker passam por vi.mock só para (1) ler três constantes por um getter (o orçamento do dia, a
// compactação por alarme e a página do sync), que a medição sobe ou desce em casos marcados, e (2) chamar a sonda de memória depois das
// funções pesadas. Nenhum mock muda o que a função faz.
import { writeFileSync, mkdirSync } from 'node:fs';
import { cpus, release, totalmem } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';

// As constantes que a medição troca em casos marcados (null: o valor de verdade) e a sonda de memória (null: desligada).
const knobs = vi.hoisted(() => ({
  budget: null as number | null, // DAILY_WRITE_BUDGET
  compact: null as number | null, // COMPACT_PER_DAY
  page: null as number | null, // SYNC_BATCH
  applied: 0, // quantas mudanças o último applyChanges leu
  probe: null as ((label: string) => void) | null,
  mark: null as ((label: string) => void) | null, // as etapas da CPU (rodadas de CPU e relógio)
}));

vi.mock('../../worker/limits', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../worker/limits')>();
  return {
    ...real,
    get DAILY_WRITE_BUDGET() {
      return knobs.budget ?? real.DAILY_WRITE_BUDGET;
    },
    get COMPACT_PER_DAY() {
      return knobs.compact ?? real.COMPACT_PER_DAY;
    },
  };
});
vi.mock('../../src/core/sync/types', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/sync/types')>();
  return {
    ...real,
    get SYNC_BATCH() {
      return knobs.page ?? real.SYNC_BATCH;
    },
  };
});
vi.mock('../../src/core/sync/apply', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/sync/apply')>();
  return {
    ...real,
    applyChanges: (...args: Parameters<typeof real.applyChanges>) => {
      const out = real.applyChanges(...args);
      knobs.applied = args[1].length;
      knobs.mark?.('applyChanges');
      knobs.probe?.('applyChanges');
      return out;
    },
  };
});
vi.mock('../../src/core/sync/restore', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/sync/restore')>();
  return {
    ...real,
    restoreChanges: (...args: Parameters<typeof real.restoreChanges>) => {
      const out = real.restoreChanges(...args);
      knobs.mark?.('restoreChanges');
      knobs.probe?.('restoreChanges');
      return out;
    },
  };
});
vi.mock('../../src/core/sync/snapshot', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/core/sync/snapshot')>();
  return {
    ...real,
    exportFromRecords: (...args: Parameters<typeof real.exportFromRecords>) => {
      const out = real.exportFromRecords(...args);
      knobs.mark?.('exportFromRecords');
      knobs.probe?.('exportFromRecords');
      return out;
    },
  };
});
vi.mock('../../worker/snapshots', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../worker/snapshots')>();
  return {
    ...real,
    gzipJson: async (data: unknown) => {
      const gz = await real.gzipJson(data);
      knobs.mark?.('gzipJson');
      knobs.probe?.('gzipJson');
      return gz;
    },
    gunzipJson: async (bytes: ArrayBuffer) => {
      const data = await real.gunzipJson(bytes);
      knobs.mark?.('gunzipJson');
      knobs.probe?.('gunzipJson');
      return data;
    },
  };
});

import { applyChanges, type ApplyResult, type RecordView } from '../../src/core/sync/apply';
import { isCounted, zeroCounts, TOMBSTONE_KEEP_MS, type ActiveCounts, type CountedStore } from '../../src/core/sync/limits';
import { prefsFromProfile, profileFromPrefs } from '../../src/core/sync/prefs';
import { sessionOfChange } from '../../src/core/sync/records';
import { restoreChanges } from '../../src/core/sync/restore';
import { accountPrefsOf, exportFromRecords } from '../../src/core/sync/snapshot';
import { SYNC_PROTOCOL, type Change, type CloudCopy, type CopiesPaused, type SyncRequest, type SyncStore } from '../../src/core/sync/types';
import type { EventId, KlickExport } from '../../src/core/types';
import { AccountStore } from '../../worker/account-store';
import { reserveCopy, takeOps } from '../../worker/budget';
import type { Env } from '../../worker/env';
import { capsOf, COMPACT_PER_DAY, COPIES_CACHE_MS, DAILY_WRITE_BUDGET, RESTORES_PER_DAY } from '../../worker/limits';
import { COMPACT_SOLVE, COUNT_ACTIVE, RECORDS_SCHEMA, STORED_BYTES, UPSERT_RECORD } from '../../worker/records-sql';
import { dayOf, gunzipJson, gzipJson, preRestoreName, snapshotKey } from '../../worker/snapshots';
import { seeded } from '../unit/sync-random';

// --- A regra (Task 11) e as contas medidas ---

const CPU_LIMIT_MS = 5; // metade dos 10 ms de CPU por pedido do grátis
const MEM_LIMIT_MB = 64; // metade dos 128 MB
const SIZES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000] as const;
const BIGGEST = SIZES[SIZES.length - 1];
const PAGES = [500, 250, 100, 50] as const; // o maior que cabe, para o envio e o recebimento
const COMPACTS = [2_000, 1_000, 500, 250, 100] as const; // a compactação por alarme, a 100 mil
const REPS = 3; // cada operação, três vezes: fica a mediana
const KINDS_AT = 25_000; // a conta das linhas gravadas por tipo de mudança (não dependem do tamanho)
const SHARED_ROWS_PER_DAY = 100_000; // linhas gravadas por dia no grátis, somadas entre todas as contas
const ACCOUNT_SHARE = 0.2; // o que uma conta pode gastar delas

const USER = 'conta-medida';
const T0 = Date.now();
const DAY = 86_400_000;
const YEAR = 365 * DAY;
const MB = 1024 * 1024;
const BIG = 256 * 1024; // um texto ou bytes deste tamanho para cima chama a sonda (os grandes do arquivo da cópia)
const DOC = path.join(import.meta.dirname, '../../../docs/superpowers/measurements/2026-10-17-conta-100k.md');

const gc = (globalThis as { gc?: () => void }).gc as () => void;

// --- O banco do objeto no node:sqlite: o pedaço do SqlStorage que o objeto da conta usa ---

type Value = string | number | null;

// As linhas gravadas (o que o grátis conta, 100 mil por dia somadas entre todas as contas), pela regra conferida no workerd: o
// `rowsWritten` do cursor do SQLite do objeto, medido uma vez fora da suíte (seção (a) do documento). Ligada só na rodada instrumentada.
let counting: { n: number } | null = null;

class Cursor<T> {
  constructor(private readonly rows: T[]) {}
  toArray(): T[] {
    return this.rows;
  }
  one(): T {
    if (this.rows.length !== 1) throw new Error(`one() com ${this.rows.length} linhas`);
    return this.rows[0];
  }
  [Symbol.iterator](): Iterator<T> {
    return this.rows[Symbol.iterator]();
  }
}

class NodeSql {
  private readonly statements = new Map<string, { stmt: StatementSync; reads: boolean }>();
  private readonly helpers = new Map<string, StatementSync>();

  constructor(readonly db: DatabaseSync) {}

  // Como o exec do workerd: a gravação roda na hora; a leitura volta as linhas. O comando preparado fica guardado pelo texto, como no
  // workerd.
  exec<T>(query: string, ...bindings: Value[]): Cursor<T> {
    let entry = this.statements.get(query);
    if (!entry) {
      const stmt = this.db.prepare(query);
      entry = { stmt, reads: stmt.columns().length > 0 };
      this.statements.set(query, entry);
    }
    if (entry.reads) {
      const rows = entry.stmt.all(...(bindings as SQLInputValue[])) as unknown as T[];
      if (rows.length >= 50) {
        knobs.mark?.('SELECT');
        knobs.probe?.('SELECT');
      }
      return new Cursor(rows);
    }
    if (counting) counting.n += this.rowsWritten(query, bindings);
    entry.stmt.run(...(bindings as SQLInputValue[]));
    if (query.startsWith('INSERT INTO state')) knobs.probe?.('estado');
    return new Cursor<T>([]);
  }

  private get(query: string, ...bindings: Value[]): Record<string, Value> | undefined {
    let stmt = this.helpers.get(query);
    if (!stmt) {
      stmt = this.db.prepare(query);
      this.helpers.set(query, stmt);
    }
    return stmt.get(...(bindings as SQLInputValue[])) as Record<string, Value> | undefined;
  }

  // A regra, por comando (seção (a)): um registro novo grava a linha, a chave primária, records_rev e records_parent (4); um que já existe
  // regrava a linha e os dois índices das colunas do SET (3); entrar em records_tombs (um solve apagado com conteúdo) soma 1, e sair dele
  // não conta. A compactação grava 1. Uma linha nova do estado ou dos aparelhos grava 2 (a linha e a chave), uma que muda, 1. CREATE
  // INDEX grava uma por entrada do índice, mais 1 (o esquema). Um comando sem regra para a medição.
  private rowsWritten(query: string, b: Value[]): number {
    if (query === UPSERT_RECORD) {
      const exists = this.get('SELECT 1 AS x FROM records WHERE store = ? AND id = ?', b[0], b[1]) !== undefined;
      const tomb = b[0] === 'solves' && b[4] !== null && b[2] !== '{}';
      return (exists ? 3 : 4) + (tomb ? 1 : 0);
    }
    if (query === COMPACT_SOLVE) return Number(this.get("SELECT count(*) AS n FROM records WHERE store = 'solves' AND id = ?", b[0])?.n);
    if (query.startsWith('INSERT INTO state')) return this.get('SELECT 1 AS x FROM state WHERE key = ?', b[0]) === undefined ? 2 : 1;
    if (query.startsWith('INSERT INTO devices')) return this.get('SELECT 1 AS x FROM devices WHERE device_id = ?', b[0]) === undefined ? 2 : 1;
    const created = /^CREATE (TABLE|INDEX) IF NOT EXISTS (\w+)/.exec(query);
    if (created) {
      if (this.get('SELECT 1 AS x FROM sqlite_master WHERE name = ?', created[2]) !== undefined) return 0;
      if (created[1] === 'TABLE') return 1;
      const on = /ON (\w+) \([^)]*\)(?: WHERE (.*))?$/s.exec(query);
      if (!on) throw new Error(`índice sem tabela: ${query}`);
      return Number(this.get(`SELECT count(*) AS n FROM ${on[1]}${on[2] ? ` WHERE ${on[2]}` : ''}`)?.n) + 1;
    }
    throw new Error(`gravação sem regra de linhas: ${query}`);
  }
}

// --- O D1 e o R2 falsos, e o estado do objeto ---

// O R2: guarda só o que a medição põe antes (a cópia a restaurar); de uma gravação, só o tamanho, para o arquivo gravado não contar na
// memória de quem vem depois (no workerd ele vai embora para o R2).
class FakeR2 {
  readonly objects = new Map<string, ArrayBuffer>();
  lastPut = 0;
  async put(_key: string, value: ArrayBuffer): Promise<object> {
    this.lastPut = value.byteLength;
    knobs.mark?.('put no R2');
    knobs.probe?.('put no R2');
    return {};
  }
  async get(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null> {
    const bytes = this.objects.get(key);
    if (!bytes) return null;
    return {
      arrayBuffer: async () => {
        const copy = bytes.slice(0); // o corpo chega ao objeto como bytes novos
        knobs.mark?.('get no R2');
        knobs.probe?.('get no R2');
        return copy;
      },
    };
  }
  async head(key: string): Promise<object | null> {
    return this.objects.has(key) ? {} : null;
  }
}

// O D1 dos tetos (budget.ts): toda reserva passa. É uma chamada de rede do objeto, fora da CPU dele.
function fakeEnv(r2: FakeR2): Env {
  const statement = { bind: () => statement, run: async () => ({ meta: { changes: 1 } }), first: async () => null };
  const DB = { prepare: () => statement, batch: async (list: unknown[]) => list.map(() => ({ meta: { changes: 1 } })) };
  return {
    DB,
    SNAPSHOTS: r2,
    SNAPSHOT_BYTES_CAP: '1000000000',
    R2_CLASS_A_MONTH: '1000000',
    R2_CLASS_B_MONTH: '10000000',
    MAIL_PER_DAY: '80',
    MAIL_PER_MONTH: '2500',
  } as unknown as Env;
}

// O `ctx` do objeto: o banco, a transação síncrona (BEGIN/COMMIT, como o transactionSync do workerd), o alarme e o blockConcurrencyWhile
// (um pedido por vez aqui de qualquer jeito). Cada setAlarm conta uma linha gravada (a tabela de preços da Cloudflare).
function fakeCtx(sql: NodeSql, alarm: { at: number | null }): DurableObjectState {
  const db = sql.db;
  return {
    storage: {
      sql,
      transactionSync<T>(fn: () => T): T {
        db.exec('BEGIN');
        try {
          const out = fn();
          db.exec('COMMIT');
          return out;
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
      },
      getAlarm: async () => alarm.at,
      setAlarm: async (at: number) => {
        if (counting) counting.n += 1;
        alarm.at = at;
      },
    },
    blockConcurrencyWhile: async <T>(fn: () => Promise<T>): Promise<T> => fn(),
  } as unknown as DurableObjectState;
}

// O que o objeto tem de privado e a medição chama direto: a compactação sozinha, a contagem inicial, e a restauração alternativa (c).
interface Batch {
  view: RecordView;
  storedBytes(store: SyncStore, id: string): number;
  json(data: unknown): string;
}
interface Inside {
  ctx: DurableObjectState;
  env: Env;
  all(): Change[];
  batch(): Batch;
  usage(now: number): unknown;
  commit(result: Pick<ApplyResult, 'writes' | 'activeDelta'>, batch: Batch, usage: unknown): void;
  dayCount(key: 'writes' | 'restores', now: number): { day: string; n: number };
  getState(key: string): string | null;
  setState(key: string, value: string): void;
  copies(): { at: number; list: CloudCopy[] | null; paused: CopiesPaused | null };
  renewCopies(): void;
  deleted(): boolean;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  compact(now: number): number;
}
const inside = (store: AccountStore): Inside => store as unknown as Inside;

// --- As contas ---

const EVENTS: readonly EventId[] = ['333', '333', '333', '222', '444', '333oh', 'pyram', 'skewb', '333', '555'];
const CASES = ['oll2-linha', 'oll2-l', 'oll2-ponto', 'oll2-sune', 'oll2-antisune', 'oll2-h', 'oll2-pi', 'oll2-farois'];
const NOTES = ['pop', 'lockup no F2L', 'PB!', 'skip de OLL', 'errei a inspeção'];
const FACES = ['U', 'D', 'R', 'L', 'F', 'B'];
const TURNS = ['', "'", '2'];

// Um id do Klick (17 caracteres [0-9a-z], data.ids.ts): o tempo, o contador e o sufixo do sorteio.
const idAt = (at: number, rnd: () => number): string =>
  Math.floor(at).toString(36).padStart(9, '0') + '00' + Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0');

function scramble(rnd: () => number): string {
  const moves: string[] = [];
  let last = -1;
  while (moves.length < 20) {
    const face = Math.floor(rnd() * 6);
    if (face === last) continue;
    last = face;
    moves.push(FACES[face] + TURNS[Math.floor(rnd() * 3)]);
  }
  return moves.join(' ');
}

const solveData = (sessionId: string, event: EventId, at: number, rnd: () => number) => {
  const p = rnd();
  return {
    sessionId,
    event,
    ms: Math.round(8_000 + rnd() * 22_000),
    penalty: p < 0.02 ? '+2' : p < 0.03 ? 'DNF' : null,
    at,
    scramble: scramble(rnd),
    note: rnd() < 0.01 ? NOTES[Math.floor(rnd() * NOTES.length)] : '',
    createdAt: at,
  };
};

// Uma conta de N solves: 20 sessões, os N solves espalhados pelo último ano (um em cada dez na lixeira uma hora depois do solve, com o
// conteúdo: os de mais de 30 dias são o que a compactação tira), N/10 tentativas do treino e os ajustes padrão da conta.
function generate(n: number): { records: Change[]; sessions: { id: string; event: EventId }[] } {
  const rnd = seeded(n);
  const start = T0 - YEAR;
  const records: Change[] = [];
  const sessions = Array.from({ length: 20 }, (_, i) => ({ id: idAt(start - DAY + i, rnd), event: EVENTS[i % EVENTS.length] }));
  sessions.forEach((s, i) => {
    const at = start - DAY + i;
    records.push({ store: 'sessions', id: s.id, data: { name: `Sessão ${i + 1}`, event: s.event, order: i, createdAt: at }, updatedAt: at, deletedAt: null, deletionStamp: at });
  });
  for (let i = 0; i < n; i++) {
    const at = start + Math.floor((i * YEAR) / n);
    const s = sessions[i % sessions.length];
    const gone = i % 10 === 9 ? at + 3_600_000 : null;
    records.push({ store: 'solves', id: idAt(at, rnd), data: solveData(s.id, s.event, at, rnd), updatedAt: gone ?? at, deletedAt: gone, deletionStamp: gone ?? at });
  }
  for (let i = 0; i < Math.floor(n / 10); i++) {
    const at = start + Math.floor((i * YEAR) / (n / 10)) + 1;
    const data = { caseId: CASES[Math.floor(rnd() * CASES.length)], ms: Math.round(1_500 + rnd() * 4_500), ok: rnd() < 0.8, helped: rnd() < 0.15, at };
    records.push({ store: 'practice', id: idAt(at, rnd), data, updatedAt: at, deletedAt: null, deletionStamp: at });
  }
  for (const [key, value] of prefsFromProfile(profileFromPrefs([]), { withDefaults: true })) {
    records.push({ store: 'prefs', id: key, data: value, updatedAt: start, deletedAt: null, deletionStamp: start });
  }
  return { records, sessions };
}

interface Account {
  n: number;
  rows: number; // os registros do objeto (sessões, solves, treino e ajustes)
  rev: number;
  sql: NodeSql;
  ctx: DurableObjectState;
  env: Env;
  r2: FakeR2;
  alarm: { at: number | null };
  store: AccountStore;
  session: string; // uma sessão ativa, onde os solves novos entram
  sample: Change[]; // os primeiros 500 solves ativos, para editar e apagar
  sampleRows: Record<string, SQLInputValue>[]; // as linhas deles, como ficaram gravadas
  state: Map<string, string>; // o estado de quando a conta ficou pronta
  due: number; // os solves que a compactação de hoje pode tirar
  close(): void;
}

// A conta como o objeto a teria depois da Task 4: os registros com as revisões, o dono, a revisão, os contadores (ativos e bytes) e o
// alarme da cópia marcado. Montada direto no banco (não é medido).
function buildAccount(n: number): Account {
  const db = new DatabaseSync(':memory:');
  const sql = new NodeSql(db);
  const r2 = new FakeR2();
  const alarm = { at: T0 + DAY as number | null };
  const ctx = fakeCtx(sql, alarm);
  const env = fakeEnv(r2);
  const store = new AccountStore(ctx, env);
  const { records, sessions } = generate(n);
  const insert = db.prepare(UPSERT_RECORD);
  const set = db.prepare('INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  let rev = 0;
  db.exec('BEGIN');
  for (const c of records) insert.run(c.store, c.id, JSON.stringify(c.data), c.updatedAt, c.deletedAt, c.deletionStamp, ++rev, sessionOfChange(c));
  const active: ActiveCounts = zeroCounts();
  for (const r of db.prepare(COUNT_ACTIVE).all() as { store: string; n: number }[]) {
    if (isCounted(r.store as SyncStore)) active[r.store as CountedStore] = r.n;
  }
  const state = new Map<string, string>([
    ['userId', USER],
    ['rev', String(rev)],
    ['active', JSON.stringify(active)],
    ['bytes', String((db.prepare(STORED_BYTES).get() as { n: number }).n)],
  ]);
  for (const [k, v] of state) set.run(k, v);
  db.exec('COMMIT');
  const sample = records.filter((c) => c.store === 'solves' && c.deletedAt === null).slice(0, 500);
  const one = db.prepare('SELECT * FROM records WHERE store = ? AND id = ?');
  const sampleRows = sample.map((c) => one.get(c.store, c.id) as Record<string, SQLInputValue>);
  const due = Number(
    (db.prepare("SELECT count(*) AS n FROM records WHERE store = 'solves' AND deleted_at IS NOT NULL AND data <> '{}' AND deleted_at < ?").get(T0 - TOMBSTONE_KEEP_MS) as { n: number }).n,
  );
  return { n, rows: records.length, rev, sql, ctx, env, r2, alarm, store, session: sessions[0].id, sample, sampleRows, state, due, close: () => db.close() };
}

// Volta a conta ao estado de quando ficou pronta: tira os registros gravados depois (e devolve os solves de exemplo, que editar e apagar
// regravam), o estado novo e os aparelhos (não é medido).
function reset(a: Account): void {
  const db = a.sql.db;
  db.exec('BEGIN');
  db.prepare('DELETE FROM records WHERE rev > ?').run(a.rev);
  const back = db.prepare(UPSERT_RECORD);
  for (const r of a.sampleRows) back.run(r.store, r.id, r.data, r.updated_at, r.deleted_at, r.deletion_stamp, r.rev, r.parent);
  db.exec('DELETE FROM state');
  db.exec('DELETE FROM devices');
  const set = db.prepare('INSERT INTO state (key, value) VALUES (?, ?)');
  for (const [k, v] of a.state) set.run(k, v);
  db.exec('COMMIT');
  a.alarm.at = T0 + DAY;
}

const newSolves = (a: Account, count: number, tag: string): Change[] => {
  const rnd = seeded(count + tag.length);
  return Array.from({ length: count }, (_, i) => {
    const at = T0 - (count - i) * 1_000;
    const id = `${tag}${String(i).padStart(4, '0')}${Math.floor(rnd() * 36 ** 6).toString(36).padStart(6, '0')}`;
    return { store: 'solves', id, data: solveData(a.session, '333', at, rnd), updatedAt: at, deletedAt: null, deletionStamp: at };
  });
};

const request = (changes: Change[], cursor: number): SyncRequest => ({ v: SYNC_PROTOCOL, account: USER, deviceId: 'aparelho-novo', cursor, clock: T0, changes });

// --- Medir: CPU, relógio, memória e linhas gravadas ---

interface Phase {
  label: string; // a etapa termina aqui
  cpu: number; // ms
  wall: number; // ms
}

interface Result {
  cpu: number; // ms, mediana (process.cpuUsage: o processo inteiro)
  jsCpu: number; // ms, mediana (process.threadCpuUsage: só a linha do JS)
  phases: Phase[]; // as etapas da rodada da mediana
  wall: number; // ms, mediana
  live: number; // MB: o maior vivo nas sondas, depois do gc()
  occupied: number; // MB: o maior ocupado nas sondas, antes do gc()
  where: string; // a sonda do maior vivo
  liveAt: Record<string, number>; // MB: o maior vivo em cada sonda
  rows: number; // linhas gravadas (rodada instrumentada)
  gzip: number | null; // bytes do arquivo gravado no R2
  count: number | null; // o número que a operação conta (mudanças, compactados)
  reps: number;
}

const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

// Depois do gc() da montagem, o V8 ainda varre a memória em linhas auxiliares por alguns milissegundos: a CPU delas não é da operação.
async function settle(): Promise<void> {
  gc();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

// Os textos e bytes grandes do caminho (o arquivo da cópia em JSON, os bytes dele) aparecem e somem dentro de uma função só: a sonda roda
// logo depois deles, com a entrada e a saída ainda vivas. Ligado só na rodada instrumentada.
function hookBig(): () => void {
  const J = JSON as unknown as Record<'stringify' | 'parse', (...a: unknown[]) => unknown>;
  const { stringify, parse } = J;
  const encode = TextEncoder.prototype.encode;
  const decode = TextDecoder.prototype.decode;
  J.stringify = (...a: unknown[]) => {
    const out = stringify.apply(JSON, a);
    if (typeof out === 'string' && out.length >= BIG) knobs.probe?.('JSON.stringify');
    return out;
  };
  J.parse = (...a: unknown[]) => {
    const out = parse.apply(JSON, a);
    if (typeof a[0] === 'string' && a[0].length >= BIG) knobs.probe?.('JSON.parse');
    return out;
  };
  TextEncoder.prototype.encode = function (this: TextEncoder, input?: string) {
    const out = encode.call(this, input);
    if (out.byteLength >= BIG) knobs.probe?.('TextEncoder');
    return out;
  };
  TextDecoder.prototype.decode = function (this: TextDecoder, ...a: Parameters<TextDecoder['decode']>) {
    const out = decode.apply(this, a);
    if (out.length >= BIG) knobs.probe?.('TextDecoder');
    return out;
  };
  return () => {
    J.stringify = stringify;
    J.parse = parse;
    TextEncoder.prototype.encode = encode;
    TextDecoder.prototype.decode = decode;
  };
}

interface Op<A> {
  setup(): A | Promise<A>;
  run(a: A): Promise<unknown>;
  check?(out: unknown, a: A): void;
  teardown?(a: A): void;
  gzip?(a: A): number;
  count?(out: unknown, a: A): number;
}

async function measure<A>(op: Op<A>, reps = REPS): Promise<Result> {
  const cpu: number[] = [];
  const wall: number[] = [];
  const jsCpu: number[] = [];
  const runs: Phase[][] = [];
  for (let i = 0; i < reps; i++) {
    const a = await op.setup();
    await settle();
    const marks: { label: string; c: NodeJS.CpuUsage; t: number }[] = [];
    knobs.mark = (label) => marks.push({ label, c: process.cpuUsage(), t: performance.now() });
    const j0 = process.threadCpuUsage();
    const c0 = process.cpuUsage();
    const t0 = performance.now();
    const out = await op.run(a);
    const t = performance.now() - t0;
    const c = process.cpuUsage(c0);
    const j = process.threadCpuUsage(j0);
    knobs.mark = null;
    op.check?.(out, a);
    op.teardown?.(a);
    wall.push(t);
    cpu.push((c.user + c.system) / 1000);
    jsCpu.push((j.user + j.system) / 1000);
    const phases: Phase[] = [];
    let prev = { c: c0, t: t0 };
    for (const m of [...marks, { label: 'fim', c: { user: c0.user + c.user, system: c0.system + c.system }, t: t0 + t }]) {
      phases.push({ label: m.label, cpu: (m.c.user - prev.c.user + m.c.system - prev.c.system) / 1000, wall: m.t - prev.t });
      prev = m;
    }
    runs.push(phases);
  }
  const mid = cpu.indexOf(median(cpu));
  // A rodada instrumentada: a sonda (gc() e process.memoryUsage()) nos pontos pesados, e as linhas gravadas.
  const a = await op.setup();
  const unhook = hookBig();
  gc();
  gc();
  const m0 = process.memoryUsage();
  const base = m0.heapUsed + m0.external;
  let live = base;
  let occupied = base;
  let where = '—';
  const liveAt: Record<string, number> = {};
  knobs.probe = (label) => {
    const before = process.memoryUsage();
    occupied = Math.max(occupied, before.heapUsed + before.external);
    gc();
    const after = process.memoryUsage();
    liveAt[label] = Math.max(liveAt[label] ?? 0, (after.heapUsed + after.external - base) / MB);
    if (after.heapUsed + after.external > live) {
      live = after.heapUsed + after.external;
      where = label;
    }
  };
  counting = { n: 0 };
  let out: unknown;
  try {
    out = await op.run(a);
    knobs.probe?.('resposta'); // o que a operação devolve (a página do sync), ainda vivo
  } finally {
    knobs.probe = null;
    unhook();
  }
  const rows = counting.n;
  counting = null;
  op.check?.(out, a);
  const gzip = op.gzip ? op.gzip(a) : null;
  const count = op.count ? op.count(out, a) : null;
  op.teardown?.(a);
  return {
    cpu: median(cpu),
    jsCpu: median(jsCpu),
    phases: runs[mid],
    wall: median(wall),
    live: (live - base) / MB,
    occupied: (occupied - base) / MB,
    where,
    liveAt,
    rows,
    gzip,
    count,
    reps,
  };
}

const fits = (r: Result): boolean => r.cpu <= CPU_LIMIT_MS && r.live <= MEM_LIMIT_MB;

// --- As operações ---

const NOW = (): number => T0;
const RESTORED = dayOf(T0 - DAY); // o nome da cópia restaurada: a de ontem

// A cópia diária (takeSnapshot, pelo snapshot() público): ler as linhas, montar o arquivo, gzip, a reserva no D1 e o put no R2.
const copyOp = (a: Account): Op<Account> => ({
  setup: () => {
    a.sql.db.exec("DELETE FROM state WHERE key = 'snapshotRev'"); // senão a cópia de hoje já foi feita
    return a;
  },
  run: (x) => x.store.snapshot(NOW()),
  check: (out) => expect(out).toBe(true),
  gzip: (x) => x.r2.lastPut,
  count: (_o, x) => x.rows,
});

// Um pedido do sync (syncBatch de verdade): `changes` sobe, e volta a página de `page` desde o cursor.
const syncOp = (a: Account, o: { changes: number; page: number; cursor: 'zero' | 'head'; kind?: 'novo' | 'edição' | 'exclusão' }): Op<Account> => {
  let changes: Change[] = [];
  return {
    setup: () => {
      reset(a);
      knobs.page = o.page;
      const kind = o.kind ?? 'novo';
      if (kind === 'novo') changes = newSolves(a, o.changes, 'novo');
      else if (kind === 'edição') changes = a.sample.slice(0, o.changes).map((c) => ({ ...c, data: { ...(c.data as object), note: 'editado' }, updatedAt: T0 }));
      else changes = a.sample.slice(0, o.changes).map((c) => ({ ...c, updatedAt: T0, deletedAt: T0, deletionStamp: T0 }));
      return a;
    },
    run: (x) => x.store.syncBatch(USER, request(changes, o.cursor === 'zero' ? 0 : x.rev), NOW()),
    check: (out) => {
      const res = out as { accepted: number; rejected: unknown[]; changes: unknown[] };
      expect(res.rejected).toEqual([]);
      expect(res.accepted).toBe(o.changes);
      if (o.cursor === 'zero') expect(res.changes.length).toBe(o.page);
    },
    teardown: () => {
      knobs.page = null;
    },
    count: () => o.changes,
  };
};

// A contagem inicial dos ativos (usage() sem os contadores no estado): COUNT_ACTIVE e STORED_BYTES, dentro da transação, como no primeiro
// syncBatch de uma conta de antes da Task 4.
const countOp = (a: Account): Op<Account> => ({
  setup: () => {
    reset(a);
    a.sql.db.exec("DELETE FROM state WHERE key IN ('active', 'bytes')");
    return a;
  },
  run: async (x) => x.ctx.storage.transactionSync(() => inside(x.store).usage(NOW())),
  check: (_o, x) => expect(inside(x.store).getState('active')).not.toBeNull(),
});

// O primeiro despertar de uma conta do beta depois do deploy (b): o objeto nasce (migrate: RECORDS_SCHEMA sobre a tabela que já existe,
// e só records_tombs é novo; records_rev e records_parent já vêm do 5a) e o primeiro pedido conta os ativos e os bytes.
const wakeOp = (a: Account): Op<Account> => ({
  setup: () => {
    reset(a);
    a.sql.db.exec('DROP INDEX IF EXISTS records_tombs');
    a.sql.db.exec("DELETE FROM state WHERE key IN ('active', 'bytes')");
    return a;
  },
  run: async (x) => {
    const store = new AccountStore(x.ctx, x.env);
    return x.ctx.storage.transactionSync(() => inside(store).usage(NOW()));
  },
  check: (_o, x) => expect(x.sql.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'records_tombs'").get()).toBeDefined(),
});

// Uma conta nova, com a cópia de ontem (o arquivo dela, gzip) no R2 falso: a restauração regrava tudo o que a cópia tem.
async function withCopy(n: number): Promise<Account> {
  const a = buildAccount(n);
  a.r2.objects.set(snapshotKey(USER, RESTORED), await gzipJson(exportFromRecords(inside(a.store).all(), T0 - DAY)));
  return a;
}

// A restauração como está (restoreSnapshot de verdade). O orçamento do dia sobe até não contar: acima de 20 mil mudanças ela seria
// 'too-big' antes de gravar, e a medição quer o custo de restaurar a conta inteira.
const restoreOp = (n: number, way: 'como está' | 'alternativa'): Op<Account> => ({
  setup: async () => {
    knobs.budget = Number.MAX_SAFE_INTEGER;
    return withCopy(n);
  },
  run: (a) => (way === 'como está' ? a.store.restoreSnapshot(RESTORED, NOW()) : restoreRecomputing(a.store, RESTORED, NOW())),
  check: (out) => expect(out).toBe('ok'),
  teardown: (a) => {
    knobs.budget = null;
    a.close();
  },
  gzip: (a) => a.r2.lastPut,
  count: () => knobs.applied,
});

// A alternativa da restauração (c): restoreSnapshot com uma diferença só. Antes do put, só a contagem das mudanças (as conferências do
// orçamento precisam dela); a lista é montada de novo dentro da gravação. Assim ela e a cópia de antes (o arquivo e o gzip) nunca ficam
// vivas juntas. O resto, na mesma ordem do objeto (account-store.ts, restoreSnapshot).
function restoreRecomputing(store: AccountStore, name: string, now: number): Promise<string> {
  const s = inside(store);
  return s.exclusive(async () => {
    if (s.deleted()) return 'deleted';
    const restores = s.dayCount('restores', now);
    if (restores.n >= RESTORES_PER_DAY) return 'restore-limit';
    const userId = s.getState('userId');
    if (userId === null) return 'not-found';
    const { list, at } = s.copies();
    if (list !== null && now - at < COPIES_CACHE_MS && !list.some((c) => c.name === name)) return 'not-found';
    const caps = capsOf(s.env);
    if (!(await takeOps(s.env.DB, 'B', 2, now, caps.classBMonth))) return 'r2-budget';
    const object = await s.env.SNAPSHOTS.get(snapshotKey(userId, name));
    if (!object) {
      s.renewCopies();
      return 'not-found';
    }
    const copy = (await gunzipJson(await object.arrayBuffer())) as KlickExport;
    const current = s.all();
    const stamp = current.reduce((max, c) => Math.max(max, c.updatedAt + 1, c.deletionStamp + 1), now);
    const practice = Array.isArray(copy.practice) ? copy.practice : null;
    const input = { sessions: copy.sessions, solves: copy.solves, practice };
    const prefs = accountPrefsOf(copy.profile);
    const count = restoreChanges(current, input, prefs, stamp).length; // só a contagem
    if (count > DAILY_WRITE_BUDGET) return 'too-big';
    if (count > DAILY_WRITE_BUDGET - s.dayCount('writes', now).n) return 'write-budget';
    const key = snapshotKey(userId, preRestoreName(now));
    if ((await s.env.SNAPSHOTS.head(key)) === null) {
      const before = exportFromRecords(current, now);
      const gz = await gzipJson(before);
      const refused = await reserveCopy(s.env.DB, gz.byteLength, now, caps);
      if (refused !== null) return refused === 'space' ? 'no-room' : 'r2-budget';
      const solves = String(before.solves.filter((x) => x.deletedAt === null).length);
      await s.env.SNAPSHOTS.put(key, gz, { customMetadata: { kind: 'pre-restore', day: dayOf(now), solves } });
      s.renewCopies();
    }
    s.ctx.storage.transactionSync(() => {
      const usage = s.usage(now);
      const batch = s.batch();
      const changes = restoreChanges(current, input, prefs, stamp); // de novo, dentro da gravação
      s.commit(applyChanges(batch.view, changes, { mode: 'server' }), batch, usage);
      s.setState('restores', JSON.stringify({ day: restores.day, n: restores.n + 1 }));
    });
    return 'ok';
  });
}

// A compactação de um alarme (compact(), privada): COMPACTABLE e os UPDATE, no máximo COMPACT_PER_DAY (ou `limit`).
const compactOp = (n: number, limit: number | null = null): Op<Account> => ({
  setup: () => {
    knobs.compact = limit;
    return buildAccount(n);
  },
  run: async (a) => inside(a.store).compact(NOW()),
  check: (out, a) => expect(out).toBe(Math.min(limit ?? COMPACT_PER_DAY, a.due)),
  teardown: (a) => {
    knobs.compact = null;
    a.close();
  },
  count: (out) => out as number,
});

// O alarme inteiro (alarm(), público): a compactação, a cópia do dia e o próximo alarme, numa invocação só.
const alarmOp = (n: number): Op<Account> => ({
  setup: () => buildAccount(n),
  run: (a) => a.store.alarm(),
  check: (_o, a) => expect(inside(a.store).getState('snapshotRev')).toBe(String(a.rev)),
  teardown: (a) => a.close(),
  gzip: (a) => a.r2.lastPut,
});

// --- O documento ---

const nf = (v: number, digits = 0): string => v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ms = (v: number): string => nf(v, v < 10 ? 2 : 1);
const mb = (v: number): string => nf(Math.max(0, v), 1);
const kb = (v: number | null): string => (v === null ? '—' : nf(v / 1024));
const mark = (r: Result): string => (fits(r) ? 'cabe' : 'não cabe');
const code = (v: number): string => (v >= 10_000 ? v.toLocaleString('en-US').replaceAll(',', '_') : String(v)); // como no código

interface Line {
  n: number;
  rows: number;
  r: Result;
}

function table(lines: Line[], o: { gzip?: boolean; count?: string; where?: boolean } = {}): string {
  const head = ['Solves', 'Registros', 'CPU (ms)', 'CPU do JS (ms)', 'Relógio (ms)', 'Memória viva (MB)', 'Ocupada (MB)'];
  if (o.gzip) head.push('Gzip (KB)');
  if (o.count) head.push(o.count);
  head.push('Linhas gravadas');
  if (o.where) head.push('Pico vivo em');
  head.push('');
  const out = [`| ${head.join(' | ')} |`, `|${head.map((h) => (h === 'Solves' || h === '' || h === 'Pico vivo em' ? ' --- ' : ' ---: ')).join('|')}|`];
  for (const { n, rows, r } of lines) {
    const cells = [nf(n), nf(rows), ms(r.cpu), ms(r.jsCpu), ms(r.wall), mb(r.live), mb(r.occupied)];
    if (o.gzip) cells.push(kb(r.gzip));
    if (o.count) cells.push(r.count === null ? '—' : nf(r.count));
    cells.push(nf(r.rows));
    if (o.where) cells.push(r.where);
    cells.push(mark(r));
    out.push(`| ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}

// O nome de cada etapa (a função em que ela termina), na cópia e na restauração.
const COPY_PHASES: Record<string, string> = {
  SELECT: 'SELECT * FROM records (todas as linhas)',
  exportFromRecords: 'rowToChange de cada linha e exportFromRecords',
  gzipJson: 'gzipJson (JSON.stringify, TextEncoder, gzip)',
  'put no R2': 'a reserva no D1 e o put no R2',
  fim: 'o estado da cópia (snapshotRev, o dia, a lista)',
};
const RESTORE_PHASES: Record<string, string> = {
  'get no R2': 'o get no R2 (os bytes da cópia)',
  gunzipJson: 'gunzipJson (gunzip, TextDecoder, JSON.parse)',
  SELECT: 'SELECT * FROM records (todas as linhas)',
  restoreChanges: 'rowToChange de cada linha e restoreChanges',
  exportFromRecords: 'exportFromRecords (a cópia de antes)',
  gzipJson: 'gzipJson da cópia de antes',
  'put no R2': 'a reserva no D1 e o put da cópia de antes',
  applyChanges: 'applyChanges (checkChange, um SELECT por registro, merge)',
  fim: 'write() e os contadores, e o COMMIT',
};

// As etapas da menor e da maior conta, lado a lado (a mesma sequência de funções nas duas).
function phaseTable(lines: Line[], names: Record<string, string>): string {
  const small = lines[0];
  const big = lines[lines.length - 1];
  const out = [`| Etapa (até o fim de) | CPU a ${nf(small.n)} (ms) | CPU a ${nf(big.n)} (ms) | Relógio a ${nf(big.n)} (ms) |`, '| --- | ---: | ---: | ---: |'];
  big.r.phases.forEach((p, i) => {
    const s = small.r.phases[i];
    out.push(`| ${names[p.label] ?? p.label} | ${s && s.label === p.label ? ms(s.cpu) : '—'} | ${ms(p.cpu)} | ${ms(p.wall)} |`);
  });
  return out.join('\n');
}

// O maior N que cabe, contando de baixo até o primeiro que não cabe (um que cabe depois de um que não cabe é ruído, não folga).
function largest(lines: Line[]): Line | null {
  let best: Line | null = null;
  for (const l of lines) {
    if (!fits(l.r)) break;
    best = l;
  }
  return best;
}

it(
  'uma conta de 100 mil solves no plano gratuito',
  async () => {
    expect(typeof gc).toBe('function');
    const started = performance.now();
    const ops = {
      copia: [] as Line[],
      restauracao: [] as Line[],
      alternativa: [] as Line[],
      envio: [] as Line[],
      recebimento: [] as Line[],
      contagem: [] as Line[],
      despertar: [] as Line[],
      compactacao: [] as Line[],
      alarme: [] as Line[],
    };

    // O aquecimento: cada operação algumas vezes numa conta pequena, descartadas (o código frio do V8 não entra na mediana de 1 mil).
    {
      const a = buildAccount(SIZES[0]);
      for (const op of [copyOp(a), syncOp(a, { changes: 500, page: 500, cursor: 'zero' }), syncOp(a, { changes: 0, page: 500, cursor: 'zero' }), countOp(a), wakeOp(a)]) {
        await measure(op as Op<Account>);
      }
      a.close();
      await measure(restoreOp(SIZES[0], 'como está'));
      await measure(restoreOp(SIZES[0], 'alternativa'));
      await measure(compactOp(SIZES[0]));
      await measure(alarmOp(SIZES[0]));
    }

    const dues = new Map<number, number>();
    for (const n of SIZES) {
      const a = buildAccount(n);
      dues.set(n, a.due);
      const line = (r: Result): Line => ({ n, rows: a.rows, r });
      ops.copia.push(line(await measure(copyOp(a))));
      ops.envio.push(line(await measure(syncOp(a, { changes: 500, page: 500, cursor: 'zero' }))));
      ops.recebimento.push(line(await measure(syncOp(a, { changes: 0, page: 500, cursor: 'zero' }))));
      ops.contagem.push(line(await measure(countOp(a))));
      ops.despertar.push(line(await measure(wakeOp(a))));
      a.close();
      ops.restauracao.push(line(await measure(restoreOp(n, 'como está'))));
      ops.alternativa.push(line(await measure(restoreOp(n, 'alternativa'))));
      ops.compactacao.push(line(await measure(compactOp(n))));
      ops.alarme.push(line(await measure(alarmOp(n))));
    }

    // A 100 mil: o envio e o recebimento por pedido menor, e a compactação por alarme menor.
    const big = buildAccount(BIGGEST);
    const envioPages = new Map<number, Result>();
    const recebimentoPages = new Map<number, Result>();
    for (const p of PAGES) {
      envioPages.set(p, p === 500 ? ops.envio.at(-1)!.r : await measure(syncOp(big, { changes: p, page: p, cursor: 'zero' })));
      recebimentoPages.set(p, p === 500 ? ops.recebimento.at(-1)!.r : await measure(syncOp(big, { changes: 0, page: p, cursor: 'zero' })));
    }
    const compacts = new Map<number, Result>();
    for (const c of COMPACTS) compacts.set(c, c === COMPACT_PER_DAY ? ops.compactacao.at(-1)!.r : await measure(compactOp(BIGGEST, c)));

    // (a) As linhas gravadas por tipo de mudança, num pedido de 500 (sem página de volta que conte: o recebimento não grava registro).
    const kinds = buildAccount(KINDS_AT);
    const kindRows = new Map<string, Result>();
    for (const kind of ['novo', 'edição', 'exclusão'] as const) {
      kindRows.set(kind, await measure(syncOp(kinds, { changes: 500, page: 500, cursor: 'head', kind }), 1));
    }
    kindRows.set('vazio', await measure(syncOp(kinds, { changes: 0, page: 500, cursor: 'head' }), 1));
    kinds.close();
    const compactKind = await measure(compactOp(KINDS_AT), 1);

    // Os vereditos.
    const pick = (m: Map<number, Result>): number | null => [...m.entries()].find(([, r]) => fits(r))?.[0] ?? null;
    const writesPer = pick(envioPages);
    const pullPer = pick(recebimentoPages);
    // Sem nenhum tamanho que caiba a 100 mil, o sync de 50 nas contas menores (a cota desce para a maior em que ele cabe).
    const fallbackSync = async (changes: number): Promise<Line[]> => {
      const lines: Line[] = [];
      for (const n of SIZES) {
        const a = buildAccount(n);
        lines.push({ n, rows: a.rows, r: await measure(syncOp(a, { changes, page: 50, cursor: 'zero' })) });
        a.close();
      }
      return lines;
    };
    const envio50 = writesPer === null ? await fallbackSync(50) : null;
    const recebimento50 = pullPer === null ? await fallbackSync(0) : null;
    // O pedido do primeiro sync com os dois valores, quando eles saem diferentes: o envio de um e a página do outro no mesmo pedido. Se não
    // couber, a página desce até caber junto com o envio (no tamanho do envio, cabe: é a medição do envio).
    const combined = new Map<number, Result>();
    let pullPage = pullPer;
    if (writesPer !== null && pullPer !== null && writesPer !== pullPer) {
      for (const p of PAGES.filter((x) => x <= pullPer)) {
        const r = p === writesPer ? envioPages.get(p)! : await measure(syncOp(big, { changes: writesPer, page: p, cursor: 'zero' }));
        combined.set(p, r);
        if (fits(r)) {
          pullPage = p;
          break;
        }
      }
    }
    big.close();

    const copyBest = largest(ops.copia);
    const restoreBest = largest(ops.restauracao);
    const altBest = largest(ops.alternativa);
    const countBest = largest(ops.contagem);
    const wakeBest = largest(ops.despertar);
    const alarmBest = largest(ops.alarme);
    const compactBest = [...compacts.entries()].find(([, r]) => fits(r))?.[0] ?? null;
    const all100 = (lines: Line[]) => fits(lines.at(-1)!.r) && largest(lines)?.n === BIGGEST;
    const upTo = (l: Line | null): string => (l ? `cabe até ${nf(l.n)} solves` : 'nenhuma conta medida cabe');
    // O maior N pela memória só, contando de baixo como em largest().
    const memText = (l: Line | null): string => (l ? `${nf(l.n)} solves` : 'nenhuma conta medida');
    const memOnly = (lines: Line[]): Line | null => {
      let best: Line | null = null;
      for (const l of lines) {
        if (l.r.live > MEM_LIMIT_MB) break;
        best = l;
      }
      return best;
    };
    // Quantos registros caberiam pela CPU por registro da menor conta: uma conta linear, que põe o custo fixo nos registros (estimativa, não
    // medida).
    const perRecord = (lines: Line[]): string =>
      `Nenhuma conta medida cabe: a menor, de ${nf(lines[0].n)} solves, gasta ${ms(lines[0].r.cpu)} ms. Pela CPU por registro dela, caberiam uns ${nf(Math.floor((CPU_LIMIT_MS * lines[0].rows) / lines[0].r.cpu))} registros (uma estimativa linear, não medida).`;
    // O valor escolhido perto da linha: a regra o aceita, mas a margem é pequena.
    const close = (r: Result | undefined): string => (r && r.cpu > CPU_LIMIT_MS * 0.8 ? ` Na linha: ${ms(r.cpu)} ms de CPU nesse tamanho.` : '');

    const v = {
      copia: all100(ops.copia) ? 'cabe' : `não cabe → SNAPSHOT_MAX_RECORDS = ${copyBest ? code(copyBest.rows) : '0'}`,
      restauracao: all100(ops.restauracao) ? 'cabe' : `não cabe → RESTORE_MAX_RECORDS = ${restoreBest ? code(restoreBest.rows) : '0'}`,
      envio:
        writesPer === 500
          ? 'cabe'
          : writesPer !== null
            ? `não cabe → MAX_WRITES_PER_REQUEST = ${writesPer}`
            : `não cabe → ACCOUNT_LIMITS.solves = ${code(largest(envio50!)?.n ?? 0)} (com 50 por pedido)`,
      recebimento:
        pullPer === 500
          ? 'cabe'
          : pullPer !== null
            ? `não cabe → PULL_PAGE = ${pullPer}`
            : `não cabe → ACCOUNT_LIMITS.solves = ${code(largest(recebimento50!)?.n ?? 0)} (com 50 por pedido)`,
      contagem: all100(ops.contagem) ? 'cabe' : `não cabe → ${upTo(countBest)}`,
      despertar: all100(ops.despertar) ? 'cabe' : `não cabe → ${upTo(wakeBest)}`,
      compactacao: compactBest === COMPACT_PER_DAY ? 'cabe' : `não cabe → COMPACT_PER_DAY = ${compactBest === null ? '0 (nenhum dos medidos)' : code(compactBest)}`,
      alarme: all100(ops.alarme) ? 'cabe' : `não cabe → ${upTo(alarmBest)}`,
    };

    // (a) As contas das linhas.
    const perChange = (k: string) => (kindRows.get(k)!.rows - kindRows.get('vazio')!.rows) / 500;
    const worstPerChange = Math.max(perChange('novo'), perChange('edição'), perChange('exclusão'));
    const rowsBudget = Math.floor(SHARED_ROWS_PER_DAY * ACCOUNT_SHARE);
    const changesBudget = Math.floor(rowsBudget / worstPerChange);
    const restoreRowsPerRecord = ops.restauracao.at(-1)!.r.rows / ops.restauracao.at(-1)!.r.count!;
    const everythingFits = Object.values(v).every((x) => x === 'cabe');

    const dueText = SIZES.map((n) => `${nf(dues.get(n) ?? 0)} a ${nf(n)}`).join(', ');
    const fullFrom = SIZES.find((n) => (dues.get(n) ?? 0) >= COMPACT_PER_DAY);
    const minutes = (performance.now() - started) / 60_000;
    const cpu = cpus();
    const fmtLimit = `CPU ≤ ${CPU_LIMIT_MS} ms e memória viva ≤ ${MEM_LIMIT_MB} MB`;

    const doc = `# Klick — uma conta de 100 mil solves no plano gratuito (medição)

Data: ${new Date(T0).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })}. A Task 11 do plano do endurecimento da conta (spec 4.4 e 7.2): quanto custam, em CPU, relógio, memória e linhas gravadas, as operações pesadas do objeto de uma conta, de 1 mil a 100 mil solves, e se cada uma cabe no plano gratuito da Cloudflare. O veredito decide se a Task 12 (os tamanhos que cabem) roda.

Este arquivo é escrito pela própria medição (\`app/tests/perf/account-100k.perf.ts\`, com \`./node_modules/.bin/vitest run -c vitest.perf.config.ts\` em \`app/\`). Não edite à mão: rode de novo.

- Máquina: ${cpu[0]?.model ?? '?'} (${cpu.length} núcleos), ${nf(totalmem() / 1024 ** 3)} GB, Darwin ${release()}. O Mac é dividido com outras sessões: a carga delas entra no relógio, e um pouco na CPU.
- Node ${process.version}, SQLite ${process.versions.sqlite} (\`node:sqlite\`), V8 ${process.versions.v8}.
- A medição levou ${nf(minutes, 1)} min. Cada operação rodou ${REPS} vezes por conta (fica a mediana), mais uma rodada instrumentada para a memória e as linhas gravadas.

## 1. Os vereditos

A regra (Task 11): o grátis dá 10 ms de CPU por pedido e 128 MB; a medição no Node conta metade, para a diferença do workerd e do SQLite do objeto. **Cabe se ${fmtLimit}.** Por operação: (a) envio ou recebimento a 100 mil que não cabe → o maior de {500, 250, 100, 50} por pedido que cabe; se nem 50 cabe, \`ACCOUNT_LIMITS.solves\` desce para o maior N em que o sync cabe (o único caso da spec 7.2 em que a cota baixa); (b) cópia → \`SNAPSHOT_MAX_RECORDS\` = o maior N medido que cabe (0 se nenhum); (c) restauração → \`RESTORE_MAX_RECORDS\` do mesmo jeito. Tudo cabendo a 100 mil, a Task 12 não roda.

"O maior N que cabe" conta de baixo para cima e para no primeiro que não cabe. O valor das constantes da Task 12 vem em **registros do objeto** (sessões, solves, treino e ajustes), que é o que o objeto conta antes de copiar ou restaurar; a coluna "Solves" diz de que conta ele saiu.

| Operação | Veredito |
| --- | --- |
| Cópia diária | \`${v.copia}\` |
| Restauração | \`${v.restauracao}\` |
| Envio do primeiro sync | \`${v.envio}\` |
| Recebimento (uma página) | \`${v.recebimento}\` |
| Contagem inicial dos ativos | \`${v.contagem}\` |
| (b) Primeiro despertar de uma conta do beta | \`${v.despertar}\` |
| (d) Compactação de um alarme (${nf(COMPACT_PER_DAY)} solves) | \`${v.compactacao}\` |
| (d) O alarme inteiro (compactação, cópia e o próximo alarme) | \`${v.alarme}\` |

${everythingFits ? '**Tudo cabe a 100 mil: a Task 12 não roda.**' : '**Alguma operação não cabe: a Task 12 roda, com os valores da seção 10.**'}

## 2. O que se mede, e o que um número do Node quer dizer

Dentro do workerd o relógio não anda enquanto o pedido usa CPU (\`Date.now()\` e \`performance.now()\` ficam parados), então a CPU de um pedido só se mede fora dele. Aqui, o objeto da conta de verdade (\`worker/account-store.ts\`, a mesma classe) roda no Node: o import de \`cloudflare:workers\` vira uma casca com o \`ctx\` e o \`env\`, o banco é um \`node:sqlite\` em memória com o mesmo esquema (\`RECORDS_SCHEMA\`) e o mesmo SQL (\`worker/records-sql.ts\`), e o D1 e o R2 são falsos (a reserva no D1 sempre passa; o R2 guarda o arquivo). As funções do núcleo são as de sempre (\`applyChanges\`, \`restoreChanges\`, \`exportFromRecords\`, \`accountPrefsOf\`), e o gzip é o \`CompressionStream\` do Node, pelo \`gzipJson\` de \`worker/snapshots.ts\`.

**O Node não é o workerd.** Outra CPU (um ${cpu[0]?.model ?? '?'} de mesa, não o servidor da Cloudflare), outro build do V8, e o SQLite do objeto grava em disco e confirma a transação de outro jeito. Contar metade dos limites é uma margem para essa diferença, não uma conversão: um número entre a metade e o limite (2,5 a 5 ms, 32 a 64 MB) não prova que cabe, e um número acima não prova que estoura. A Cloudflare também não corta exatamente no milissegundo. O veredito é a regra aplicada aos números daqui, e nada além disso.

- **CPU**: \`process.cpuUsage()\` antes e depois da operação (usuário + sistema), mediana de ${REPS} rodadas. É a CPU do processo inteiro: entram as linhas auxiliares do V8 (o GC concorrente, o compilador) e a do zlib do \`CompressionStream\` (no Node ele roda no pool de threads). É o número da regra. Antes de cada rodada, um \`gc()\` e 50 ms de espera (fora da conta) limpam o lixo da montagem e deixam o V8 terminar de varrer.
- **CPU do JS**: \`process.threadCpuUsage()\`, só a linha que roda o código do objeto, mediana. Fica de fora o que o V8 faz nas outras linhas e o gzip (no pool de threads do Node). Não decide nada: mostra quanto da CPU do processo é do código do objeto. Quando a CPU passa do relógio, a diferença é dessas outras linhas.
- **Relógio**: \`performance.now()\`, mediana. No Node, sem rede: o D1 e o R2 respondem na hora.
- **Memória viva**: numa rodada à parte, uma sonda chama \`gc()\` e lê \`process.memoryUsage()\` (heap usado + memória externa, onde ficam os ArrayBuffers) nos pontos pesados do caminho: depois de cada \`SELECT\` de 50 linhas ou mais, de cada gravação no estado (o fim de \`write()\`, com o lote inteiro vivo), de \`applyChanges\`, \`restoreChanges\`, \`exportFromRecords\`, \`gzipJson\`, \`gunzipJson\`, do get e do put no R2, e logo depois de cada \`JSON.stringify\`, \`JSON.parse\`, \`TextEncoder.encode\` e \`TextDecoder.decode\` de 256 KB ou mais (os textos e bytes do arquivo da cópia, que aparecem e somem dentro de uma função), e no fim, com o que a operação devolve ainda vivo (a página do sync). O número é o maior vivo nessas sondas menos o de antes da operação (também depois de \`gc()\`). Entre duas sondas pode haver um pico um pouco maior que nenhuma pegou: é um piso bem apertado, não um teto.
- **Ocupada**: nas mesmas sondas, o heap + externa **antes** do \`gc()\`, menos o de antes da operação: o que o V8 segurava naquele instante, lixo incluído. Não decide nada (o V8 coleta antes de desistir), mas mostra a pressão.
- O limite de 128 MB vale para o isolate (heap do V8 e memória externa). O banco do objeto não entra em nenhum dos dois números: no Node ele mora no \`node:sqlite\`, fora do heap; se o cache de páginas do SQLite do objeto conta nos 128 MB do workerd, esta medição não sabe.
- **Gzip**: o tamanho do arquivo gravado no R2.
- **Linhas gravadas**: a soma, na rodada instrumentada, pela regra da seção 9 (a), conferida no workerd. É o que o grátis conta (100 mil por dia, somadas entre todas as contas).

## 3. As contas medidas

N ∈ {${SIZES.map((n) => nf(n)).join(', ')}} solves, mais 20 sessões, N/10 tentativas do treino e os ${ops.copia[0].rows - SIZES[0] - 20 - SIZES[0] / 10} ajustes padrão da conta (\`prefsFromProfile\` com \`withDefaults\`). Os solves se espalham pelo último ano, nas 20 sessões, com o formato do app: id de 17 caracteres, embaralhamento de 20 movimentos, tempo de 8 a 30 s, 2% com +2, 1% com DNF, 1% com nota. Um em cada dez está na lixeira (apagado uma hora depois do solve, com o conteúdo): os de mais de 30 dias são o que a compactação tira (${dueText}). A conta já tem os contadores da Task 4 no estado (os ativos e os bytes) e o alarme da cópia marcado. Cada conta é montada direto no banco, fora da conta.

## 4. A cópia diária

\`takeSnapshot\` (pelo \`snapshot()\` do objeto): ler todas as linhas, \`exportFromRecords\`, \`gzipJson\`, a reserva no D1 e o put no R2. A cópia leva os solves da lixeira com o conteúdo, então o arquivo tem os N solves.

${table(ops.copia, { gzip: true })}

Para onde vai a CPU (a rodada da mediana; cada linha é a CPU desde a de cima até o fim da função dela):

${phaseTable(ops.copia, COPY_PHASES)}

O alarme roda a compactação e a cópia na mesma invocação: o custo dele está na seção 9 (d).

## 5. A restauração

\`restoreSnapshot\` de verdade, restaurando a cópia de ontem da própria conta (o caso comum, e o mais pesado: \`restoreChanges\` regrava cada registro da cópia com a data nova). Na ordem do objeto: o get no R2, \`gunzipJson\`, ler todas as linhas, \`restoreChanges\`, a contagem contra o orçamento, a cópia de antes (\`exportFromRecords\` e \`gzipJson\` das linhas de agora, a reserva e o put), e a gravação (\`applyChanges\` e \`write()\`) numa transação. "Mudanças" é o que \`applyChanges\` leu. O orçamento do dia foi levantado para esta medição: como está, acima de ${nf(DAILY_WRITE_BUDGET)} mudanças ela volta \`too-big\` antes de gravar (depois do gunzip, de ler tudo e de \`restoreChanges\`: a recusa também custa).

${table(ops.restauracao, { gzip: true, count: 'Mudanças', where: true })}

Para onde vai a CPU (como na cópia):

${phaseTable(ops.restauracao, RESTORE_PHASES)}

## 6. O envio do primeiro sync

\`syncBatch\` de verdade, com o pedido que o motor do app manda no primeiro sync de um aparelho: 500 solves novos subindo (numa sessão que existe, com a cota, o teto de bytes pelo \`admit\` e o orçamento do dia) e o cursor 0, então a resposta leva a primeira página de 500. A conta tem 90% dos N solves ativos: a 100 mil, os 500 novos cabem na cota.

${table(ops.envio, { count: 'Mudanças' })}

A ${nf(BIGGEST)}, por tamanho do pedido (o mesmo número subindo e na página de volta, como o \`SYNC_BATCH\` de hoje):

${table(PAGES.map((p) => ({ n: BIGGEST, rows: ops.envio.at(-1)!.rows, r: envioPages.get(p)! })), { count: 'Mudanças' })}
${envio50 ? `\nNem 50 cabe a ${nf(BIGGEST)}. O envio de 50 nas contas menores:\n\n${table(envio50, { count: 'Mudanças' })}\n` : ''}
## 7. O recebimento

\`syncBatch\` sem mudanças, do cursor 0: a página de 500 (\`SELECT ... WHERE rev > ? ORDER BY rev LIMIT 501\` e \`rowToChange\` em cada linha) e a linha do aparelho.

${table(ops.recebimento)}

A ${nf(BIGGEST)}, por tamanho da página:

${table(PAGES.map((p) => ({ n: BIGGEST, rows: ops.recebimento.at(-1)!.rows, r: recebimentoPages.get(p)! })))}
${recebimento50 ? `\nNem 50 cabe a ${nf(BIGGEST)}. A página de 50 nas contas menores:\n\n${table(recebimento50)}\n` : ''}${
      combined.size > 0
        ? `\nO envio e o recebimento saíram diferentes, e o primeiro sync leva os dois no mesmo pedido: ${writesPer} mudanças subindo e a página voltando, a ${nf(BIGGEST)}. A página desce até caber junto com o envio:\n\n${table([...combined.entries()].map(([, r]) => ({ n: BIGGEST, rows: ops.recebimento.at(-1)!.rows, r })))}\n\nPáginas, de cima para baixo: ${[...combined.keys()].join(', ')}. A página que cabe junto com o envio: ${pullPage ?? 'nenhuma'}.\n`
        : ''
    }
## 8. A contagem inicial dos ativos

\`usage()\` de uma conta sem os contadores no estado (uma do beta, de antes da Task 4), na transação do primeiro \`syncBatch\`: \`COUNT_ACTIVE\` e \`STORED_BYTES\` varrem a tabela, e as duas linhas novas do estado são gravadas. Acontece uma vez por conta.

${table(ops.contagem)}

## 9. Os acréscimos das revisões

### (a) Linhas gravadas por mudança

O orçamento do dia (\`DAILY_WRITE_BUDGET = ${nf(DAILY_WRITE_BUDGET)}\`) conta **mudanças**; o grátis conta **linhas gravadas** (${nf(SHARED_ROWS_PER_DAY)} por dia, somadas entre todas as contas), e cada mudança grava a linha do registro, cada entrada de índice que ela toca e as linhas do estado do objeto.

A regra, conferida uma vez no workerd (o \`rowsWritten\` do cursor do SQLite do objeto, num teste descartável fora da suíte, com o \`UPSERT_RECORD\` e o \`COMPACT_SOLVE\` de \`records-sql.ts\`):

| Comando | Linhas gravadas no workerd |
| --- | ---: |
| Registro novo (sessão, solve, tentativa, ajuste) | 4 (a linha, a chave primária, \`records_rev\`, \`records_parent\`) |
| Registro que já existe: editar, mover de sessão, desapagar, restaurar | 3 (a linha, \`records_rev\`, \`records_parent\`: o SET regrava os dois índices mesmo sem mudar o valor) |
| Apagar um solve (fica o conteúdo: entra em \`records_tombs\`) | 4 |
| Editar um solve que está na lixeira (continua em \`records_tombs\`) | 4 |
| Compactar um solve (\`COMPACT_SOLVE\`; sair de \`records_tombs\` não conta) | 1 |
| Linha nova do estado ou dos aparelhos / linha que muda | 2 / 1 |
| \`CREATE INDEX\` numa tabela que existe | uma por entrada do índice, mais 1 |
| \`setAlarm()\` | 1 (tabela de preços da Cloudflare) |

Pedidos de 500 mudanças de cada tipo, numa conta de ${nf(KINDS_AT)} solves (as linhas não dependem do tamanho), com o \`syncBatch\` de verdade:

| Pedido | Linhas gravadas | Por mudança (menos o pedido de só receber, ÷ 500) |
| --- | ---: | ---: |
| 500 solves novos | ${nf(kindRows.get('novo')!.rows)} | ${nf(perChange('novo'), 2)} |
| 500 edições | ${nf(kindRows.get('edição')!.rows)} | ${nf(perChange('edição'), 2)} |
| 500 exclusões (solves ativos para a lixeira) | ${nf(kindRows.get('exclusão')!.rows)} | ${nf(perChange('exclusão'), 2)} |
| Só recebimento (o fixo de um pedido) | ${nf(kindRows.get('vazio')!.rows)} | — |
| Compactação (${nf(compactKind.count ?? 0)} solves num alarme) | ${nf(compactKind.rows)} | ${nf((compactKind.rows) / (compactKind.count || 1), 2)} |
| Restauração a ${nf(BIGGEST)} (${nf(ops.restauracao.at(-1)!.r.count ?? 0)} mudanças) | ${nf(ops.restauracao.at(-1)!.r.rows)} | ${nf(restoreRowsPerRecord, 2)} |

O fixo de um pedido que grava é a revisão, os contadores que mudaram (ativos, bytes, as gravações do dia) e o aparelho: até umas 5 linhas.

**O orçamento em linhas.** Para uma conta ficar em ${nf(ACCOUNT_SHARE * 100)}% ou menos das ${nf(SHARED_ROWS_PER_DAY)} linhas do dia: **${nf(rowsBudget)} linhas por dia por conta**. Contado em mudanças, com a pior (${nf(worstPerChange, 2)} linhas), são ${nf(changesBudget)} mudanças por dia. Hoje, ${nf(DAILY_WRITE_BUDGET)} mudanças de solves novos gravam umas ${nf(DAILY_WRITE_BUDGET * perChange('novo'))} linhas: uma conta só gasta ${nf((DAILY_WRITE_BUDGET * perChange('novo') * 100) / SHARED_ROWS_PER_DAY)}% do dia de todas. Consequências para a Task 12:

- Um primeiro sync de 100 mil solves (um import grande do csTimer) sobe em uns ${nf(Math.ceil(BIGGEST / changesBudget))} dias com ${nf(changesBudget)} mudanças por dia (hoje, ${nf(Math.ceil(BIGGEST / DAILY_WRITE_BUDGET))}).
- A restauração grava ${nf(restoreRowsPerRecord, 1)} linhas por registro e conta inteira no orçamento: com ${nf(rowsBudget)} linhas por dia, a maior que passa tem uns ${nf(Math.floor(rowsBudget / restoreRowsPerRecord))} registros, seja qual for a CPU. Hoje, a de ${nf(DAILY_WRITE_BUDGET)} mudanças grava umas ${nf(DAILY_WRITE_BUDGET * restoreRowsPerRecord)} linhas.
- A compactação já conta no orçamento (uma por solve, uma linha cada). O alarme de cada conta grava ainda o \`setAlarm\` e umas 3 linhas do estado da cópia por dia, fora do orçamento.

### (b) O primeiro despertar de uma conta do beta

O primeiro pedido depois do deploy da Task 4, numa conta que já existia: o objeto nasce (\`migrate()\`: \`RECORDS_SCHEMA\` sobre a tabela que já existe; \`records_rev\` e \`records_parent\` vêm do 5a, só \`records_tombs\` é novo e é montado aqui) e o primeiro \`syncBatch\` conta os ativos e os bytes (\`COUNT_ACTIVE\`, \`STORED_BYTES\`) e grava os dois contadores. A tabela mede o nascimento e a contagem; o pedido em si (envio ou recebimento, seções 6 e 7) vem por cima, na mesma invocação. Contas criadas depois da Task 4 (todas as da raiz) nunca passam por isto.

${table(ops.despertar)}

### (c) O pico de memória da restauração

Como está (desde a Task 5), a contagem das mudanças vem antes do put da cópia de antes, então as linhas de agora (\`current\`), a cópia (\`copy\`), as mudanças (\`changes\`), o arquivo de antes (\`before\`) e o gzip dele ficam vivos juntos. A tabela da seção 5 é esse formato. A alternativa: antes do put, só a contagem (a lista sai logo); dentro da gravação, \`restoreChanges\` de novo. Ela troca memória por CPU (\`restoreChanges\` roda duas vezes).

${table(ops.alternativa, { gzip: true, count: 'Mudanças', where: true })}

Lado a lado. Nos nomes das sondas, "estado" é o fim de \`write()\` (a revisão gravada no estado), com o lote inteiro vivo. "No put" é a sonda do put da cópia de antes no R2: o momento em que, como está, tudo isso está vivo junto. "Pico" é o maior vivo de todas as sondas.

| Solves | No put, como está (MB) | No put, alternativa (MB) | Pico, como está (MB) | Pico, alternativa (MB) | CPU como está (ms) | CPU na alternativa (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${ops.restauracao.map((l, i) => `| ${nf(l.n)} | ${mb(l.r.liveAt['put no R2'] ?? 0)} | ${mb(ops.alternativa[i].r.liveAt['put no R2'] ?? 0)} | ${mb(l.r.live)} (${l.r.where}) | ${mb(ops.alternativa[i].r.live)} (${ops.alternativa[i].r.where}) | ${ms(l.r.cpu)} | ${ms(ops.alternativa[i].r.cpu)} |`).join('\n')}

${
      altBest || restoreBest
        ? `A alternativa cabe até ${altBest ? `${nf(altBest.n)} solves` : 'nenhuma conta medida'}; como está, até ${restoreBest ? `${nf(restoreBest.n)} solves` : 'nenhuma conta medida'}.`
        : 'Nenhuma das duas cabe em nenhuma conta medida (a CPU já passa na menor).'
    } Só pela memória viva (≤ ${MEM_LIMIT_MB} MB), como está caberia até ${memText(memOnly(ops.restauracao))}, e a alternativa até ${memText(memOnly(ops.alternativa))}.

### (d) A compactação de um alarme

\`compact()\`: \`COMPACTABLE\` (pelo índice \`records_tombs\`, só os vencidos, os mais antigos primeiro) e um \`COMPACT_SOLVE\` por solve, no máximo \`COMPACT_PER_DAY\` (${nf(COMPACT_PER_DAY)}), numa transação, com os contadores. "Compactados" é quantos ela tirou: ${fullFrom ? `abaixo de ${nf(fullFrom)} solves, a conta não tem ${nf(COMPACT_PER_DAY)} vencidos` : `nenhuma conta medida tem ${nf(COMPACT_PER_DAY)} vencidos`}.

${table(ops.compactacao, { count: 'Compactados' })}

A ${nf(BIGGEST)}, por limite de um alarme:

${table(COMPACTS.map((c) => ({ n: BIGGEST, rows: ops.compactacao.at(-1)!.rows, r: compacts.get(c)! })), { count: 'Compactados' })}

O alarme inteiro (\`alarm()\`: a compactação, a cópia do dia e o \`setAlarm\` do próximo, numa invocação só, com os limites de um pedido):

${table(ops.alarme, { gzip: true })}

## 10. O que a Task 12 recebe

${
  everythingFits
    ? '**A Task 12 não roda**: todas as operações cabem a 100 mil.'
    : [
        !all100(ops.copia)
          ? `- \`SNAPSHOT_MAX_RECORDS = ${copyBest ? code(copyBest.rows) : 0}\`. ${copyBest ? `É a conta de ${nf(copyBest.n)} solves.` : `${perRecord(ops.copia)} Com 0, nenhuma conta tem cópia do dia.`} Na menor conta, só a linha do JS gasta ${ms(ops.copia[0].r.jsCpu)} ms: o resto é o gzip, que o Node faz no pool de threads (no workerd ele roda no próprio pedido e conta na CPU dele). O alarme soma a compactação à cópia; sem a cópia, ele só compacta (${ms(ops.compactacao.at(-1)!.r.cpu)} ms a ${nf(BIGGEST)}).`
          : '',
        !all100(ops.restauracao)
          ? `- \`RESTORE_MAX_RECORDS = ${restoreBest ? code(restoreBest.rows) : 0}\`. ${restoreBest ? `É a conta de ${nf(restoreBest.n)} solves; acima dele, a restauração é \`too-big\`.` : `${perRecord(ops.restauracao)} Com 0, toda restauração é \`too-big\`.`} A alternativa da seção (c) ${altBest && (!restoreBest || altBest.n > restoreBest.n) ? `deixaria ${code(altBest.rows)}` : 'não muda o valor'}. Com o orçamento em linhas, o teto das linhas também vale (seção 9 (a)).`
          : '',
        writesPer !== 500 ? `- \`MAX_WRITES_PER_REQUEST = ${writesPer ?? 50}\`${writesPer === null ? `, e \`ACCOUNT_LIMITS.solves = ${code(largest(envio50!)?.n ?? 0)}\`` : ''}.${close(writesPer === null ? undefined : envioPages.get(writesPer))}` : '',
        pullPage !== 500 ? `- \`PULL_PAGE = ${pullPage ?? 50}\`${pullPer === null ? `, e \`ACCOUNT_LIMITS.solves = ${code(largest(recebimento50!)?.n ?? 0)}\`` : pullPage !== pullPer ? ` (sozinha, a página de ${pullPer} cabe; junto com o envio de ${writesPer} no mesmo pedido, só a de ${pullPage}: seção 7)` : ''}.${close(pullPage === null ? undefined : (combined.get(pullPage) ?? recebimentoPages.get(pullPage)))}` : '',
        compactBest !== COMPACT_PER_DAY ? `- \`COMPACT_PER_DAY = ${code(compactBest ?? 0)}\` (o maior limite medido que cabe a ${nf(BIGGEST)}).${close(compactBest === null ? undefined : compacts.get(compactBest))}` : '',
        !all100(ops.despertar) || !all100(ops.contagem)
          ? `- Sem constante na Task 12: o primeiro despertar de uma conta do beta (montar \`records_tombs\` e contar os ativos e os bytes) ${upTo(wakeBest)}, e a contagem sozinha ${upTo(countBest)}. Só as contas do beta passam por isso, uma vez, no primeiro pedido depois do deploy; vale conferir o tamanho da maior delas antes do deploy.`
          : '',
        `- \`DAILY_WRITE_BUDGET\` em linhas: **${nf(rowsBudget)} por dia por conta** (${nf(ACCOUNT_SHARE * 100)}% das ${nf(SHARED_ROWS_PER_DAY)} do grátis), ou ${nf(changesBudget)} mudanças se ele continuar contando mudanças (seção 9 (a)).`,
      ]
        .filter(Boolean)
        .join('\n')
}

## 11. Onde a medição se afasta do objeto de verdade

- **\`cloudflare:workers\`**: a classe base do objeto vira uma casca que só guarda o \`ctx\` e o \`env\` (\`tests/perf/cloudflare-workers.ts\`). O resto de \`account-store.ts\` roda como está.
- **O banco**: \`node:sqlite\` em memória, sem disco; \`transactionSync\` é \`BEGIN\`/\`COMMIT\`; o \`exec\` guarda o comando preparado pelo texto, como o do workerd. Fora de uma transação, cada comando se confirma sozinho (no workerd, eles se juntam até o próximo ponto de saída). O cursor devolve as linhas já lidas (\`all()\`), não uma a uma.
- **D1 e R2 falsos**: a reserva de espaço e de operações sempre passa, sem rede; o get devolve os bytes da cópia (uma cópia nova, como um corpo que chega), o put só guarda o tamanho, e o head diz que a cópia de antes não existe. A espera da rede não é CPU do objeto.
- **O pedido chega pronto**: o \`SyncRequest\` é montado fora da conta; no workerd, o objeto ainda desserializa a chamada RPC (as 500 mudanças), e o Worker de fora lê e confere o JSON do pedido numa invocação dele.
- **Três constantes por getter**: \`DAILY_WRITE_BUDGET\` foi levantado só na restauração (seções 5 e (c)), \`SYNC_BATCH\` desce para medir 250, 100 e 50, e \`COMPACT_PER_DAY\` desce para medir os limites menores. Nos outros casos, os valores de verdade.
- **As sondas**: \`applyChanges\`, \`restoreChanges\`, \`exportFromRecords\`, \`gzipJson\` e \`gunzipJson\` passam por um invólucro que chama a sonda depois da função de verdade; o mesmo com \`JSON\`, \`TextEncoder\` e \`TextDecoder\` grandes. As sondas só ligam na rodada instrumentada; as rodadas de CPU e relógio não têm nenhuma.
- **Privados chamados direto**: \`compact()\` (a compactação sem a cópia), \`usage()\` (a contagem inicial e o despertar, numa transação, como no primeiro \`syncBatch\`). A restauração alternativa da seção (c) é código da medição, não do objeto: \`restoreSnapshot\` copiado com a única diferença descrita lá (e a contagem dos solves ativos dos metadados, que no objeto é uma função privada de uma linha, escrita no lugar).
- **O aquecimento**: antes de medir, cada operação roda ${REPS + 1} vezes numa conta de ${nf(SIZES[0])}, descartadas. No workerd, um objeto que acorda frio paga a compilação do código por cima.
- **As linhas gravadas**: contadas pela regra da seção (a), não lidas do SQLite (o \`node:sqlite\` não conta entradas de índice). A regra veio do \`rowsWritten\` do workerd, comando por comando.

## 12. O que esta medição não diz

- O limite de CPU dos Durable Objects no grátis: a página de limites deles diz 30 s por pedido (o padrão) e, no mesmo lugar, que eles têm os limites de CPU por invocação dos Workers do plano; no grátis, 10 ms. A spec adota 10 ms, e a regra também.
- Se o tempo do SQLite conta como CPU do objeto: a Cloudflare diz que a espera de armazenamento não conta; o SQLite do objeto roda na mesma linha do código. Aqui ele conta inteiro.
- O pico entre duas sondas, e a memória do SQLite do objeto (seção 2).
- Contas de verdade: a distribuição dos solves (sessões, notas, embaralhamentos de outros eventos) é a de uma conta inventada, parecida com a do app.
`;

    mkdirSync(path.dirname(DOC), { recursive: true });
    writeFileSync(DOC, doc);
    expect(ops.copia).toHaveLength(SIZES.length);
  },
  600_000,
);
