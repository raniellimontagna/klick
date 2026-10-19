// A medição de uma conta grande no plano gratuito (endurecimento, Task 11; spec 4.4 e 7.2). Fica fora do `pnpm test` e do `test:worker`:
// roda com `vitest run -c vitest.perf.config.ts` e escreve docs/superpowers/measurements/2026-10-17-conta-100k.md, com os números e um
// veredito por operação (a regra está em RULE, logo abaixo).
//
// Por que no Node: dentro do workerd o relógio não anda durante a CPU de um pedido, então a CPU só se mede fora dele. O objeto da conta de
// verdade (worker/account-store.ts) roda aqui, com `cloudflare:workers` trocado por uma casca (cloudflare-workers.ts), sobre um
// node:sqlite em memória com o mesmo esquema e o mesmo SQL (worker/records-sql.ts). O D1 e o R2 são falsos: o que eles fazem é rede, não
// CPU do objeto. Os módulos do núcleo e do Worker passam por vi.mock só para (1) ler quatro constantes por um getter (o orçamento do dia, a
// compactação por alarme, o corte de um pedido e a página do sync), que a medição sobe ou desce em casos marcados, e (2) chamar a sonda de
// memória depois das funções pesadas. Nenhum mock muda o que a função faz. As vars dos tamanhos (SNAPSHOT_MAX_RECORDS, RESTORE_MAX_RECORDS)
// ficam, no env falso, acima da maior conta: a medição quer o custo, e a seção 10 confere os valores aplicados (Task 12).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, loadavg, platform, release, totalmem } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { deserialize, serialize } from 'node:v8';
import { gzipSync } from 'node:zlib';
import { expect, it, vi } from 'vitest';

// As constantes que a medição troca em casos marcados (null: o valor de verdade) e a sonda de memória (null: desligada).
const knobs = vi.hoisted(() => ({
  budget: null as number | null, // DAILY_WRITE_BUDGET
  compact: null as number | null, // COMPACT_PER_DAY
  writes: null as number | null, // MAX_WRITES_PER_REQUEST
  page: null as number | null, // PULL_PAGE e PULL_PAGE_WITH_PUSH
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
    get MAX_WRITES_PER_REQUEST() {
      return knobs.writes ?? real.MAX_WRITES_PER_REQUEST;
    },
    get PULL_PAGE() {
      return knobs.page ?? real.PULL_PAGE;
    },
    get PULL_PAGE_WITH_PUSH() {
      return knobs.page ?? real.PULL_PAGE_WITH_PUSH;
    },
    // O máximo de registros de um pedido num dia (o dia útil) segue o orçamento: levantado, ele não recusa a cascata nem a restauração
    // medidas. O objeto usa recordsPerDay (o menor do orçamento e do teto do ambiente), que o módulo de verdade calcula com o orçamento
    // dele: aqui, com o do botão.
    get RECORDS_PER_DAY() {
      return knobs.budget === null
        ? real.RECORDS_PER_DAY
        : Math.floor((knobs.budget - real.rowsOf(0, real.COMPACT_PER_DAY) - real.REQUEST_ROWS) / real.ROWS_PER_WRITE);
    },
    recordsPerDay(rowsDay: number): number {
      if (knobs.budget === null) return real.recordsPerDay(rowsDay);
      const day = rowsDay > 0 ? Math.min(knobs.budget, rowsDay) : knobs.budget;
      return Math.max(0, Math.floor((day - real.rowsOf(0, real.COMPACT_PER_DAY) - real.REQUEST_ROWS) / real.ROWS_PER_WRITE));
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
import {
  capsOf,
  COMPACT_PER_DAY,
  COPIES_CACHE_MS,
  DAILY_WRITE_BUDGET,
  MAX_SYNC_REQUEST,
  MAX_WRITES_PER_REQUEST,
  PULL_PAGE,
  PULL_PAGE_WITH_PUSH,
  RECORDS_PER_DAY,
  recordsPerDay,
  REQUEST_ROWS,
  RESTORES_PER_DAY,
  rowsOf,
  ROWS_PER_WRITE,
} from '../../worker/limits';
import { COMPACT_SOLVE, COUNT_ACTIVE, RECORDS_SCHEMA, STORED_BYTES, UPSERT_RECORD } from '../../worker/records-sql';
import { dayOf, gunzipJson, gzipJson, preRestoreName, snapshotKey } from '../../worker/snapshots';
import { seeded } from '../unit/sync-random';

// --- A regra (Task 11) e as contas medidas ---

const CPU_LIMIT_MS = 5; // metade dos 10 ms de CPU por pedido do grátis
const MEM_LIMIT_MB = 64; // metade dos 128 MB
const SIZES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000] as const;
const BIGGEST = SIZES[SIZES.length - 1];
const PAGES = [500, 250, 100, 50] as const; // o maior que cabe, para o envio e o recebimento
const COMPACTS = [2_000, 1_000, 500, 250, 100] as const; // os limites da compactação por alarme, medidos em toda conta
const REPS = 3; // as operações pesadas (cópia, restauração, alarme): três vezes, fica a mediana
const LIGHT_REPS = 15; // as leves (mediana abaixo de LIGHT_MS nas três primeiras): quinze vezes, porque a linha dos 5 ms é estreita
const LIGHT_MS = 20;
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
const WRANGLER = path.join(import.meta.dirname, '../../wrangler.jsonc');
const OLD_BUDGET = 20_000; // o orçamento do dia antes da Task 12, em mudanças

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
    // Os aparelhos além de MAX_DEVICES (revisão final): cada um que sai tira a linha e a chave.
    if (query.startsWith('DELETE FROM devices')) return 2 * Number(this.get(query.replace(/^DELETE FROM devices/, 'SELECT count(*) AS n FROM devices'), ...b)?.n);
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
    SNAPSHOT_MAX_RECORDS: '1000000',
    RESTORE_MAX_RECORDS: '1000000',
    ROWS_WRITTEN_DAY_CAP: '1000000000', // o teto de linhas do dia do ambiente: a reserva no D1 falso sempre passa
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
  all(now: number): Change[];
  batch(): Batch;
  usage(now: number): unknown;
  commit(result: Pick<ApplyResult, 'writes' | 'activeDelta'>, batch: Batch, usage: unknown): void;
  dayCount(key: 'writes' | 'restores' | 'attempts' | 'reads', now: number): { day: string; n: number };
  getState(key: string): string | null;
  setState(key: string, value: string): void;
  copies(): { at: number; list: CloudCopy[] | null; paused: CopiesPaused | null; gz: number | null };
  recordCount(limit: number, now: number): number;
  renewCopies(): void;
  deleted(): boolean;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
  compact(now: number): Promise<number>;
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
  doomed: Change; // a sessão que a cascata apaga (a segunda)
  cascaded: number; // os solves ativos dela, que a cascata apaga junto
  doomedTotal: number; // todos os solves dela, ativos ou na lixeira
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
  // A cópia das linhas de agora, fora das consultas do objeto: reset() volta a conta a ela.
  db.exec('CREATE TABLE records_orig AS SELECT * FROM records');
  db.exec('CREATE UNIQUE INDEX records_orig_key ON records_orig (store, id)');
  const sample = records.filter((c) => c.store === 'solves' && c.deletedAt === null).slice(0, 500);
  const doomed = records.find((c) => c.store === 'sessions' && c.id === sessions[1].id)!;
  const cascaded = Number(
    (db.prepare("SELECT count(*) AS n FROM records WHERE store = 'solves' AND parent = ? AND deleted_at IS NULL").get(doomed.id) as { n: number }).n,
  );
  const doomedTotal = Number(
    (db.prepare("SELECT count(*) AS n FROM records WHERE store = 'solves' AND parent = ?").get(doomed.id) as { n: number }).n,
  );
  const due = Number(
    (db.prepare("SELECT count(*) AS n FROM records WHERE store = 'solves' AND deleted_at IS NOT NULL AND data <> '{}' AND deleted_at < ?").get(T0 - TOMBSTONE_KEEP_MS) as { n: number }).n,
  );
  return { n, rows: records.length, rev, sql, ctx, env, r2, alarm, store, session: sessions[0].id, sample, doomed, cascaded, doomedTotal, state, due, close: () => db.close() };
}

// Volta a conta ao estado de quando ficou pronta (não é medido): tira o que foi gravado depois (toda gravação ganha revisão nova), devolve
// da cópia o que essas gravações tinham trocado e o conteúdo que a compactação tirou (ela não muda a revisão), e o estado e os aparelhos.
function reset(a: Account): void {
  const db = a.sql.db;
  db.exec('BEGIN');
  db.prepare('DELETE FROM records WHERE rev > ?').run(a.rev);
  db.exec('INSERT INTO records SELECT o.* FROM records_orig o WHERE NOT EXISTS (SELECT 1 FROM records r WHERE r.store = o.store AND r.id = o.id)');
  db.exec(
    "UPDATE records SET data = (SELECT o.data FROM records_orig o WHERE o.store = 'solves' AND o.id = records.id) WHERE store = 'solves' AND data = '{}'",
  );
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
  cpuMin: number;
  cpuMax: number;
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

// Depois do gc() da montagem, o V8 ainda varre a memória em linhas auxiliares por alguns milissegundos: a CPU delas não é da operação. Dois
// gc() com uma espera entre eles, e outra espera antes de medir. Depois da espera, 10 ms de laço ocupado: um núcleo parado baixa o relógio
// (ou o sistema passa a linha para um núcleo de economia), e a rodada começaria devagar.
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
async function settle(): Promise<void> {
  gc();
  await wait(20);
  gc();
  await wait(60);
  const end = performance.now() + 10;
  while (performance.now() < end) {
    // aquece o núcleo
  }
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
  checkRows?(rows: number, a: A): void; // as linhas gravadas da rodada instrumentada
  teardown?(a: A): void;
  gzip?(a: A): number;
  count?(out: unknown, a: A): number;
}

// As rodadas de CPU e relógio: três; se a mediana delas fica abaixo de LIGHT_MS, a operação é leve e vai a LIGHT_REPS (a linha dos 5 ms é
// estreita, e um GC no meio de uma rodada pesa nela). `reps` fixo (as linhas por tipo) não cresce.
async function measure<A>(op: Op<A>, fixed?: number): Promise<Result> {
  const cpu: number[] = [];
  const wall: number[] = [];
  const jsCpu: number[] = [];
  const runs: Phase[][] = [];
  let reps = fixed ?? REPS;
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
    if (fixed === undefined && i === REPS - 1 && median(cpu) < LIGHT_MS) reps = LIGHT_REPS;
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
  op.checkRows?.(rows, a);
  const gzip = op.gzip ? op.gzip(a) : null;
  const count = op.count ? op.count(out, a) : null;
  op.teardown?.(a);
  return {
    cpu: median(cpu),
    cpuMin: Math.min(...cpu),
    cpuMax: Math.max(...cpu),
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
    reps: cpu.length,
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

// Um pedido do sync (syncBatch de verdade): `changes` sobe, e volta a página de `page` desde o cursor. Com a RPC do objeto dentro da
// conta: o pedido chega serializado (v8.serialize, feito antes, do lado de quem chama) e o objeto o desserializa; a resposta sai
// serializada. `kind` 'sessão' apaga uma sessão (uma mudança, e a cascata regrava os solves dela; o orçamento do dia sobe até não contar,
// porque desde a Task 12 a cascata que não caberia num dia volta com a cota, e a medição quer o custo dela). `wake`: o pedido é o primeiro
// depois do deploy numa conta do beta (o objeto nasce e monta records_tombs, e o usage() do lote conta os ativos e os bytes). O corte do
// pedido (MAX_WRITES_PER_REQUEST) sobe até o tamanho medido, e a página é `page` com ou sem envio.
type Kind = 'novo' | 'edição' | 'exclusão' | 'sessão';
const syncOp = (a: Account, o: { changes: number; page: number; cursor: 'zero' | 'head'; kind?: Kind; wake?: boolean }): Op<Account> => {
  let bytes: Buffer = Buffer.alloc(0);
  const kind = o.kind ?? 'novo';
  return {
    setup: () => {
      reset(a);
      if (o.wake) {
        a.sql.db.exec('DROP INDEX IF EXISTS records_tombs');
        a.sql.db.exec("DELETE FROM state WHERE key IN ('active', 'bytes')");
      }
      knobs.page = o.page;
      knobs.writes = o.changes > 0 ? o.changes : null;
      if (kind === 'sessão') knobs.budget = Number.MAX_SAFE_INTEGER;
      let changes: Change[];
      if (kind === 'novo') changes = newSolves(a, o.changes, 'novo');
      else if (kind === 'edição') changes = a.sample.slice(0, o.changes).map((c) => ({ ...c, data: { ...(c.data as object), note: 'editado' }, updatedAt: T0 }));
      else if (kind === 'exclusão') changes = a.sample.slice(0, o.changes).map((c) => ({ ...c, updatedAt: T0, deletedAt: T0, deletionStamp: T0 }));
      else changes = [{ ...a.doomed, updatedAt: T0, deletedAt: T0, deletionStamp: T0 }];
      bytes = serialize(request(changes, o.cursor === 'zero' ? 0 : a.rev));
      return a;
    },
    run: async (x) => {
      const store = o.wake ? new AccountStore(x.ctx, x.env) : x.store;
      const res = await store.syncBatch(USER, deserialize(bytes) as SyncRequest, NOW());
      serialize(res);
      return res;
    },
    check: (out) => {
      const res = out as { accepted: number; rejected: unknown[]; changes: unknown[] };
      expect(res.rejected).toEqual([]);
      expect(res.accepted).toBe(kind === 'sessão' ? 1 : o.changes);
      if (o.cursor === 'zero') expect(res.changes.length).toBe(o.page);
    },
    checkRows: (rows) => {
      if (kind === 'sessão') expect(rows).toBeGreaterThanOrEqual(a.cascaded); // a cascata gravou cada solve ativo da sessão
    },
    teardown: () => {
      knobs.page = null;
      knobs.writes = null;
      if (kind === 'sessão') knobs.budget = null;
    },
    count: () => (kind === 'sessão' ? a.cascaded : o.changes),
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
  a.r2.objects.set(snapshotKey(USER, RESTORED), await gzipJson(exportFromRecords(inside(a.store).all(T0 - DAY), T0 - DAY)));
  return a;
}

// A restauração como está (restoreSnapshot de verdade). O orçamento do dia sobe até não contar (e RESTORE_MAX_RECORDS, no env falso, fica
// acima da maior conta): acima das linhas de um dia ela seria 'too-big' antes de gravar, e a medição quer o custo de restaurar a conta
// inteira.
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
    const most = Math.min(caps.restoreRecords, recordsPerDay(caps.rowsDay)); // o dia útil, como no objeto
    if (caps.restoreRecords === 0 || s.recordCount(most, now) > most) return 'too-big';
    if (!(await takeOps(s.env.DB, 'B', 2, now, caps.classBMonth))) return 'r2-budget';
    const object = await s.env.SNAPSHOTS.get(snapshotKey(userId, name));
    if (!object) {
      s.renewCopies();
      return 'not-found';
    }
    const copy = (await gunzipJson(await object.arrayBuffer())) as KlickExport;
    const current = s.all(now);
    const stamp = current.reduce((max, c) => Math.max(max, c.updatedAt + 1, c.deletionStamp + 1), now);
    const practice = Array.isArray(copy.practice) ? copy.practice : null;
    const input = { sessions: copy.sessions, solves: copy.solves, practice };
    const prefs = accountPrefsOf(copy.profile);
    const rows = rowsOf(restoreChanges(current, input, prefs, stamp).length); // só a contagem
    if (rows > DAILY_WRITE_BUDGET) return 'too-big';
    if (rows > DAILY_WRITE_BUDGET - s.dayCount('writes', now).n) return 'write-budget';
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
const compactOp = (a: Account, limit: number | null = null): Op<Account> => ({
  setup: () => {
    reset(a);
    knobs.compact = limit;
    return a;
  },
  run: async (x) => inside(x.store).compact(NOW()),
  check: (out, x) => expect(out).toBe(Math.min(limit ?? COMPACT_PER_DAY, x.due)),
  teardown: () => {
    knobs.compact = null;
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

// A CPU de uma função síncrona ou assíncrona, uma rodada, depois de settle() (a referência do gzip, que alterna as duas formas).
const GZIP_REPS = 9;
async function cpuOf(fn: () => unknown): Promise<number> {
  await settle();
  const c0 = process.cpuUsage();
  await fn();
  const c = process.cpuUsage(c0);
  return (c.user + c.system) / 1000;
}

// O gzip de referência: o mesmo arquivo da cópia pelo gzipJson de verdade (JSON.stringify, TextEncoder e o CompressionStream do Node) e
// pelo zlib cru (JSON.stringify e zlib.gzipSync, na linha do JS). No workerd o CompressionStream é nativo e roda na linha do pedido.
interface GzipRef {
  n: number;
  json: number; // bytes do JSON
  stream: number; // ms
  raw: number; // ms
}
async function gzipRef(a: Account): Promise<GzipRef> {
  const data = exportFromRecords(inside(a.store).all(T0), T0);
  const json = Buffer.byteLength(JSON.stringify(data));
  const stream: number[] = [];
  const raw: number[] = [];
  for (let i = 0; i < GZIP_REPS; i++) {
    stream.push(await cpuOf(() => gzipJson(data)));
    raw.push(await cpuOf(() => gzipSync(JSON.stringify(data))));
  }
  return { n: a.n, json, stream: median(stream), raw: median(raw) };
}

// --- O documento ---

// As vars dos dois ambientes no wrangler.jsonc (as linhas de comentário saem, como em tests/unit/wrangler-config.test.ts).
function wranglerVars(): { beta: Record<string, string>; root: Record<string, string> } {
  const text = readFileSync(WRANGLER, 'utf8');
  const config = JSON.parse(text.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')) as {
    vars: Record<string, string>;
    env: { production: { vars: Record<string, string> } };
  };
  return { beta: config.vars, root: config.env.production.vars };
}

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
  const head = ['Solves', 'Registros', 'Rodadas', 'CPU (ms)', 'CPU mín–máx', 'CPU do JS (ms)', 'Relógio (ms)', 'Memória viva (MB)', 'Ocupada (MB)'];
  if (o.gzip) head.push('Gzip (KB)');
  if (o.count) head.push(o.count);
  head.push('Linhas gravadas');
  if (o.where) head.push('Pico vivo em');
  head.push('');
  const left = new Set(['Solves', '', 'Pico vivo em']);
  const out = [`| ${head.join(' | ')} |`, `|${head.map((h) => (left.has(h) ? ' --- ' : ' ---: ')).join('|')}|`];
  for (const { n, rows, r } of lines) {
    const cells = [nf(n), nf(rows), String(r.reps), ms(r.cpu), `${ms(r.cpuMin)}–${ms(r.cpuMax)}`, ms(r.jsCpu), ms(r.wall), mb(r.live), mb(r.occupied)];
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

// A compactação por limite (colunas) em cada conta (linhas): a CPU mediana, o mínimo e o máximo, e se cabe.
function gridTable(grid: Map<number, Map<number, Result>>, dues: Map<number, number>): string {
  const out = [`| Solves | Vencidos | ${COMPACTS.map((c) => `Limite ${nf(c)}`).join(' | ')} |`, `| --- | ---: | ${COMPACTS.map(() => '---').join(' | ')} |`];
  for (const [n, byLimit] of grid) {
    const cells = COMPACTS.map((c) => {
      const r = byLimit.get(c)!;
      return `${ms(r.cpu)} (${ms(r.cpuMin)}–${ms(r.cpuMax)}) ${mark(r)}`;
    });
    out.push(`| ${nf(n)} | ${nf(dues.get(n) ?? 0)} | ${cells.join(' | ')} |`);
  }
  return out.join('\n');
}

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

// A linha que o teste descartável do workerd devolveu (o `rowsWritten` de cada comando, num objeto da conta do Miniflare, com o
// UPSERT_RECORD e o COMPACT_SOLVE de records-sql.ts). Fica no documento como prova da regra das linhas.
const WORKERD_ROWS =
  'ROWS {"insert session":4,"insert solve (new)":4,"edit solve (same parent)":3,"edit solve (identical values but rev)":3,"move solve (parent change)":3,"delete solve (keeps content)":4,"edit deleted (stays in tombs)":4,"undelete (leaves tombs)":3,"delete again":4,"compact solve":1,"compact again (no-op data same)":1,"re-send compacted -> content back":4,"insert practice":4,"insert pref":4,"update pref":3,"state insert":2,"state update":1,"device insert":2,"device update":1,"drop tombs":0,"create tombs (1000 rows, 100 match)":102,"drop rev":0,"create rev (1000+ rows)":1005,"count active":0}';

const WAKE_PAGE = 250; // o despertar junto com um pedido: o envio de 250 e a página de 250

it(
  'uma conta de 100 mil solves no plano gratuito',
  async () => {
    expect(typeof gc).toBe('function');
    const started = performance.now();
    const loadStart = loadavg()[0];
    const ops = {
      copia: [] as Line[],
      restauracao: [] as Line[],
      alternativa: [] as Line[],
      envio: [] as Line[],
      recebimento: [] as Line[],
      contagem: [] as Line[],
      despertar: [] as Line[],
      despertarEnvio: [] as Line[],
      despertarRecebimento: [] as Line[],
      cascata: [] as Line[],
      compactacao: [] as Line[],
      alarme: [] as Line[],
    };
    const gzips: GzipRef[] = [];
    const dues = new Map<number, number>();
    const doomedSolves = new Map<number, number>();

    // O aquecimento: cada operação algumas vezes numa conta pequena, descartadas (o código frio do V8 não entra na mediana de 1 mil).
    {
      const a = buildAccount(SIZES[0]);
      const warm = [
        copyOp(a),
        syncOp(a, { changes: 500, page: 500, cursor: 'zero' }),
        syncOp(a, { changes: 0, page: 500, cursor: 'zero' }),
        syncOp(a, { changes: 1, page: 500, cursor: 'head', kind: 'sessão' }),
        syncOp(a, { changes: WAKE_PAGE, page: WAKE_PAGE, cursor: 'zero', wake: true }),
        countOp(a),
        wakeOp(a),
        compactOp(a),
      ];
      for (const op of warm) await measure(op as Op<Account>, REPS + 1);
      a.close();
      await measure(restoreOp(SIZES[0], 'como está'), REPS + 1);
      await measure(restoreOp(SIZES[0], 'alternativa'), REPS + 1);
      await measure(alarmOp(SIZES[0]), REPS + 1);
    }

    // A 100 mil, além da tabela: o envio e o recebimento por pedido menor, a compactação por alarme menor, e o primeiro sync com os dois
    // valores quando eles saem diferentes.
    const envioPages = new Map<number, Result>();
    const recebimentoPages = new Map<number, Result>();
    // A compactação por limite em cada conta: a do limite de verdade é a da tabela; uma conta com menos vencidos que um limite compacta
    // só os dela, e o resultado é o mesmo de qualquer limite acima (mede-se uma vez).
    const compactGrid = new Map<number, Map<number, Result>>();
    const doomedTotals = new Map<number, number>();
    const combined = new Map<number, Result>();
    let writesPer: number | null = null;
    let pullPer: number | null = null;
    let pullPage: number | null = null;
    const pick = (m: Map<number, Result>): number | null => [...m.entries()].find(([, r]) => fits(r))?.[0] ?? null;

    for (const n of SIZES) {
      const a = buildAccount(n);
      dues.set(n, a.due);
      doomedSolves.set(n, a.cascaded);
      const line = (r: Result): Line => ({ n, rows: a.rows, r });
      ops.copia.push(line(await measure(copyOp(a))));
      gzips.push(await gzipRef(a));
      ops.envio.push(line(await measure(syncOp(a, { changes: 500, page: 500, cursor: 'zero' }))));
      ops.recebimento.push(line(await measure(syncOp(a, { changes: 0, page: 500, cursor: 'zero' }))));
      ops.contagem.push(line(await measure(countOp(a))));
      ops.despertar.push(line(await measure(wakeOp(a))));
      ops.despertarEnvio.push(line(await measure(syncOp(a, { changes: WAKE_PAGE, page: WAKE_PAGE, cursor: 'zero', wake: true }))));
      ops.despertarRecebimento.push(line(await measure(syncOp(a, { changes: 0, page: WAKE_PAGE, cursor: 'zero', wake: true }))));
      ops.cascata.push(line(await measure(syncOp(a, { changes: 1, page: 500, cursor: 'head', kind: 'sessão' }))));
      ops.compactacao.push(line(await measure(compactOp(a))));
      doomedTotals.set(n, a.doomedTotal);
      const byLimit = new Map<number, Result>();
      const byWork = new Map<number, Result>([[Math.min(COMPACT_PER_DAY, a.due), ops.compactacao.at(-1)!.r]]);
      for (const c of COMPACTS) {
        const work = Math.min(c, a.due);
        if (!byWork.has(work)) byWork.set(work, await measure(compactOp(a, c)));
        byLimit.set(c, byWork.get(work)!);
      }
      compactGrid.set(n, byLimit);
      if (n === BIGGEST) {
        for (const p of PAGES) {
          envioPages.set(p, p === 500 ? ops.envio.at(-1)!.r : await measure(syncOp(a, { changes: p, page: p, cursor: 'zero' })));
          recebimentoPages.set(p, p === 500 ? ops.recebimento.at(-1)!.r : await measure(syncOp(a, { changes: 0, page: p, cursor: 'zero' })));
        }
        writesPer = pick(envioPages);
        pullPer = pick(recebimentoPages);
        pullPage = pullPer;
        // O envio de um e a página do outro no mesmo pedido. Se não couber, a página desce até caber junto com o envio (no tamanho do
        // envio, cabe: é a medição do envio).
        if (writesPer !== null && pullPer !== null && writesPer !== pullPer) {
          for (const p of PAGES.filter((x) => x <= pullPer!)) {
            const r = p === writesPer ? envioPages.get(p)! : await measure(syncOp(a, { changes: writesPer, page: p, cursor: 'zero' }));
            combined.set(p, r);
            if (fits(r)) {
              pullPage = p;
              break;
            }
          }
        }
      }
      a.close();
      ops.restauracao.push(line(await measure(restoreOp(n, 'como está'))));
      ops.alternativa.push(line(await measure(restoreOp(n, 'alternativa'))));
      ops.alarme.push(line(await measure(alarmOp(n))));
    }

    // (a) As linhas gravadas por tipo de mudança, num pedido de 500 (sem página de volta que conte: o recebimento não grava registro).
    const kinds = buildAccount(KINDS_AT);
    const kindRows = new Map<string, Result>();
    for (const kind of ['novo', 'edição', 'exclusão'] as const) {
      kindRows.set(kind, await measure(syncOp(kinds, { changes: 500, page: 500, cursor: 'head', kind }), 1));
    }
    kindRows.set('vazio', await measure(syncOp(kinds, { changes: 0, page: 500, cursor: 'head' }), 1));
    const compactKind = await measure(compactOp(kinds), 1);
    kinds.close();

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

    // Os vereditos.
    const copyBest = largest(ops.copia);
    const restoreBest = largest(ops.restauracao);
    const altBest = largest(ops.alternativa);
    const countBest = largest(ops.contagem);
    const wakeBest = largest(ops.despertar);
    const wakeSendBest = largest(ops.despertarEnvio);
    const wakePullBest = largest(ops.despertarRecebimento);
    const cascadeBest = largest(ops.cascata);
    const alarmBest = largest(ops.alarme);
    // O limite da compactação: o maior que cabe em toda conta (a pior decide), e a conta em que ele fica mais caro.
    const compactFitsAll = (c: number): boolean => SIZES.every((n) => fits(compactGrid.get(n)!.get(c)!));
    const compactBest = COMPACTS.find(compactFitsAll) ?? null;
    const compactWorst = (c: number): { n: number; r: Result } =>
      SIZES.map((n) => ({ n, r: compactGrid.get(n)!.get(c)! })).reduce((w, x) => (x.r.cpu > w.r.cpu ? x : w));
    const compactMem = COMPACTS.find((c) => SIZES.every((n) => compactGrid.get(n)!.get(c)!.live <= MEM_LIMIT_MB)) ?? null;
    const all100 = (lines: Line[]) => fits(lines.at(-1)!.r) && largest(lines)?.n === BIGGEST;
    const upTo = (l: Line | null): string => (l ? `cabe até ${nf(l.n)} solves` : 'nenhuma conta medida cabe');
    const memText = (l: Line | null): string => (l ? `${nf(l.n)} solves` : 'nenhuma conta medida');
    // O maior N pela memória só, contando de baixo como em largest().
    const memOnly = (lines: Line[]): Line | null => {
      let best: Line | null = null;
      for (const l of lines) {
        if (l.r.live > MEM_LIMIT_MB) break;
        best = l;
      }
      return best;
    };
    const memPick = (m: Map<number, Result>): number | null => [...m.entries()].find(([, r]) => r.live <= MEM_LIMIT_MB)?.[0] ?? null;
    // Quantos registros caberiam pela CPU por registro da menor conta: uma conta linear, que põe o custo fixo nos registros (estimativa, não
    // medida).
    const perRecord = (lines: Line[]): string =>
      `Nenhuma conta medida cabe: a menor, de ${nf(lines[0].n)} solves, gasta ${ms(lines[0].r.cpu)} ms. Pela CPU por registro dela, caberiam uns ${nf(Math.floor((CPU_LIMIT_MS * lines[0].rows) / lines[0].r.cpu))} registros (uma estimativa linear, não medida).`;
    // O valor escolhido perto da linha: a regra o aceita, mas a margem é pequena.
    // O valor escolhido perto da linha (a mediana acima de 80% do limite, ou alguma rodada acima dele): a regra o aceita, mas a margem é
    // pequena. Sai em todo valor escolhido, mesmo o que fica como está.
    const near = (r: Result | undefined): boolean => !!r && (r.cpu > CPU_LIMIT_MS * 0.8 || r.cpuMax > CPU_LIMIT_MS);
    const close = (r: Result | undefined, where = ''): string =>
      r && near(r) ? ` **Na linha**: mediana de ${ms(r.cpu)} ms, de ${ms(r.cpuMin)} a ${ms(r.cpuMax)} ms em ${r.reps} rodadas${where}.` : '';
    // O primeiro sync com o envio escolhido e uma página: a medida combinada, ou a do envio quando os dois são do mesmo tamanho.
    const firstSync = (p: number): Result | undefined => (p === writesPer ? envioPages.get(p) : combined.get(p));
    const pullResult = pullPage === null ? undefined : (firstSync(pullPage) ?? recebimentoPages.get(pullPage));
    // A página cautelosa: a maior abaixo da escolhida em que todas as rodadas do primeiro sync ficaram abaixo do limite.
    const cautiousPage = pullPage === null ? null : (PAGES.find((p) => p < pullPage! && (firstSync(p)?.cpuMax ?? Infinity) <= CPU_LIMIT_MS) ?? null);
    const cascadeVerdict = (best: Line | null): string =>
      best ? `cabe até a conta de ${nf(best.n)} solves (${nf(doomedSolves.get(best.n) ?? 0)} solves ativos na sessão)` : `nenhuma conta medida cabe (a menor apaga ${nf(doomedSolves.get(SIZES[0]) ?? 0)} solves numa sessão)`;

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
      primeiroSync:
        writesPer === 500 && pullPage === 500
          ? 'cabe'
          : `não cabe → MAX_WRITES_PER_REQUEST = ${writesPer ?? 50} e PULL_PAGE = ${pullPage ?? 50}`,
      cascata: all100(ops.cascata) ? 'cabe' : `não cabe → ${cascadeVerdict(cascadeBest)}`,
      contagem: all100(ops.contagem) ? 'cabe' : `não cabe → ${upTo(countBest)}`,
      despertar: all100(ops.despertar) ? 'cabe' : `não cabe → ${upTo(wakeBest)}`,
      despertarEnvio: all100(ops.despertarEnvio) ? 'cabe' : `não cabe → ${upTo(wakeSendBest)}`,
      despertarRecebimento: all100(ops.despertarRecebimento) ? 'cabe' : `não cabe → ${upTo(wakePullBest)}`,
      compactacao: compactFitsAll(COMPACT_PER_DAY) ? 'cabe' : `não cabe → COMPACT_PER_DAY = ${compactBest === null ? '0 (nenhum dos medidos)' : code(compactBest)}`,
      alarme: all100(ops.alarme) ? 'cabe' : `não cabe → ${upTo(alarmBest)}`,
    };

    // (a) As contas das linhas.
    const perChange = (k: string) => (kindRows.get(k)!.rows - kindRows.get('vazio')!.rows) / 500;
    const worstPerChange = Math.max(perChange('novo'), perChange('edição'), perChange('exclusão'));
    const rowsBudget = Math.floor(SHARED_ROWS_PER_DAY * ACCOUNT_SHARE);
    const changesBudget = Math.floor(rowsBudget / worstPerChange);
    const restoreRowsPerRecord = ops.restauracao.at(-1)!.r.rows / ops.restauracao.at(-1)!.r.count!;
    const everythingFits = Object.values(v).every((x) => x === 'cabe');

    // A leitura de 30 s do limite de CPU (seção 12): a CPU para de decidir, e decidem a memória e as linhas.
    const copyMem = memOnly(ops.copia);
    const restoreMem = memOnly(ops.restauracao);
    const restoreRows = Math.floor(rowsBudget / restoreRowsPerRecord);
    const restore30 = Math.min(restoreMem ? restoreMem.rows : 0, restoreRows);
    const cascadeMem = memOnly(ops.cascata);
    const cascadeRows100 = ops.cascata.at(-1)!.r.rows;
    const reading = (x: Line | null, lines: Line[]): string =>
      x && x.n === lines.at(-1)!.n
        ? `sem teto (a conta de ${nf(x.n)} solves, ${mb(x.r.live)} MB vivos)`
        : x
          ? `${nf(x.rows)} (a conta de ${nf(x.n)} solves, ${mb(x.r.live)} MB vivos)`
          : '0';

    // O gzip: o CompressionStream do Node contra o zlib cru, no mesmo arquivo.
    const gzRatio = (g: GzipRef): number => g.stream / g.raw;
    const copyRaw = (i: number): number => Math.max(0, ops.copia[i].r.cpu - gzips[i].stream + gzips[i].raw);

    const dueText = SIZES.map((n) => `${nf(dues.get(n) ?? 0)} a ${nf(n)}`).join(', ');
    const fullFrom = SIZES.find((n) => (dues.get(n) ?? 0) >= COMPACT_PER_DAY);
    const minutes = (performance.now() - started) / 60_000;
    const cpu = cpus();
    const fmtLimit = `CPU ≤ ${CPU_LIMIT_MS} ms e memória viva ≤ ${MEM_LIMIT_MB} MB`;
    const zero = !all100(ops.copia) && !copyBest ? 'as cópias' : '';
    const zeroRestore = !all100(ops.restauracao) && !restoreBest ? 'as restaurações' : '';
    const zeroWhat = [zero, zeroRestore].filter(Boolean).join(' e ');

    // Os valores aplicados (Task 12), conferidos contra esta rodada: a cópia e a restauração pela leitura de 30 s (a memória e as linhas do
    // dia), o sync e a compactação pela regra. "Na linha": a mediana acima de 80% do limite, ou alguma rodada acima dele (near).
    const vars = wranglerVars();
    const copyCap = Number(vars.beta.SNAPSHOT_MAX_RECORDS);
    const restoreCap = Number(vars.beta.RESTORE_MAX_RECORDS);
    const sameVars = vars.root.SNAPSHOT_MAX_RECORDS === vars.beta.SNAPSHOT_MAX_RECORDS && vars.root.RESTORE_MAX_RECORDS === vars.beta.RESTORE_MAX_RECORDS;
    const maxCascade = RECORDS_PER_DAY - 1; // os solves que a exclusão de uma sessão leva junto num dia
    const restoreClamp = Math.min(restoreCap, RECORDS_PER_DAY); // o que o COUNT da restauração confere
    // A menor conta medida com pelo menos `cap` registros, e se ela e as de baixo cabem pela memória.
    const cover = (lines: Line[], cap: number): Line | undefined => lines.find((l) => l.rows >= cap);
    const memUpTo = (lines: Line[], cap: number): boolean => {
      const c = cover(lines, cap);
      return !!c && lines.filter((l) => l.rows <= c.rows).every((l) => l.r.live <= MEM_LIMIT_MB);
    };
    const word = (r: Result | undefined): string => (!r ? 'Sem medida' : !fits(r) ? 'Não cabe' : 'Cabe'); // perto da linha: close(), depois
    const cpuText = (r: Result | undefined): string => (r ? `${ms(r.cpu)} ms (de ${ms(r.cpuMin)} a ${ms(r.cpuMax)}), ${mb(r.live)} MB vivos` : 'sem medida');
    const pushed =
      MAX_WRITES_PER_REQUEST === PULL_PAGE_WITH_PUSH
        ? envioPages.get(MAX_WRITES_PER_REQUEST)
        : writesPer === MAX_WRITES_PER_REQUEST
          ? combined.get(PULL_PAGE_WITH_PUSH)
          : undefined;
    const pulled = recebimentoPages.get(PULL_PAGE);
    const compactApplied = COMPACTS.includes(COMPACT_PER_DAY as (typeof COMPACTS)[number]) ? compactWorst(COMPACT_PER_DAY) : null;
    const copyLine = cover(ops.copia, copyCap);
    const restoreLine = cover(ops.restauracao, restoreCap);
    const cascadeAt = ops.cascata.find((l) => (doomedSolves.get(l.n) ?? 0) > maxCascade) ?? null; // a primeira conta cuja sessão a cota recusa
    const kindRowsText = (k: string, n: number): string => `${nf(kindRows.get(k)!.rows)} medidas, ${nf(rowsOf(n))} contadas`;
    const applied = everythingFits
      ? []
      : [
          '### Os valores aplicados (Task 12)',
          '',
          `A Task 12 seguiu a leitura de 30 s do limite de CPU na cópia e na restauração (seção 12): decidem a memória (≤ ${MEM_LIMIT_MB} MB) e as linhas do dia, e na leitura de 10 ms as duas vars vão a 0, só na configuração. A cascata de apagar uma sessão não tem var: a ${nf(BIGGEST)} solves (${nf(doomedSolves.get(BIGGEST) ?? 0)} na sessão) ela custa ${ms(ops.cascata.at(-1)!.r.cpu)} ms (seção 9 (e)), e na leitura de 10 ms pediria um teto no código. O sync e a compactação seguem a regra (${fmtLimit}). Cada valor aplicado, conferido contra esta rodada:`,
          '',
          `- \`SNAPSHOT_MAX_RECORDS = ${code(copyCap)}\` (var do \`wrangler.jsonc\`, ${sameVars ? 'a mesma no beta e na raiz' : 'diferente na raiz'}): ${copyLine ? `a conta medida que o cobre, de ${nf(copyLine.n)} solves (${nf(copyLine.rows)} registros), tem ${mb(copyLine.r.live)} MB vivos na cópia (${ms(copyLine.r.cpu)} ms de CPU)` : 'acima da maior conta medida'}. **${memUpTo(ops.copia, copyCap) ? 'Cabe' : 'Não cabe'}** pela memória.`,
          `- \`RESTORE_MAX_RECORDS = ${code(restoreCap)}\` (var, ${sameVars ? 'a mesma nos dois' : 'diferente na raiz'}): ${restoreLine ? `a conta medida que o cobre, de ${nf(restoreLine.n)} solves (${nf(restoreLine.rows)} registros), tem ${mb(restoreLine.r.live)} MB vivos na restauração (${ms(restoreLine.r.cpu)} ms de CPU)` : 'acima da maior conta medida'}. **${memUpTo(ops.restauracao, restoreCap) ? (restoreMem && restoreMem.rows > restoreCap ? 'Cabe, com folga' : 'Cabe') : 'Não cabe'}** pela memória${restoreMem ? ` (pela memória, até ${nf(restoreMem.rows)} registros)` : ''}. O \`COUNT\` confere o menor entre a var e \`RECORDS_PER_DAY\` (${nf(RECORDS_PER_DAY)}: o que um pedido grava num dia com a compactação do alarme ao lado), hoje ${nf(restoreClamp)} registros; a conferência das linhas (\`rowsOf\`, ${ROWS_PER_WRITE} por mudança), depois de ler a cópia, continua a autoridade.`,
          `- \`MAX_WRITES_PER_REQUEST = ${MAX_WRITES_PER_REQUEST}\` (e o \`SYNC_BATCH\` do app) com \`PULL_PAGE_WITH_PUSH = ${PULL_PAGE_WITH_PUSH}\`: o pedido com ${MAX_WRITES_PER_REQUEST} subindo e a página de ${PULL_PAGE_WITH_PUSH} dá ${cpuText(pushed)} a ${nf(BIGGEST)}. **${word(pushed)}**.${close(pushed)} Um app de antes manda até ${MAX_SYNC_REQUEST}: o servidor lê ${MAX_WRITES_PER_REQUEST} e devolve o resto para já, com a mesma página (o resto do pedido só é desserializado; não medido à parte).`,
          `- \`PULL_PAGE = ${PULL_PAGE}\` (só recebendo): ${cpuText(pulled)} a ${nf(BIGGEST)}. **${word(pulled)}**.${close(pulled)}`,
          `- \`COMPACT_PER_DAY = ${code(COMPACT_PER_DAY)}\`: ${compactApplied ? `na pior conta, a ${nf(compactApplied.n)} solves, ${cpuText(compactApplied.r)}. **${compactFitsAll(COMPACT_PER_DAY) ? (compactBest !== null && compactBest > COMPACT_PER_DAY ? 'Cabe, com folga' : 'Cabe') : 'Não cabe'}** em todas as contas medidas${compactBest !== null && compactBest > COMPACT_PER_DAY ? ` (o maior que coube em todas nesta rodada: ${nf(compactBest)})` : ''}.${close(compactApplied.r, `, a ${nf(compactApplied.n)} solves`)}` : 'fora dos limites medidos.'}`,
          `- \`DAILY_WRITE_BUDGET = ${code(DAILY_WRITE_BUDGET)}\` linhas por conta por dia UTC, contadas por \`rowsOf\` (${ROWS_PER_WRITE} por registro gravado, 1 por solve compactado, ${REQUEST_ROWS} do estado por pedido que grava). Contra as linhas desta rodada: 500 solves novos, ${kindRowsText('novo', 500)}; 500 edições, ${kindRowsText('edição', 500)}; 500 exclusões, ${kindRowsText('exclusão', 500)}; a compactação de ${nf(compactKind.count ?? 0)}, ${nf(compactKind.rows)} medidas e ${nf(rowsOf(0, compactKind.count ?? 0))} contadas; a restauração a ${nf(BIGGEST)}, ${nf(ops.restauracao.at(-1)!.r.rows)} medidas e ${nf(rowsOf(ops.restauracao.at(-1)!.r.count ?? 0))} contadas. Por registro, ${ROWS_PER_WRITE} é o pior caso; o estado de um pedido é de ${REQUEST_ROWS} linhas quando todas as chaves dele já existem, e um pedido que as cria (o primeiro da conta, o primeiro de um aparelho) grava algumas a mais (seção 9 (a): uma linha nova custa 2).`,
          `- A cascata de apagar uma sessão conta no orçamento: no máximo ${nf(maxCascade)} solves ativos levados junto num dia (a sessão e eles são \`RECORDS_PER_DAY\`, ${nf(RECORDS_PER_DAY)} registros: \`rowsOf(${nf(RECORDS_PER_DAY)})\` mais a compactação do alarme, \`rowsOf(0, ${nf(COMPACT_PER_DAY)})\`, cabem em ${nf(DAILY_WRITE_BUDGET)}). A que passa disso volta com a cota, e Enviar de novo manda os solves antes dela. ${cascadeAt ? `A ${nf(cascadeAt.n)} solves (${nf(doomedSolves.get(cascadeAt.n) ?? 0)} na sessão), a exclusão volta com a cota.` : 'Nenhuma conta medida passa disso.'} Abaixo disso, pela memória a cascata ${cascadeMem ? `cabe até a conta de ${nf(cascadeMem.n)} solves` : 'não cabe em nenhuma conta medida'}; pela CPU (a regra), ${cascadeVerdict(cascadeBest)}.`,
        ];

    const doc = `# Klick — uma conta de 100 mil solves no plano gratuito (medição)

Data: ${new Date(T0).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })}. A Task 11 do plano do endurecimento da conta (spec 4.4 e 7.2): quanto custam, em CPU, relógio, memória e linhas gravadas, as operações pesadas do objeto de uma conta, de 1 mil a 100 mil solves, e se cada uma cabe no plano gratuito da Cloudflare. O veredito decide se a Task 12 (os tamanhos que cabem) roda.

Este arquivo é escrito pela própria medição (\`app/tests/perf/account-100k.perf.ts\`, com \`./node_modules/.bin/vitest run -c vitest.perf.config.ts\` em \`app/\`). Não edite à mão: rode de novo.

- Máquina: ${cpu[0]?.model ?? '?'} (${cpu.length} núcleos), ${nf(totalmem() / 1024 ** 3)} GB de memória, ${platform()} ${release()}. Carga (média de 1 min do sistema) no começo e no fim da medição: ${nf(loadStart, 1)} e ${nf(loadavg()[0], 1)}.
- Node ${process.version}, SQLite ${process.versions.sqlite} (\`node:sqlite\`), V8 ${process.versions.v8}.
- A medição levou ${nf(minutes, 1)} min. As operações pesadas (cópia, restauração, alarme) rodaram ${REPS} vezes por conta; as leves (mediana abaixo de ${LIGHT_MS} ms nas ${REPS} primeiras), ${LIGHT_REPS}. Fica a mediana, e as tabelas mostram o mínimo e o máximo. Mais uma rodada instrumentada, à parte, para a memória e as linhas gravadas.

## 1. Os vereditos

A regra (Task 11): o grátis dá 10 ms de CPU por pedido e 128 MB; a medição no Node conta metade, para a diferença do workerd e do SQLite do objeto. **Cabe se ${fmtLimit}.** Por operação: (a) envio ou recebimento a 100 mil que não cabe → o maior de {500, 250, 100, 50} por pedido que cabe; se nem 50 cabe, \`ACCOUNT_LIMITS.solves\` desce para o maior N em que o sync cabe (o único caso da spec 7.2 em que a cota baixa); (b) cópia → \`SNAPSHOT_MAX_RECORDS\` = o maior N medido que cabe (0 se nenhum); (c) restauração → \`RESTORE_MAX_RECORDS\` do mesmo jeito. Tudo cabendo a 100 mil, a Task 12 não roda.

"O maior N que cabe" conta de baixo para cima e para no primeiro que não cabe. O valor das constantes da Task 12 vem em **registros do objeto** (sessões, solves, treino e ajustes), que é o que o objeto conta antes de copiar ou restaurar; a coluna "Solves" diz de que conta ele saiu. A seção 12 mostra os mesmos valores na outra leitura do limite de CPU (30 s).

| Operação | Veredito |
| --- | --- |
| Cópia diária | \`${v.copia}\` |
| Restauração | \`${v.restauracao}\` |
| Envio do primeiro sync | \`${v.envio}\` |
| Recebimento (uma página, sem envio) | \`${v.recebimento}\` |
| Primeiro sync (o envio e a página no mesmo pedido) | \`${v.primeiroSync}\` |
| Apagar uma sessão (a cascata, seção 9 (e)) | \`${v.cascata}\` |
| Contagem inicial dos ativos | \`${v.contagem}\` |
| (b) Primeiro despertar de uma conta do beta, sozinho | \`${v.despertar}\` |
| (b) O despertar com o primeiro sync (${WAKE_PAGE} subindo, página de ${WAKE_PAGE}) | \`${v.despertarEnvio}\` |
| (b) O despertar com um recebimento (página de ${WAKE_PAGE}) | \`${v.despertarRecebimento}\` |
| (d) Compactação de um alarme (${nf(COMPACT_PER_DAY)} solves; decide a pior conta, seção 9 (d)) | \`${v.compactacao}\` |
| (d) O alarme inteiro (compactação, cópia e o próximo alarme) | \`${v.alarme}\` |

${everythingFits ? '**Tudo cabe a 100 mil: a Task 12 não roda.**' : '**Alguma operação não cabe: a Task 12 roda, com os valores da seção 10.**'}

## 2. O que se mede, e o que um número do Node quer dizer

Dentro do workerd o relógio não anda enquanto o pedido usa CPU (\`Date.now()\` e \`performance.now()\` ficam parados), então a CPU de um pedido só se mede fora dele. Aqui, o objeto da conta de verdade (\`worker/account-store.ts\`, a mesma classe) roda no Node: o import de \`cloudflare:workers\` vira uma casca com o \`ctx\` e o \`env\`, o banco é um \`node:sqlite\` em memória com o mesmo esquema (\`RECORDS_SCHEMA\`) e o mesmo SQL (\`worker/records-sql.ts\`), e o D1 e o R2 são falsos (a reserva no D1 sempre passa; o R2 guarda o arquivo). As funções do núcleo são as de sempre (\`applyChanges\`, \`restoreChanges\`, \`exportFromRecords\`, \`accountPrefsOf\`), e o gzip é o \`CompressionStream\` do Node, pelo \`gzipJson\` de \`worker/snapshots.ts\`.

**O Node não é o workerd.** Outra CPU (um ${cpu[0]?.model ?? '?'}, não o servidor da Cloudflare), outro build do V8, e o SQLite do objeto grava em disco e confirma a transação de outro jeito. Contar metade dos limites é uma margem para essa diferença, não uma conversão: um número entre a metade e o limite (2,5 a 5 ms, 32 a 64 MB) não prova que cabe, e um número acima não prova que estoura. A Cloudflare também não corta exatamente no milissegundo. O veredito é a regra aplicada aos números daqui, e nada além disso.

- **CPU**: \`process.cpuUsage()\` antes e depois da operação (usuário + sistema). É a CPU do processo inteiro: entram as linhas auxiliares do V8 (o GC concorrente, o compilador) e a do zlib do \`CompressionStream\` (no Node ele roda no pool de threads). É o número da regra, na mediana: ${REPS} rodadas nas operações pesadas, ${LIGHT_REPS} nas leves (as que ficam abaixo de ${LIGHT_MS} ms nas ${REPS} primeiras: o envio, o recebimento, o primeiro sync, a contagem, o despertar e a compactação), porque um GC no meio de uma rodada move uma operação curta de um lado para o outro da linha. Antes de cada rodada, dois \`gc()\` com esperas de 20 e 60 ms (fora da conta) limpam o lixo da montagem e deixam o V8 terminar de varrer, e 10 ms de laço ocupado acordam o núcleo. Mesmo assim, as rodadas de uma operação curta variam bastante (veja o mínimo e o máximo): numa operação perto de 5 ms, a mediana decide, mas o lado da linha é frágil.
- **CPU do JS**: \`process.threadCpuUsage()\`, só a linha que roda o código do objeto, mediana. Fica de fora o que o V8 faz nas outras linhas e o gzip (no pool de threads do Node). Não decide nada: mostra quanto da CPU do processo é do código do objeto. Quando a CPU passa do relógio, a diferença é dessas outras linhas.
- **A RPC**: nos pedidos do sync, a conta inclui o lado do objeto na chamada RPC. O pedido chega serializado (\`v8.serialize\`, feito antes, fora da conta, como faria o Worker que chama) e o objeto o desserializa (\`v8.deserialize\`, dentro da conta); a resposta sai serializada (\`v8.serialize\`, dentro). O workerd usa o mesmo serializador do V8 na RPC. Na cópia, na restauração e no alarme, a chamada não leva nada que pese.
- **Relógio**: \`performance.now()\`, mediana. No Node, sem rede: o D1 e o R2 respondem na hora.
- **Memória viva**: numa rodada à parte, uma sonda chama \`gc()\` e lê \`process.memoryUsage()\` (heap usado + memória externa, onde ficam os ArrayBuffers) nos pontos pesados do caminho: depois de cada \`SELECT\` de 50 linhas ou mais, de cada gravação no estado (o fim de \`write()\`, com o lote inteiro vivo), de \`applyChanges\`, \`restoreChanges\`, \`exportFromRecords\`, \`gzipJson\`, \`gunzipJson\`, do get e do put no R2, e logo depois de cada \`JSON.stringify\`, \`JSON.parse\`, \`TextEncoder.encode\` e \`TextDecoder.decode\` de 256 KB ou mais (os textos e bytes do arquivo da cópia, que aparecem e somem dentro de uma função), e no fim, com o que a operação devolve ainda vivo (a página do sync). O número é o maior vivo nessas sondas menos o de antes da operação (também depois de \`gc()\`). Entre duas sondas pode haver um pico um pouco maior que nenhuma pegou: é um piso bem apertado, não um teto.
- **Ocupada**: nas mesmas sondas, o heap + externa **antes** do \`gc()\`, menos o de antes da operação: o que o V8 segurava naquele instante, lixo incluído. Não decide nada (o V8 coleta antes de desistir), mas mostra a pressão.
- O limite de 128 MB vale para o isolate (heap do V8 e memória externa). O banco do objeto não entra em nenhum dos dois números: no Node ele mora no \`node:sqlite\`, fora do heap; se o cache de páginas do SQLite do objeto conta nos 128 MB do workerd, esta medição não sabe.
- **Gzip**: o tamanho do arquivo gravado no R2.
- **Linhas gravadas**: a soma, na rodada instrumentada, pela regra da seção 9 (a), conferida no workerd. É o que o grátis conta (100 mil por dia, somadas entre todas as contas).

## 3. As contas medidas

N ∈ {${SIZES.map((n) => nf(n)).join(', ')}} solves, mais 20 sessões, N/10 tentativas do treino e os ${ops.copia[0].rows - SIZES[0] - 20 - SIZES[0] / 10} ajustes padrão da conta (\`prefsFromProfile\` com \`withDefaults\`). Os solves se espalham pelo último ano, nas 20 sessões (N/20 em cada uma), com o formato do app: id de 17 caracteres, embaralhamento de 20 movimentos, tempo de 8 a 30 s, 2% com +2, 1% com DNF, 1% com nota. Um em cada dez está na lixeira (apagado uma hora depois do solve, com o conteúdo): os de mais de 30 dias são o que a compactação tira (${dueText}). A conta já tem os contadores da Task 4 no estado (os ativos e os bytes) e o alarme da cópia marcado. Cada conta é montada direto no banco, fora da conta; entre as rodadas de uma operação que grava, ela volta ao estado de pronta (fora da conta).

## 4. A cópia diária

\`takeSnapshot\` (pelo \`snapshot()\` do objeto): ler todas as linhas, \`exportFromRecords\`, \`gzipJson\`, a reserva no D1 e o put no R2. A cópia leva os solves da lixeira com o conteúdo, então o arquivo tem os N solves.

${table(ops.copia, { gzip: true })}

Para onde vai a CPU (a rodada da mediana; cada linha é a CPU desde a de cima até o fim da função dela):

${phaseTable(ops.copia, COPY_PHASES)}

O gzip de referência: o mesmo arquivo pelo \`gzipJson\` de verdade (\`JSON.stringify\`, \`TextEncoder\` e o \`CompressionStream\` do Node) e pelo zlib cru (\`JSON.stringify\` e \`zlib.gzipSync\`, no mesmo nível), alternados, mediana de ${GZIP_REPS} de cada. O \`CompressionStream\` do Node passa pelos streams da web e pelo pool de threads; o do workerd é nativo e roda na linha do pedido, então o custo de lá deve ficar mais perto do zlib cru que do número daqui. A última coluna é a cópia com o zlib cru no lugar do \`gzipJson\`: uma estimativa (a CPU da cópia, menos o \`gzipJson\`, mais o cru), não uma medida.

| Solves | JSON (KB) | gzipJson (ms) | stringify + gzipSync (ms) | Razão | Cópia com o zlib cru (estimativa, ms) |
| --- | ---: | ---: | ---: | ---: | ---: |
${gzips.map((g, i) => `| ${nf(g.n)} | ${nf(g.json / 1024)} | ${ms(g.stream)} | ${ms(g.raw)} | ${nf(gzRatio(g), 1)}× | ${ms(copyRaw(i))} |`).join('\n')}

O alarme roda a compactação e a cópia na mesma invocação: o custo dele está na seção 9 (d).

## 5. A restauração

\`restoreSnapshot\` de verdade, restaurando a cópia de ontem da própria conta (o caso comum, e o mais pesado: \`restoreChanges\` regrava cada registro da cópia com a data nova). Na ordem do objeto: o get no R2, \`gunzipJson\`, ler todas as linhas, \`restoreChanges\`, a contagem contra o orçamento, a cópia de antes (\`exportFromRecords\` e \`gzipJson\` das linhas de agora, a reserva e o put), e a gravação (\`applyChanges\` e \`write()\`) numa transação. "Mudanças" é o que \`applyChanges\` leu. O orçamento do dia e \`RESTORE_MAX_RECORDS\` foram levantados para esta medição: desde a Task 12, uma conta com mais registros que \`RESTORE_MAX_RECORDS\` volta \`too-big\` antes de ler o R2 (um \`COUNT\`), e uma restauração cujas mudanças gravam mais linhas que as de um dia (\`rowsOf\`, ${nf(DAILY_WRITE_BUDGET)}) volta \`too-big\` antes de gravar (depois do gunzip, de ler tudo e de \`restoreChanges\`: essa recusa também custa).

${table(ops.restauracao, { gzip: true, count: 'Mudanças', where: true })}

Para onde vai a CPU (como na cópia):

${phaseTable(ops.restauracao, RESTORE_PHASES)}

## 6. O envio do primeiro sync

\`syncBatch\` de verdade, com o pedido que o motor do app mandava no primeiro sync de um aparelho antes da Task 12 (hoje ele manda ${MAX_WRITES_PER_REQUEST}, e o servidor corta um pedido maior; o corte sobe aqui até o tamanho medido): 500 solves novos subindo (numa sessão que existe, com a cota, o teto de bytes pelo \`admit\` e o orçamento do dia) e o cursor 0, então a resposta leva a primeira página de 500. Com a RPC do lado do objeto (seção 2). A conta tem 90% dos N solves ativos: a 100 mil, os 500 novos cabem na cota.

${table(ops.envio, { count: 'Mudanças' })}

A ${nf(BIGGEST)}, por tamanho do pedido (o mesmo número subindo e na página de volta):

${table(PAGES.map((p) => ({ n: BIGGEST, rows: ops.envio.at(-1)!.rows, r: envioPages.get(p)! })), { count: 'Mudanças' })}
${envio50 ? `\nNem 50 cabe a ${nf(BIGGEST)}. O envio de 50 nas contas menores:\n\n${table(envio50, { count: 'Mudanças' })}\n` : ''}
## 7. O recebimento

\`syncBatch\` sem mudanças, do cursor 0: a página de 500 (\`SELECT ... WHERE rev > ? ORDER BY rev LIMIT 501\` e \`rowToChange\` em cada linha), a linha do aparelho e a RPC.

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

Até a Task 12, o orçamento do dia (\`DAILY_WRITE_BUDGET\`, ${nf(OLD_BUDGET)}) contava **mudanças**; o grátis conta **linhas gravadas** (${nf(SHARED_ROWS_PER_DAY)} por dia, somadas entre todas as contas), e cada mudança grava a linha do registro, cada entrada de índice que ela toca e as linhas do estado do objeto.

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

A linha que o teste do workerd devolveu (o \`rowsWritten\` de cada comando, nessa ordem, num objeto com 1.000 solves para os índices):

\`\`\`
${WORKERD_ROWS}
\`\`\`

Pedidos de 500 mudanças de cada tipo, numa conta de ${nf(KINDS_AT)} solves (as linhas não dependem do tamanho), com o \`syncBatch\` de verdade:

| Pedido | Linhas gravadas | Por mudança (menos o pedido de só receber, ÷ 500) |
| --- | ---: | ---: |
| 500 solves novos | ${nf(kindRows.get('novo')!.rows)} | ${nf(perChange('novo'), 2)} |
| 500 edições | ${nf(kindRows.get('edição')!.rows)} | ${nf(perChange('edição'), 2)} |
| 500 exclusões (solves ativos para a lixeira) | ${nf(kindRows.get('exclusão')!.rows)} | ${nf(perChange('exclusão'), 2)} |
| Só recebimento (o fixo de um pedido) | ${nf(kindRows.get('vazio')!.rows)} | — |
| Compactação (${nf(compactKind.count ?? 0)} solves num alarme) | ${nf(compactKind.rows)} | ${nf(compactKind.rows / (compactKind.count || 1), 2)} |
| Restauração a ${nf(BIGGEST)} (${nf(ops.restauracao.at(-1)!.r.count ?? 0)} mudanças) | ${nf(ops.restauracao.at(-1)!.r.rows)} | ${nf(restoreRowsPerRecord, 2)} |
| Apagar uma sessão a ${nf(BIGGEST)} (1 mudança, ${nf(doomedSolves.get(BIGGEST) ?? 0)} solves ativos na cascata) | ${nf(cascadeRows100)} | ${nf(cascadeRows100 / (doomedSolves.get(BIGGEST) || 1), 2)} por solve da sessão |
| O primeiro despertar de uma conta do beta a ${nf(BIGGEST)} (seção 9 (b)) | ${nf(ops.despertar.at(-1)!.r.rows)} | uma por solve da lixeira com conteúdo, mais 5 |

O fixo de um pedido que grava é a revisão, os contadores que mudaram (ativos, bytes, as gravações do dia) e o aparelho: até umas 5 linhas.

**O orçamento em linhas.** Para uma conta ficar em ${nf(ACCOUNT_SHARE * 100)}% ou menos das ${nf(SHARED_ROWS_PER_DAY)} linhas do dia: **${nf(rowsBudget)} linhas por dia por conta**. Contado em mudanças, com a pior (${nf(worstPerChange, 2)} linhas), são ${nf(changesBudget)} mudanças por dia. Antes da Task 12, ${nf(OLD_BUDGET)} mudanças de solves novos gravavam umas ${nf(OLD_BUDGET * perChange('novo'))} linhas: uma conta só gastava ${nf((OLD_BUDGET * perChange('novo') * 100) / SHARED_ROWS_PER_DAY)}% do dia de todas. Desde a Task 12, \`DAILY_WRITE_BUDGET = ${nf(DAILY_WRITE_BUDGET)}\` conta linhas, por cima: \`rowsOf\` dá ${ROWS_PER_WRITE} por registro gravado (qualquer um), 1 por solve compactado e ${REQUEST_ROWS} do estado por pedido que grava. As consequências que a Task 12 recebeu:

- Um primeiro sync de 100 mil solves (um import grande do csTimer) sobe em uns ${nf(Math.ceil(BIGGEST / changesBudget))} dias com ${nf(changesBudget)} mudanças por dia (antes da Task 12, ${nf(Math.ceil(BIGGEST / OLD_BUDGET))}).
- A restauração grava ${nf(restoreRowsPerRecord, 1)} linhas por registro e conta inteira no orçamento: com ${nf(rowsBudget)} linhas por dia, a maior que passa tem uns ${nf(restoreRows)} registros, seja qual for a CPU (contando ${ROWS_PER_WRITE} por registro, como \`rowsOf\`, e com a compactação do alarme ao lado, \`RECORDS_PER_DAY\`: ${nf(RECORDS_PER_DAY)}). Antes da Task 12, a de ${nf(OLD_BUDGET)} mudanças gravava umas ${nf(OLD_BUDGET * restoreRowsPerRecord)} linhas.
- Apagar uma sessão de ${nf(doomedSolves.get(BIGGEST) ?? 0)} solves ativos grava ${nf(cascadeRows100)} linhas num pedido só (seção 9 (e)); antes da Task 12, o orçamento do dia não as limitava.
- O primeiro despertar de uma conta do beta de ${nf(BIGGEST)} solves grava ${nf(ops.despertar.at(-1)!.r.rows)} linhas (o índice novo), também fora do orçamento.
- A compactação já conta no orçamento (uma por solve, uma linha cada). O alarme de cada conta grava ainda o \`setAlarm\` e umas 3 linhas do estado da cópia por dia, fora do orçamento.

### (b) O primeiro despertar de uma conta do beta

O primeiro pedido depois do deploy da Task 4, numa conta que já existia: o objeto nasce (\`migrate()\`: \`RECORDS_SCHEMA\` sobre a tabela que já existe; \`records_rev\` e \`records_parent\` vêm do 5a, só \`records_tombs\` é novo e é montado aqui) e o primeiro \`syncBatch\` conta os ativos e os bytes (\`COUNT_ACTIVE\`, \`STORED_BYTES\`) e grava os dois contadores. Contas criadas depois da Task 4 (todas as da raiz) nunca passam por isto.

Sozinho (o nascimento e a contagem, sem o pedido):

${table(ops.despertar)}

Com o pedido que vem junto, na mesma invocação (o objeto nasce e o \`syncBatch\` de verdade roda, com a contagem dentro dele): o primeiro sync de um aparelho, com ${WAKE_PAGE} solves subindo e a página de ${WAKE_PAGE} voltando do cursor 0,

${table(ops.despertarEnvio, { count: 'Mudanças' })}

e um recebimento, com a página de ${WAKE_PAGE}:

${table(ops.despertarRecebimento)}

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
    } Só pela memória viva (≤ ${MEM_LIMIT_MB} MB), como está caberia até ${memText(restoreMem)}, e a alternativa até ${memText(memOnly(ops.alternativa))}.

### (d) A compactação de um alarme

\`compact()\`: \`COMPACTABLE\` (pelo índice \`records_tombs\`, só os vencidos, os mais antigos primeiro) e um \`COMPACT_SOLVE\` por solve, no máximo \`COMPACT_PER_DAY\` (${nf(COMPACT_PER_DAY)}), numa transação, com os contadores. "Compactados" é quantos ela tirou: ${fullFrom ? `abaixo de ${nf(fullFrom)} solves, a conta não tem ${nf(COMPACT_PER_DAY)} vencidos` : `nenhuma conta medida tem ${nf(COMPACT_PER_DAY)} vencidos`}.

${table(ops.compactacao, { count: 'Compactados' })}

Por limite de um alarme, em cada conta: a CPU mediana (o mínimo e o máximo das rodadas). Uma conta com menos vencidos que o limite compacta só os dela (a mesma medida em todo limite acima). Toda conta com ${nf(COMPACT_PER_DAY)} vencidos ou mais compacta exatamente ${nf(COMPACT_PER_DAY)} por alarme, então o limite vale se couber em **todas** as contas, e decide a pior: ${compactFitsAll(COMPACT_PER_DAY) ? `${nf(COMPACT_PER_DAY)} cabe em todas` : `${nf(COMPACT_PER_DAY)} não cabe a ${nf(compactWorst(COMPACT_PER_DAY).n)} solves (${ms(compactWorst(COMPACT_PER_DAY).r.cpu)} ms), e o maior limite que cabe em todas é ${compactBest === null ? 'nenhum dos medidos' : nf(compactBest)}`}.

${gridTable(compactGrid, dues)}

O alarme inteiro (\`alarm()\`: a compactação, a cópia do dia e o \`setAlarm\` do próximo, numa invocação só, com os limites de um pedido):

${table(ops.alarme, { gzip: true })}

### (e) Apagar uma sessão: a cascata

Um pedido do sync com uma mudança só: uma sessão apagada. O servidor regrava, no mesmo pedido, todos os solves ativos dela (\`applyChanges\`, a cascata em \`apply.ts\`: \`view.solvesOf\` lê os solves da sessão e \`cascade\` apaga os mais antigos que a exclusão). Nas contas medidas, cada sessão tem N/20 solves; a apagada (a segunda) tem ${nf(doomedTotals.get(BIGGEST) ?? 0)} a ${nf(BIGGEST)}, ${nf((100 * (doomedSolves.get(BIGGEST) ?? 0)) / (doomedTotals.get(BIGGEST) || 1))}% ativos (a lixeira da conta, um solve em cada dez, cai em outras sessões). \`syncBatch\` de verdade, com a RPC, o cursor na revisão da conta (a resposta leva de volta a página do que a cascata gravou). "Solves na cascata" é quantos solves ativos a sessão tinha.

${table(ops.cascata, { count: 'Solves na cascata' })}

Antes da Task 12, nada limitava esse pedido: o orçamento do dia cortava \`req.changes\` (aqui, uma mudança) antes de \`applyChanges\`, e a cascata gravava depois, sem limite. Desde a Task 12, o objeto conta antes os solves ativos da sessão (\`ACTIVE_CHILDREN\`, pelo índice) e a cascata entra no orçamento do dia: a que não cabe no que sobra fica para amanhã, com o resto do lote, e a que não caberia nem num dia inteiro (mais de ${nf(maxCascade)} solves ativos) volta com o motivo da cota e fica no aparelho. Para medir a cascata inteira, a medição sobe o orçamento neste pedido.

## 10. O que a Task 12 recebe

${
  everythingFits
    ? '**A Task 12 não roda**: todas as operações cabem a 100 mil.'
    : [
        zeroWhat
          ? `- **Antes de tudo: 0 desliga ${zeroWhat} para toda conta**, até uma de ${nf(SIZES[0])} solves. É mais do que a spec 7.2 previa ("contas grandes passam a ter cópia com menos frequência, ou nenhuma acima de um tamanho", "a restauração de uma conta grande que não couber é recusada"): a Task 12 não deve aplicar 0 sem a decisão do Ranielli. Na leitura de 30 s do limite de CPU (seção 12), os valores são outros.`
          : '',
        !all100(ops.copia)
          ? `- \`SNAPSHOT_MAX_RECORDS = ${copyBest ? code(copyBest.rows) : 0}\`. ${copyBest ? `É a conta de ${nf(copyBest.n)} solves.` : `${perRecord(ops.copia)} Com 0, nenhuma conta tem cópia do dia.`} Na menor conta, só a linha do JS gasta ${ms(ops.copia[0].r.jsCpu)} ms; o resto é, quase todo, o \`CompressionStream\` do Node, que aqui custa ${nf(gzRatio(gzips[0]), 1)}× o zlib cru no mesmo arquivo (seção 4). No workerd ele é nativo e roda na linha do pedido: conta inteiro na CPU do pedido. Com o zlib cru no lugar, a cópia da menor conta ficaria em uns ${ms(copyRaw(0))} ms (estimativa, não medida). O alarme soma a compactação à cópia; sem a cópia, ele só compacta (${ms(ops.compactacao.at(-1)!.r.cpu)} ms a ${nf(BIGGEST)}).`
          : '',
        !all100(ops.restauracao)
          ? `- \`RESTORE_MAX_RECORDS = ${restoreBest ? code(restoreBest.rows) : 0}\`. ${restoreBest ? `É a conta de ${nf(restoreBest.n)} solves; acima dele, a restauração é \`too-big\`.` : `${perRecord(ops.restauracao)} Com 0, toda restauração é \`too-big\`.`} A alternativa da seção 9 (c) ${altBest && (!restoreBest || altBest.n > restoreBest.n) ? `deixaria ${code(altBest.rows)}` : 'não muda o valor'}. Com o orçamento em linhas, o teto das linhas também vale (seção 9 (a)).`
          : '',
        `- \`MAX_WRITES_PER_REQUEST = ${writesPer ?? 50}\`${writesPer === null ? `, e \`ACCOUNT_LIMITS.solves = ${code(largest(envio50!)?.n ?? 0)}\`` : ''}: o primeiro sync com ${writesPer ?? 50} subindo e a página de ${writesPer ?? 50} dá ${writesPer === null ? '—' : `${ms(envioPages.get(writesPer)!.cpu)} ms (de ${ms(envioPages.get(writesPer)!.cpuMin)} a ${ms(envioPages.get(writesPer)!.cpuMax)})`} a ${nf(BIGGEST)}.${close(writesPer === null ? undefined : envioPages.get(writesPer))}`,
        `- \`PULL_PAGE = ${pullPage ?? 50}\`${pullPer === null ? `, e \`ACCOUNT_LIMITS.solves = ${code(largest(recebimento50!)?.n ?? 0)}\`` : pullPage !== pullPer ? ` (sozinha, a página de ${pullPer} cabe; junto com o envio de ${writesPer} no mesmo pedido, só a de ${pullPage}: seção 7)` : ''}: ${pullResult ? `o primeiro sync com ${writesPer ?? 50} subindo e essa página dá ${ms(pullResult.cpu)} ms (de ${ms(pullResult.cpuMin)} a ${ms(pullResult.cpuMax)}) a ${nf(BIGGEST)}` : 'sem medida'}.${close(pullResult)}${near(pullResult) && cautiousPage !== null ? ` O valor cauteloso é ${cautiousPage}: o primeiro sync com ${writesPer} subindo e a página de ${cautiousPage} deu mediana de ${ms(firstSync(cautiousPage)!.cpu)} ms, e todas as rodadas ficaram em ${ms(firstSync(cautiousPage)!.cpuMax)} ms ou menos.` : ''}`,
        `- \`COMPACT_PER_DAY = ${code(compactBest ?? 0)}\`: o maior limite que cabe em todas as contas medidas (seção 9 (d)); na pior delas, a ${compactBest === null ? '—' : `${nf(compactWorst(compactBest).n)} solves, ${ms(compactWorst(compactBest).r.cpu)} ms (de ${ms(compactWorst(compactBest).r.cpuMin)} a ${ms(compactWorst(compactBest).r.cpuMax)})`}.${compactBest === null ? '' : close(compactWorst(compactBest).r, `, a ${nf(compactWorst(compactBest).n)} solves`)}`,
        !all100(ops.cascata)
          ? `- Sem constante na Task 12: apagar uma sessão ${cascadeVerdict(cascadeBest)}. Nem \`MAX_WRITES_PER_REQUEST\` nem o orçamento do dia limitavam a cascata (seção 9 (e)); a Task 12 a pôs no orçamento do dia (abaixo).`
          : '',
        !all100(ops.despertar) || !all100(ops.contagem) || !all100(ops.despertarEnvio) || !all100(ops.despertarRecebimento)
          ? `- Sem constante na Task 12: o primeiro despertar de uma conta do beta, sozinho, ${upTo(wakeBest)}; com o primeiro sync no mesmo pedido, ${upTo(wakeSendBest)}; com um recebimento, ${upTo(wakePullBest)}. Só as contas do beta passam por isso, uma vez, no primeiro pedido depois do deploy; vale conferir o tamanho da maior delas antes do deploy.`
          : '',
        `- \`DAILY_WRITE_BUDGET\` em linhas: **${nf(rowsBudget)} por dia por conta** (${nf(ACCOUNT_SHARE * 100)}% das ${nf(SHARED_ROWS_PER_DAY)} do grátis), ou ${nf(changesBudget)} mudanças se ele continuasse contando mudanças (seção 9 (a)).`,
      ]
        .filter(Boolean)
        .join('\n')
}

${applied.join('\n')}

## 11. Onde a medição se afasta do objeto de verdade

- **\`cloudflare:workers\`**: a classe base do objeto vira uma casca que só guarda o \`ctx\` e o \`env\` (\`tests/perf/cloudflare-workers.ts\`). O resto de \`account-store.ts\` roda como está.
- **O banco**: \`node:sqlite\` em memória, sem disco; \`transactionSync\` é \`BEGIN\`/\`COMMIT\`; o \`exec\` guarda o comando preparado pelo texto, como o do workerd. Fora de uma transação, cada comando se confirma sozinho (no workerd, eles se juntam até o próximo ponto de saída). O cursor devolve as linhas já lidas (\`all()\`), não uma a uma. O banco tem ainda uma cópia das linhas de quando a conta ficou pronta (\`records_orig\`, que nenhuma consulta do objeto lê), para voltar a conta a ela entre as rodadas.
- **D1 e R2 falsos**: a reserva de espaço e de operações sempre passa, sem rede; o get devolve os bytes da cópia (uma cópia nova, como um corpo que chega), o put só guarda o tamanho, e o head diz que a cópia de antes não existe. A espera da rede não é CPU do objeto.
- **A RPC**: só o lado do objeto (desserializar o pedido, serializar a resposta), com o \`v8\` do Node, dentro da conta dos pedidos do sync. O Worker de fora, que lê e confere o JSON do pedido e chama o objeto, roda numa invocação dele, que não está aqui.
- **Quatro constantes por getter**: \`DAILY_WRITE_BUDGET\` foi levantado só na restauração (seções 5 e 9 (c)) e na cascata (seção 9 (e)); \`MAX_WRITES_PER_REQUEST\` sobe até o tamanho do pedido medido; a página (\`PULL_PAGE\` e \`PULL_PAGE_WITH_PUSH\`) é a do pedido medido, de 500 a 50 (e fica em ${WAKE_PAGE} no despertar com um pedido); e \`COMPACT_PER_DAY\` muda para medir os outros limites. As vars \`SNAPSHOT_MAX_RECORDS\` e \`RESTORE_MAX_RECORDS\` do env falso ficam acima da maior conta. Nos outros casos, os valores de verdade.
- **As sondas**: \`applyChanges\`, \`restoreChanges\`, \`exportFromRecords\`, \`gzipJson\` e \`gunzipJson\` passam por um invólucro que chama a sonda depois da função de verdade; o mesmo com \`JSON\`, \`TextEncoder\` e \`TextDecoder\` grandes. As sondas só ligam na rodada instrumentada; as rodadas de CPU e relógio só marcam as etapas (um \`process.cpuUsage()\` em cada fim de função).
- **Privados chamados direto**: \`compact()\` (a compactação sem a cópia), \`usage()\` (a contagem inicial e o despertar sozinho, numa transação, como no primeiro \`syncBatch\`). A restauração alternativa da seção 9 (c) é código da medição, não do objeto: \`restoreSnapshot\` copiado com a única diferença descrita lá (e a contagem dos solves ativos dos metadados, que no objeto é uma função privada de uma linha, escrita no lugar).
- **O aquecimento**: antes de medir, cada operação roda ${REPS + 1} vezes numa conta de ${nf(SIZES[0])}, descartadas. No workerd, um objeto que acorda frio paga a compilação do código por cima.
- **As linhas gravadas**: contadas pela regra da seção 9 (a), não lidas do SQLite (o \`node:sqlite\` não conta entradas de índice). A regra veio do \`rowsWritten\` do workerd, comando por comando.

## 12. O que esta medição não diz, e a outra leitura do limite de CPU

- **O limite de CPU dos Durable Objects no grátis.** A página de limites deles diz 30 s por pedido (o padrão) e, no mesmo lugar, que eles têm os limites de CPU por invocação dos Workers do plano; no grátis, 10 ms. A spec adota 10 ms, e a regra também. Se valer 30 s, a CPU de quase tudo aqui deixa de decidir, e decidem a memória (≤ ${MEM_LIMIT_MB} MB, a mesma metade) e as linhas do dia (${nf(rowsBudget)} por conta, seção 9 (a)). Os valores lado a lado:

| Constante | Leitura de 10 ms (a regra) | Leitura de 30 s (memória e linhas) |
| --- | ---: | ---: |
| \`SNAPSHOT_MAX_RECORDS\` | ${copyBest ? (all100(ops.copia) ? 'sem teto' : nf(copyBest.rows)) : '0'} | ${reading(copyMem, ops.copia)} |
| \`RESTORE_MAX_RECORDS\` | ${restoreBest ? (all100(ops.restauracao) ? 'sem teto' : nf(restoreBest.rows)) : '0'} | ${nf(restore30)} (o menor entre a memória, ${restoreMem ? `${nf(restoreMem.rows)} registros da conta de ${nf(restoreMem.n)} solves` : 'nenhuma conta medida'}, e as linhas, ${nf(restoreRows)} registros) |
| \`MAX_WRITES_PER_REQUEST\` | ${nf(writesPer ?? 50)} | ${nf(memPick(envioPages) ?? 50)} |
| \`PULL_PAGE\` | ${nf(pullPage ?? 50)} | ${nf(memPick(recebimentoPages) ?? 50)} |
| \`COMPACT_PER_DAY\` | ${nf(compactBest ?? 0)} | ${nf(compactMem ?? 0)} |
| Apagar uma sessão | ${cascadeBest ? `até a conta de ${nf(cascadeBest.n)} solves` : 'nenhuma conta medida'} | ${cascadeMem ? `até a conta de ${nf(cascadeMem.n)} solves pela memória` : 'nenhuma conta medida'}; pelas linhas, ${nf(cascadeRows100)} num pedido a ${nf(BIGGEST)} |
| \`DAILY_WRITE_BUDGET\` | ${nf(rowsBudget)} linhas por conta | ${nf(rowsBudget)} linhas por conta |

- **O isolate de 128 MB pode ser dividido.** Vários objetos (de contas diferentes) podem rodar no mesmo isolate e dividir os 128 MB dele; a margem de ${MEM_LIMIT_MB} MB é para um objeto sozinho.
- **A cascata de apagar uma sessão**: \`MAX_WRITES_PER_REQUEST\` corta as mudanças que chegam e não a alcança (ela grava os solves da sessão depois delas, dentro de \`applyChanges\`). Desde a Task 12, o orçamento do dia a alcança: ela é contada antes, pelo índice, e um pedido nunca grava mais que o dia de uma conta. A cascata em partes, pelo servidor, fica para uma spec própria.
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
