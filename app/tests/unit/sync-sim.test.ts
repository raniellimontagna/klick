import { describe, expect, it } from 'vitest';
import { applyChanges, sameChange } from '../../src/core/sync/apply';
import { sessionOfChange } from '../../src/core/sync/records';
import { syncKey, type Change, type SyncStore } from '../../src/core/sync/types';
import { seasonOne } from '../../src/core/season';
import type { SeasonProgress } from '../../src/core/types';
import { FakeServer, MapView } from './sync-fakes';
import { pickWith, seeded } from './sync-random';

const DAY = 86_400_000;

// Um aparelho falso: registros, fila de saída, cursor e o relógio do app (spec 5.4), com o relógio do sistema adiantado ou atrasado.
class Device {
  readonly records = new Map<string, Change>();
  readonly outbox = new Map<string, number>();
  cursor = 0;
  clock = 0;
  online = true;
  readonly name: string;
  readonly skew: number;
  private readonly sim: { now: number };
  constructor(name: string, skew: number, sim: { now: number }) {
    this.name = name;
    this.skew = skew;
    this.sim = sim;
  }
  stamp(): number {
    this.clock = Math.max(this.sim.now + this.skew, this.clock + 1);
    return this.clock;
  }
  put(c: Change): void {
    this.records.set(syncKey(c.store, c.id), c);
    this.outbox.set(syncKey(c.store, c.id), this.clock);
  }
  get(store: SyncStore, id: string): Change | undefined {
    return this.records.get(syncKey(store, id));
  }
  all(store: SyncStore): Change[] {
    return [...this.records.values()].filter((c) => c.store === store);
  }
  // O mesmo laço do motor (spec 6.1): manda até `batch` da fila, tira da fila o que não mudou durante o pedido, aplica a volta e repete
  // enquanto houver fila ou `more`. O que a cascata muda aqui entra na fila.
  sync(server: FakeServer, batch: number): void {
    for (let guard = 0; guard < 10_000; guard++) {
      const keys = [...this.outbox.keys()].slice(0, batch);
      const sent = keys.map((k) => ({ k, q: this.outbox.get(k)!, c: this.records.get(k) })).filter((x) => x.c !== undefined);
      const res = server.sync({ v: 1, deviceId: this.name, cursor: this.cursor, clock: this.clock, changes: sent.map((x) => x.c!) });
      for (const k of keys) if (!this.records.has(k)) this.outbox.delete(k);
      for (const x of sent) if (this.outbox.get(x.k) === x.q) this.outbox.delete(x.k);
      const result = applyChanges(new MapView(this.records), res.changes, { mode: 'client', pending: (s, id) => this.outbox.has(syncKey(s, id)) });
      for (const w of result.writes) this.records.set(syncKey(w.store, w.id), w);
      this.clock = Math.max(this.clock, res.serverTime, ...res.changes.map((c) => Math.max(c.updatedAt, c.deletionStamp)));
      for (const k of result.derived) this.outbox.set(k, this.clock);
      this.cursor = res.cursor;
      if (this.outbox.size === 0 && !res.more) return;
    }
    throw new Error(`${this.name}: o sync não terminou`);
  }
  // A lixeira de 30 dias (spec 5.5): só some de vez o que não espera na fila.
  purge(now: number): void {
    for (const [k, c] of this.records) {
      if (c.store !== 'prefs' && c.deletedAt !== null && c.deletedAt < now - 30 * DAY && !this.outbox.has(k)) this.records.delete(k);
    }
  }
}

const solveData = (sessionId: string, n: number, at: number) => ({
  sessionId, event: '333', ms: 10_000 + n, penalty: null, at, scramble: "R U R'", note: '', createdAt: at,
});
const sessionData = (n: number, at: number) => ({ name: `Sessão ${n}`, event: '333', order: n, createdAt: at });
// Uma temporada válida (seasonFrom) com `ends` como as viradas já fechadas.
const seasonAfter = (ends: number[]): SeasonProgress => ({
  current: { ...seasonOne(), n: ends.length + 1 },
  past: ends.map((endedAt, i) => ({ n: i + 1, startedAt: 0, endedAt, solves: 1000, startAo12: null, endAo12: null })),
});

// Três aparelhos e um servidor, gravando, editando, apagando, restaurando e trocando a trilha ao acaso (spec 11). No fim, todos iguais
// ao servidor, e nenhum solve que não foi apagado (nem a sessão dele) sumiu.
function simulate(seed: number, rounds: number, batch: number): void {
  const rnd = seeded(seed);
  const pick = pickWith(rnd);
  const sim = { now: 1_791_500_000_000 };
  const server = new FakeServer(batch);
  const devices = [new Device('A', 0, sim), new Device('B', -3_600_000, sim), new Device('C', 120_000, sim)];
  const created = new Map<string, string>(); // solve -> sessão
  // O que a simulação fez, por registro (chave store/id): a data da última criação ou restauração e a da última exclusão. Valem as datas,
  // não a ordem das rodadas: é por elas que o sync decide, e os relógios dos aparelhos divergem.
  const alive = new Map<string, number>();
  const dead = new Map<string, number>();
  const born = (c: Change, stamp: number): void => void alive.set(syncKey(c.store, c.id), Math.max(alive.get(syncKey(c.store, c.id)) ?? -1, stamp));
  const killed = (c: Change, stamp: number): void => void dead.set(syncKey(c.store, c.id), Math.max(dead.get(syncKey(c.store, c.id)) ?? -1, stamp));
  const memories: { d: Device; c: Change }[] = [];
  let n = 0;

  for (let round = 0; round < rounds; round++) {
    sim.now += Math.floor(rnd() * 600_000);
    server.now = sim.now;
    const d = pick(devices)!;
    const op = rnd();
    if (op < 0.06) {
      const s = d.stamp();
      const made: Change = { store: 'sessions', id: `ses${++n}`, data: sessionData(n, s), updatedAt: s, deletedAt: null, deletionStamp: s };
      d.put(made);
      born(made, s);
    } else if (op < 0.35) {
      const session = pick(d.all('sessions').filter((c) => c.deletedAt === null)) ?? pick(d.all('sessions'));
      if (!session) continue;
      const s = d.stamp();
      const id = `sol${++n}`;
      created.set(id, session.id);
      const made: Change = { store: 'solves', id, data: solveData(session.id, n, s), updatedAt: s, deletedAt: null, deletionStamp: s };
      d.put(made);
      born(made, s);
      if (session.deletedAt !== null) {
        d.put({ ...session, deletedAt: null, deletionStamp: s, updatedAt: s }); // addSolve revive a sessão
        born(session, s);
      }
    } else if (op < 0.48) {
      const x = pick(d.all('solves'));
      if (!x) continue;
      const s = d.stamp();
      d.put({ ...x, data: { ...(x.data as object), note: `nota ${++n}` }, updatedAt: s });
    } else if (op < 0.58) {
      const x = pick(d.all('solves').filter((c) => c.deletedAt === null));
      if (!x) continue;
      const s = d.stamp();
      d.put({ ...x, deletedAt: s, deletionStamp: s, updatedAt: s });
      killed(x, s);
    } else if (op < 0.64) {
      const x = pick(d.all('solves').filter((c) => c.deletedAt !== null));
      if (!x) continue;
      const s = d.stamp();
      d.put({ ...x, deletedAt: null, deletionStamp: s, updatedAt: s });
      born(x, s);
      const sid = sessionOfChange(x);
      const session = sid === null ? undefined : d.get('sessions', sid);
      if (session && session.deletedAt !== null) {
        d.put({ ...session, deletedAt: null, deletionStamp: s, updatedAt: s });
        born(session, s);
      }
    } else if (op < 0.69) {
      const session = pick(d.all('sessions').filter((c) => c.deletedAt === null));
      if (!session) continue;
      const s = d.stamp();
      d.put({ ...session, deletedAt: s, deletionStamp: s, updatedAt: s });
      killed(session, s);
      for (const x of d.all('solves')) {
        if (x.deletedAt === null && sessionOfChange(x) === session.id) {
          d.put({ ...x, deletedAt: s, deletionStamp: s, updatedAt: s });
          killed(x, s);
        }
      }
    } else if (op < 0.73) {
      const session = pick(d.all('sessions').filter((c) => c.deletedAt !== null));
      if (!session) continue;
      const s = d.stamp();
      d.put({ ...session, deletedAt: null, deletionStamp: s, updatedAt: s });
      born(session, s);
      for (const x of d.all('solves')) {
        const mine = sessionOfChange(x) === session.id;
        if (mine && x.deletedAt === session.deletedAt) {
          d.put({ ...x, deletedAt: null, deletionStamp: s, updatedAt: s });
          born(x, s);
        }
      }
    } else if (op < 0.8) {
      const s = d.stamp();
      d.put({ store: 'prefs', id: `trail.${Math.floor(rnd() * 9)}`, data: rnd() < 0.5, updatedAt: s, deletedAt: null, deletionStamp: s });
    } else if (op < 0.82) {
      const past = ((d.get('prefs', 'season')?.data as SeasonProgress | undefined)?.past ?? []).map((r) => r.endedAt);
      const s = d.stamp();
      d.put({ store: 'prefs', id: 'season', data: seasonAfter([...past, s]), updatedAt: s, deletedAt: null, deletionStamp: s });
    } else if (op < 0.84) {
      const x = pick(d.all('solves'));
      if (x) memories.push({ d, c: structuredClone(x) });
    } else if (op < 0.85) {
      // Um arquivo velho importado depois que a lixeira apagou o registro de vez: a versão velha sobe e precisa perder.
      const m = pick(memories.filter((x) => x.d === d && !d.records.has(syncKey(x.c.store, x.c.id))));
      if (m) d.put(structuredClone(m.c));
    } else if (op < 0.87) {
      d.online = !d.online;
    } else if (op < 0.89) {
      sim.now += 40 * DAY; // um aparelho fica semanas sem abrir: a lixeira dele esvazia
      d.purge(sim.now + d.skew);
    } else if (d.online) {
      d.sync(server, batch);
    }
  }

  for (const d of devices) d.online = true;
  for (let i = 0; i < 2; i++) for (const d of devices) d.sync(server, batch);

  const active = server.active();
  for (const d of devices) {
    const mine = new Map([...d.records].filter(([, c]) => c.deletedAt === null));
    expect([...mine.keys()].sort(), `${d.name}, semente ${seed}`).toEqual([...active.keys()].sort());
    for (const [k, c] of active) expect(sameChange(mine.get(k), c), `${d.name} em ${k}, semente ${seed}`).toBe(true);
    // As marcas de exclusão que o aparelho ainda tem são as do servidor.
    for (const [k, c] of d.records) {
      expect(server.records.has(k), `${d.name} tem ${k}, que o servidor não tem, semente ${seed}`).toBe(true);
      const { rev: _rev, ...stored } = server.records.get(k)!;
      expect(sameChange(c, stored), `${d.name} em ${k}, semente ${seed}`).toBe(true);
    }
  }
  // Nenhum registro que não foi apagado sumiu (spec 11): se a última criação ou restauração dele tem data maior que toda exclusão dele
  // e da sessão dele, ele está ativo no servidor e em cada aparelho. Vale para solves e sessões, restaurados ou não (os ajustes da conta
  // não se apagam). Uma sessão que só um solve novo devolve não entra aqui; a regra "solve ativo tem sessão ativa" abaixo a cobre.
  let required = 0;
  for (const [k, since] of alive) {
    const [store, ...rest] = k.split('/');
    const id = rest.join('/');
    const sessionId = store === 'solves' ? created.get(id) : undefined;
    const deletions = [dead.get(k) ?? -1, sessionId === undefined ? -1 : (dead.get(syncKey('sessions', sessionId)) ?? -1)];
    if (since <= Math.max(...deletions)) continue;
    required++;
    expect(active.has(k), `${k} (criado ou restaurado em ${since}, apagado até ${Math.max(...deletions)}) sumiu do servidor, semente ${seed}`).toBe(true);
    for (const d of devices) expect(d.records.get(k)?.deletedAt, `${k} sumiu de ${d.name}, semente ${seed}`).toBeNull();
  }
  expect(required, `a regra de não sumir não conferiu nada, semente ${seed}`).toBeGreaterThan(0);
  for (const c of active.values()) {
    if (c.store !== 'solves') continue;
    const sid = sessionOfChange(c);
    expect(sid !== null && active.has(syncKey('sessions', sid)), `solve ativo ${c.id} sem sessão ativa, semente ${seed}`).toBe(true);
  }
}

describe('simulação do sync (spec 11): três aparelhos, um servidor, mil rodadas', () => {
  it.each([
    [1, 500],
    [2, 7],
    [3, 3],
    [4, 1],
    [5, 50],
    [6, 7],
    [7, 3],
    [8, 500],
  ])('semente %i, lote de %i: todos terminam iguais ao servidor e nada que não foi apagado some', (seed, batch) => {
    simulate(seed, 1000, batch);
  });
});
