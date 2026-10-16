import { describe, expect, it, vi } from 'vitest';
import { seasonOne } from '../../src/core/season';
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type Repository } from '../../src/data/repository';
import { createBackup, decodeSnapshot } from '../../src/data/safety';
import { ApiError, createSyncApi } from '../../src/sync/api';
import { createServerClock, createSyncEngine, MASS_DELETE, RETRY_MS, type EngineDeps, type SyncStatus } from '../../src/sync/engine';
import { FakeServer } from './sync-fakes';

let n = 0;
let t = 1_791_500_000_000;
const now = () => t;
const ns = (sessionId: string, ms: number, at = t) => ({ sessionId, event: '333' as const, ms, penalty: null, at, scramble: "R U R'" });
const ACCOUNT = { accountId: 'conta-1', email: 'a@b.c' };

async function device(account: string | null = 'conta-1'): Promise<Repository> {
  const repo = createRepository(await openKlickDb(`engine-${++n}`), { now, channel: null });
  if (account) await repo.saveSyncState({ accountId: account, email: 'a@b.c', signedIn: true });
  return repo;
}

// O servidor falso atrás de uma "rede": a resposta é clonada, como se viesse em JSON. `fail` faz o próximo pedido falhar.
function network(server: FakeServer) {
  const calls: SyncRequest[] = [];
  let fail: ApiError | null = null;
  return {
    calls,
    failNext(err: ApiError) {
      fail = err;
    },
    api: {
      async sync(req: SyncRequest): Promise<SyncResponse> {
        calls.push(structuredClone(req));
        if (fail) {
          const err = fail;
          fail = null;
          throw err;
        }
        return structuredClone(server.sync(structuredClone(req)));
      },
    },
  };
}

function engineFor(repo: Repository, net: ReturnType<typeof network>, extra: Partial<EngineDeps> = {}) {
  const statuses: SyncStatus[] = [];
  const backups: number[] = [];
  const engine = createSyncEngine({
    repo: () => repo,
    api: net.api,
    now,
    backup: async () => {
      backups.push(t);
      await createBackup(repo, 'pre-sync', t);
    },
    onStatus: (s) => statuses.push(s),
    sleep: async () => undefined,
    log: () => undefined,
    ...extra,
  });
  return { engine, statuses, backups };
}

const activeSolves = (server: FakeServer) => [...server.active().values()].filter((c) => c.store === 'solves');

describe('motor do sync (spec 6.1 e 6.2)', () => {
  it('sem conta, não fala com o servidor', async () => {
    const repo = await device(null);
    const net = network(new FakeServer());
    const { engine } = engineFor(repo, net);
    expect((await engine.run()).phase).toBe('off');
    expect(net.calls).toEqual([]);
  });

  it('um solve feito num aparelho aparece no outro', async () => {
    const server = new FakeServer();
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(s.id, 12_345));
    const a = engineFor(phone, network(server));
    expect(await a.engine.run()).toMatchObject({ phase: 'idle', pending: 0, error: null, lastSyncAt: t });
    await engineFor(desktop, network(server)).engine.run();
    expect((await desktop.listSolves()).map((x) => x.ms)).toEqual([12_345]);
    expect((await desktop.getSyncState()).cursor).toBe(server.rev);
  });

  it('em lotes: repete enquanto há fila ou `more`, e cada lote avança o cursor', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < 5; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    await engineFor(desktop, net).engine.run();
    expect(net.calls.map((c) => c.cursor)).toEqual([0, 2, 4]);
    expect(await desktop.listSolves()).toHaveLength(5);
  });

  it('um sync que cai no meio continua de onde parou', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < 5; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const { engine } = engineFor(desktop, net, { schedule: () => () => undefined });
    const real = net.api.sync;
    let calls = 0;
    net.api.sync = async (req) => {
      if (++calls === 2) throw new ApiError('server', 503);
      return real(req);
    };
    expect((await engine.run()).error).toBe('server');
    expect((await desktop.getSyncState()).cursor).toBe(2);
    await engine.run();
    expect(await desktop.listSolves()).toHaveLength(5);
  });

  it('5xx: tenta de novo em 5 s, 30 s, 2 min e depois a cada 5 min; um sucesso zera', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const waits: number[] = [];
    const queued: (() => void)[] = [];
    const { engine } = engineFor(repo, net, {
      schedule: (fn, ms) => {
        waits.push(ms);
        queued.push(fn);
        return () => undefined;
      },
    });
    for (let i = 0; i < 5; i++) {
      net.failNext(new ApiError('server', 500));
      await engine.run();
    }
    expect(waits).toEqual([...RETRY_MS, RETRY_MS[3]]);
    await engine.run(); // deu certo
    net.failNext(new ApiError('server', 500));
    await engine.run();
    expect(waits.at(-1)).toBe(RETRY_MS[0]);
  });

  it('401: erro de sessão, sem nova tentativa, e a fila guarda tudo; sem rede: esperando rede', async () => {
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    const net = network(new FakeServer());
    const schedule = vi.fn(() => () => undefined);
    const { engine } = engineFor(repo, net, { schedule });
    net.failNext(new ApiError('auth', 401));
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'auth', pending: 2 });
    expect(schedule).not.toHaveBeenCalled();
    expect((await repo.getSyncState()).signedIn).toBe(true); // a conta continua aqui: Ajustes mostra "entrar de novo" pelo erro (spec 6.6)
    net.failNext(new ApiError('offline', 0));
    expect(await engine.run()).toMatchObject({ phase: 'offline', error: null, pending: 2 });
  });

  it('nunca durante um solve: espera o timer parar (spec 6.2)', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    let busy = true;
    const waited: number[] = [];
    const { engine } = engineFor(repo, net, {
      busy: () => busy,
      sleep: async () => {
        waited.push(net.calls.length);
        busy = waited.length < 3; // um solve que dura três esperas
      },
    });
    await engine.run();
    expect(waited).toEqual([0, 0, 0]);
    expect(net.calls).toHaveLength(1);
  });

  it('a resposta que chega com o timer ocupado só é juntada depois do solve (spec 6.2)', async () => {
    const server = new FakeServer();
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(s.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const real = net.api.sync;
    let busy = false;
    net.api.sync = async (req) => {
      const res = await real(req);
      busy = true; // o solve começou enquanto o pedido estava fora
      return res;
    };
    const waited: number[] = [];
    const { engine } = engineFor(desktop, net, {
      busy: () => busy,
      sleep: async () => {
        waited.push((await desktop.listSolves()).length);
        busy = false;
      },
    });
    expect((await engine.run()).phase).toBe('idle');
    expect(waited).toEqual([0]);
    expect(await desktop.listSolves()).toHaveLength(1);
  });

  it(`um lote que apaga ${MASS_DELETE} solves ou mais pede antes a cópia local; um menor, não (spec 6.6)`, async () => {
    const server = new FakeServer();
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < MASS_DELETE; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const d = engineFor(desktop, network(server));
    await d.engine.run();
    expect(d.backups).toEqual([]);
    t += 1000;
    await phone.deleteSession(s.id);
    await engineFor(phone, network(server)).engine.run();
    await d.engine.run();
    expect(d.backups).toHaveLength(1);
    expect((await desktop.listBackups())[0].reason).toBe('pre-sync');
    expect(await desktop.listSolves()).toEqual([]);
  });

  it(`um lote pequeno cuja cascata apaga ${MASS_DELETE} solves também pede a cópia antes de juntar (spec 6.6)`, async () => {
    const server = new FakeServer(5); // a exclusão da sessão chega com só 4 dos solves dela
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < MASS_DELETE; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const net = network(server);
    const sizes: number[] = [];
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      sizes.push(res.changes.length);
      return res;
    };
    const copies: { at: number; solves: number }[] = [];
    const { engine } = engineFor(desktop, net, {
      backup: async () => {
        const copy = await createBackup(desktop, 'pre-sync', t);
        copies.push({ at: sizes.length, solves: copy.solveCount });
      },
    });
    await engine.run();
    t += 1000;
    await phone.deleteSession(s.id);
    await engineFor(phone, network(server)).engine.run();
    const before = sizes.length;
    await engine.run();
    expect(sizes[before]).toBeLessThan(MASS_DELETE);
    expect(copies).toEqual([{ at: before + 1, solves: MASS_DELETE }]); // no primeiro lote da exclusão, antes de juntar
    expect(await desktop.listSolves()).toEqual([]);
  });

  it('a temporada que acabou de subir adota a que o servidor decidiu: a fila é confirmada antes de juntar a volta (spec 6.4)', async () => {
    const server = new FakeServer();
    const phone = await device();
    const desktop = await device();
    const turn = (endedAt: number) => ({ n: 1, startedAt: 0, endedAt, solves: 100, startAo12: null, endAo12: null });
    await phone.advanceSeason(1, turn(t + 1), { ...seasonOne(), n: 2 });
    await engineFor(phone, network(server)).engine.run();
    t += 10;
    await desktop.advanceSeason(1, turn(t + 5), { ...seasonOne(), n: 2 }); // virou depois, sem saber da virada do celular
    expect(await engineFor(desktop, network(server)).engine.run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect((await desktop.getProfile()).season.past.map((p) => p.endedAt)).toEqual([t - 10 + 1]); // a primeira virada vence (spec 6.4)
    expect((await phone.getProfile()).season.past.map((p) => p.endedAt)).toEqual([t - 10 + 1]);
  });

  it('a mudança recusada sai da fila e vai para o log local, só com store, id e motivo', async () => {
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(s.id, 1000));
    const net = network(new FakeServer());
    const lines: string[] = [];
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real({ ...req, changes: req.changes.filter((c) => c.store !== 'solves') });
      return { ...res, rejected: [{ store: 'solves', id: x.id, reason: 'solve inválido' }] };
    };
    await engineFor(repo, net, { log: (l) => lines.push(l) }).engine.run();
    expect(lines).toEqual([`sync: o servidor recusou solves/${x.id} (solve inválido)`]);
    expect(await repo.outboxCount()).toBe(0);
  });

  it('o que não foi para a conta aparece no estado: recusado aqui ou no servidor, e o registro que sumiu (spec 6.6)', async () => {
    const db = await openKlickDb(`engine-${++n}`);
    const repo = createRepository(db, { now, channel: null, log: () => undefined });
    const s = await repo.createSession({ event: '333' });
    const ok = await repo.addSolve(ns(s.id, 1000));
    await db.put('solves', { ...(await db.get('solves', ok.id))!, id: 'torto', updatedAt: 1.5 }); // de antes da conta, com a data torta
    const net = network(new FakeServer());
    const { engine } = engineFor(repo, net);
    expect(await engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'idle', pending: 0, refused: 1, missing: 0 });
    expect(net.calls.flatMap((c) => c.changes.map((x) => x.id))).not.toContain('torto');
    await db.put('outbox', { store: 'solves', id: 'sumiu', queuedAt: 0 }, 'solves/sumiu');
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 1, missing: 1 });
    await repo.updateSolve(ok.id, { note: 'nova' });
    const real = net.api.sync;
    net.api.sync = async (req) => ({ ...(await real(req)), rejected: [{ store: 'solves', id: ok.id, reason: 'solve inválido' }] });
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 2, missing: 1 });
  });

  it('um registro editado durante o pedido fica na fila e sobe no lote seguinte (spec 5.3)', async () => {
    const server = new FakeServer();
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(s.id, 1000));
    const net = network(server);
    const real = net.api.sync;
    let edited = false;
    net.api.sync = async (req) => {
      if (!edited) {
        edited = true;
        t += 10;
        await repo.updateSolve(x.id, { note: 'durante o pedido' });
      }
      return real(req);
    };
    expect(await engineFor(repo, net).engine.run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(net.calls.map((c) => c.changes.map((ch) => ch.id))).toEqual([[s.id, x.id], [x.id]]);
    expect((server.records.get(`solves/${x.id}`)?.data as { note: string }).note).toBe('durante o pedido');
    expect((await repo.listSolves())[0].note).toBe('durante o pedido');
  });
});

describe('primeiro login (spec 6.5)', () => {
  it('cópia antes, baixa a conta antes de subir, e o solve repetido (outro id) não sobe nem duplica', async () => {
    const server = new FakeServer(3);
    const phone = await device();
    const ps = await phone.createSession({ event: '333', name: 'Do celular' });
    for (let i = 0; i < 4; i++) await phone.addSolve(ns(ps.id, 9000 + i, t - 1000 + i));
    await engineFor(phone, network(server)).engine.run();

    // O computador tem dados de antes da conta: o mesmo csTimer importado (outros ids) e um solve só dele.
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333', name: 'Do csTimer' });
    for (let i = 0; i < 4; i++) await desktop.addSolve({ ...ns(ds.id, 9000 + i, t - 1000 + i), id: `cs-velho-${i}` });
    await desktop.addSolve(ns(ds.id, 7777));
    const net = network(server);
    const d = engineFor(desktop, net);
    expect(await d.engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'idle', pending: 0 });
    expect(d.backups).toHaveLength(1);
    const firstPush = net.calls.findIndex((c) => c.changes.length > 0);
    expect(net.calls.slice(0, firstPush).every((c) => c.changes.length === 0)).toBe(true);
    expect(net.calls[firstPush - 1].cursor).toBeGreaterThan(0); // a conta inteira chegou antes da primeira subida
    const active = activeSolves(server);
    expect(active.map((c) => (c.data as { ms: number }).ms).sort()).toEqual([7777, 9000, 9001, 9002, 9003]);
    expect((await desktop.getSyncState()).firstSync).toBe(false);
    expect(await desktop.listSolves()).toHaveLength(5);
  });

  it('se o app fecha no meio do primeiro login, a próxima abertura continua do cursor, sem nova cópia e sem duplicar', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await phone.addSolve(ns(ps.id, 5000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const name = `engine-${++n}`;
    const desktop = createRepository(await openKlickDb(name), { now, channel: null });
    const ds = await desktop.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await desktop.addSolve({ ...ns(ds.id, 5000 + i, t + i), id: `outro-${i}` });
    const net = network(server);
    const real = net.api.sync;
    let calls = 0;
    net.api.sync = async (req) => {
      if (++calls === 2) throw new ApiError('offline', 0);
      return real(req);
    };
    const d = engineFor(desktop, net);
    expect((await d.engine.firstLogin(ACCOUNT)).phase).toBe('offline');
    expect(await desktop.getSyncState()).toMatchObject({ firstSync: true, cursor: 2 });
    expect(net.calls.every((c) => c.changes.length === 0)).toBe(true); // nada subiu antes da conta inteira chegar
    desktop.close();

    // O app abre de novo: outra conexão, outro motor; o primeiro login continua pelo estado gravado.
    const reopened = createRepository(await openKlickDb(name), { now, channel: null });
    const again = engineFor(reopened, network(server));
    expect(await again.engine.run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(again.backups).toEqual([]);
    expect(activeSolves(server)).toHaveLength(3);
    expect(await reopened.listSolves()).toHaveLength(3);
    expect((await reopened.getSyncState()).firstSync).toBe(false);
  });

  it('a cópia que falha não deixa o primeiro login começar; a nova tentativa recomeça por ela', async () => {
    const server = new FakeServer();
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333' });
    await desktop.addSolve(ns(ds.id, 4242));
    const net = network(server);
    let failCopy = true;
    const retries: (() => void)[] = [];
    const { engine, backups } = engineFor(desktop, net, {
      backup: async () => {
        if (failCopy) throw new DOMException('sem espaço', 'QuotaExceededError');
        backups.push(t);
      },
      schedule: (fn) => {
        retries.push(fn);
        return () => undefined;
      },
    });
    expect(await engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'error', error: 'server' });
    expect(net.calls).toEqual([]);
    expect(await desktop.getSyncState()).toMatchObject({ accountId: null, signedIn: false });
    expect(await desktop.outboxCount()).toBe(0);
    failCopy = false;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(backups).toHaveLength(1);
    expect(activeSolves(server).map((c) => (c.data as { ms: number }).ms)).toEqual([4242]);
  });

  it('a mesma conta que volta depois de sair não ganha cópia nem primeiro login: sobe o que mudou enquanto estava fora', async () => {
    const server = new FakeServer();
    const repo = await device(null);
    const net = network(server);
    const d = engineFor(repo, net);
    await d.engine.firstLogin(ACCOUNT);
    await repo.saveSyncState({ signedIn: false }); // saiu, sem apagar
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 3131));
    expect(await d.engine.run()).toMatchObject({ phase: 'off', pending: 2 });
    expect(await d.engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'idle', pending: 0 });
    expect(d.backups).toHaveLength(1);
    expect(await repo.getSyncState()).toMatchObject({ accountId: 'conta-1', signedIn: true, firstSync: false });
    expect(activeSolves(server).map((c) => (c.data as { ms: number }).ms)).toEqual([3131]);
  });

  it('a sessão padrão apagada noutro aparelho: os solves de antes da conta vão para a lixeira, recuperáveis, e estão na cópia', async () => {
    const server = new FakeServer();
    const phone = await device();
    const def = await phone.createSession({ event: '333', id: defaultSessionId('333') });
    await phone.addSolve(ns(def.id, 1000));
    await engineFor(phone, network(server)).engine.run();

    // O computador, ainda sem conta, grava solves na sessão padrão dele (o mesmo id); depois o celular apaga a sessão padrão.
    const desktop = await device(null);
    const dd = await desktop.createSession({ event: '333', id: defaultSessionId('333') });
    expect(dd.id).toBe(def.id);
    for (let i = 0; i < 3; i++) await desktop.addSolve(ns(dd.id, 2000 + i, t + i));
    t += 1000;
    await phone.deleteSession(def.id);
    await engineFor(phone, network(server)).engine.run();
    t += 1000;
    await desktop.addSolve(ns(dd.id, 3000)); // gravado depois da exclusão: devolve a sessão (decisão 5)

    const d = engineFor(desktop, network(server));
    expect(await d.engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'idle', pending: 0 });
    expect((await desktop.listSolves()).map((x) => x.ms)).toEqual([3000]);
    const trash = await desktop.listTrash();
    expect(trash.solves.map((x) => x.ms).sort()).toEqual([1000, 2000, 2001, 2002]); // o 1000 é o do celular, que chegou já apagado
    const mine = trash.solves.find((x) => x.ms === 2001)!;
    // Nada se perdeu: a cópia de antes do primeiro login tem os quatro, ativos.
    const [copy] = await desktop.listBackups();
    expect(copy.reason).toBe('pre-sync');
    const saved = await decodeSnapshot(copy);
    expect(saved.solves.filter((x) => x.deletedAt === null).map((x) => x.ms).sort()).toEqual([2000, 2001, 2002, 3000]);
    // E da lixeira voltam, também para o outro aparelho.
    await desktop.restoreSolve(mine.id);
    await d.engine.run();
    await engineFor(phone, network(server)).engine.run();
    expect((await phone.listSolves()).map((x) => x.ms).sort()).toEqual([2001, 3000]);
    expect((await phone.listSessions()).map((x) => x.id)).toEqual([def.id]);
  });
});

describe('dois aparelhos migrados da versão 2 em horas diferentes (spec 5.6 e 6.5)', () => {
  // Gravado direto na versão 2 e aberto na atual (a migração), com o relógio da migração dado.
  async function migrated(trail: boolean[], migratedAt: number): Promise<Repository> {
    const name = `engine-v2-${++n}`;
    const v2 = await openKlickDb(name, {}, 2);
    const settings = { inspection: true, holdMs: 300, mobileArm: 'two', theme: 'system', sound: { klick: true, insp: true, pb: true }, silent: false, reducedMotion: 'system', dailyGoal: 20, scrambleImage: true, centro: 'animado' };
    await v2.put('profile', { settings, trail, finish: 'fosco', onboarded: true, currentSessionId: null } as never, 'current');
    v2.close();
    return createRepository(await openKlickDb(name, {}, undefined, () => migratedAt), { now, channel: null });
  }

  it('a trilha marcada no primeiro não some pelo padrão do segundo, migrado depois', async () => {
    const server = new FakeServer();
    const phone = await migrated([true, true, false, false, false, false, false, false, false], t - 3_600_000);
    const desktop = await migrated(Array<boolean>(9).fill(false), t - 60_000);
    await engineFor(phone, network(server)).engine.firstLogin(ACCOUNT);
    await engineFor(desktop, network(server)).engine.firstLogin(ACCOUNT);
    await engineFor(phone, network(server)).engine.run();
    expect((await desktop.getProfile()).trail.slice(0, 2)).toEqual([true, true]);
    expect((await phone.getProfile()).trail.slice(0, 2)).toEqual([true, true]);
  });
});

describe('relógio adiantado (decisão do controlador na Task 8)', () => {
  const H2 = 2 * 3_600_000;

  it('depois de um sync, o aparelho duas horas adiantado grava na hora do servidor', async () => {
    const server = new FakeServer();
    server.now = t;
    const ahead = () => t + H2;
    const clock = createServerClock(ahead);
    const repo = createRepository(await openKlickDb(`engine-${++n}`), { now: clock.now, channel: null });
    await repo.saveSyncState({ accountId: 'conta-1', email: 'a@b.c', signedIn: true });
    const { engine } = engineFor(repo, network(server), { now: ahead, clock });
    await engine.run();
    expect(clock.offset()).toBe(-H2);
    const s = await repo.createSession({ event: '333' });
    const x = await repo.addSolve(ns(s.id, 1000));
    expect(x.updatedAt).toBeLessThanOrEqual(server.now + 10);
    await engine.run();
    expect(server.records.get(`solves/${x.id}`)?.updatedAt).toBeLessThanOrEqual(server.now + 10);
    expect(server.records.get(`sessions/${s.id}`)?.deletionStamp).toBeLessThanOrEqual(server.now + 10);
  });

  it('o relógio só atrasa: um aparelho atrasado não é adiantado, e uma resposta sem hora não mexe nele', () => {
    let device = 10_000;
    const clock = createServerClock(() => device);
    clock.observe(50_000);
    expect(clock.offset()).toBe(0);
    clock.observe(4_000);
    expect([clock.offset(), clock.now()]).toEqual([-6_000, 4_000]);
    clock.observe(0);
    clock.observe(Number.NaN);
    expect(clock.offset()).toBe(-6_000);
    device = 20_000;
    clock.observe(20_000); // o relógio do aparelho foi acertado
    expect(clock.offset()).toBe(0);
  });
});

describe('cliente HTTP (spec 6.1)', () => {
  it('erros viram tipos: sem rede, 401, 426 e 5xx; /api/health sem servidor é null', async () => {
    const answer = (status: number) => createSyncApi(async () => new Response('{}', { status }));
    await expect(createSyncApi(async () => Promise.reject(new TypeError('rede'))).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'offline' });
    await expect(answer(401).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'auth' });
    await expect(answer(426).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'update' });
    await expect(answer(503).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'server' });
    await expect(answer(400).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'client', status: 400 });
    await expect(createSyncApi(async () => new Response('<!doctype html>', { status: 200 })).sync({} as SyncRequest)).rejects.toMatchObject({ kind: 'server' });
    expect(await createSyncApi(async () => new Response('<!doctype html>', { status: 200 })).health()).toBeNull();
    expect(await createSyncApi(async () => Response.json({ accounts: true, turnstileSiteKey: 'k' })).health()).toEqual({ accounts: true, turnstileSiteKey: 'k' });
  });

  it('o pedido de sync vai como JSON, na mesma origem', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = createSyncApi(async (url, init) => {
      seen.push({ url, init });
      return Response.json({ accepted: 0, rejected: [], changes: [], cursor: 0, more: false, serverTime: 1 });
    });
    await api.sync({ v: 1, deviceId: 'd', cursor: 0, clock: 0, changes: [] });
    expect(seen[0].url).toBe('/api/sync');
    expect(seen[0].init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
  });
});
