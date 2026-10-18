import { describe, expect, it, vi } from 'vitest';
import { seasonOne } from '../../src/core/season';
import { SYNC_PROTOCOL, type SyncRequest, type SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { defaultSessionId } from '../../src/data/ids';
import { createRepository, type Repository } from '../../src/data/repository';
import { createBackup, decodeSnapshot } from '../../src/data/safety';
import { ApiError, createSyncApi, type Fetcher, HEALTH_TIMEOUT_MS, SYNC_TIMEOUT_MS } from '../../src/sync/api';
import { createServerClock, createSyncEngine, MASS_DELETE, MAX_BUDGET_WAIT_MS, RETRY_MS, type EngineDeps, type SyncStatus } from '../../src/sync/engine';
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

// Uma promessa que o teste resolve na hora que quer (um pedido que fica "na rede").
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
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

  // C1: o pedido diz a conta que este aparelho espera, e o servidor recusa (401) a sessão de outra conta. A volta não é juntada, a fila fica
  // inteira e o motor espera a pessoa entrar de novo, como em qualquer 401.
  it('o pedido leva a conta daqui; a sessão de outra conta (401) não tira nada da fila nem traz nada, e o motor não insiste', async () => {
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000));
    const other = new FakeServer();
    other.sync({ v: SYNC_PROTOCOL, account: 'conta-2', deviceId: 'b', cursor: 0, clock: 0, changes: [] });
    const net = network(other);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      if (req.account !== 'conta-2') {
        net.calls.push(structuredClone(req));
        throw new ApiError('auth', 401); // o cookie é da conta 2
      }
      return real(req);
    };
    const schedule = vi.fn(() => () => undefined);
    const { engine } = engineFor(repo, net, { schedule });
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'auth', pending: 2 });
    expect(net.calls.map((c) => c.account)).toEqual(['conta-1']);
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'auth' });
    expect(net.calls).toHaveLength(1);
    expect(schedule).not.toHaveBeenCalled();
    expect(other.records.size).toBe(0);
    expect(await repo.outboxCount()).toBe(2);
    expect((await repo.getSyncState()).cursor).toBe(0);
  });

  // Só uma entrada de verdade tira o 401: uma saída que falhou e desfez a parada (resume sem a conta de volta) não.
  it('depois de um 401, resume() sem a conta de volta só tira a parada; resume(true) tira o erro de sessão', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const { engine } = engineFor(repo, net, { schedule: () => () => undefined });
    net.failNext(new ApiError('auth', 401));
    expect(await engine.run()).toMatchObject({ error: 'auth' });
    await engine.stop();
    engine.resume();
    expect(await engine.run()).toMatchObject({ error: 'auth' });
    expect(net.calls).toHaveLength(1);
    engine.resume(true);
    expect(await engine.run()).toMatchObject({ phase: 'idle', error: null });
    expect(net.calls).toHaveLength(2);
  });

  // A revisão final (I2): o cursor andava por cima do que esta versão do app recusou (um evento, uma chave de ajuste ou um acabamento que
  // só uma versão mais nova conhece), e o PWA antigo nunca mais recebia esses registros, nem depois de atualizar. Com algo recusado, o lote
  // marca a versão; a primeira abertura de outra versão recomeça o cursor do 0 uma vez (baixar de novo é idempotente) e tira a marca.
  it('o lote com algo que esta versão recusa marca a versão; a mesma versão não recomeça; a seguinte baixa tudo de novo, uma vez (I2)', async () => {
    const server = new FakeServer();
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(s.id, 1000));
    await engineFor(phone, network(server), { build: 'v1' }).engine.run();
    // Um aparelho com uma versão mais nova gravou um solve de um evento que a v1 não conhece.
    const novo = {
      store: 'solves' as const, id: 'do-futuro', updatedAt: t, deletedAt: null, deletionStamp: t,
      data: { sessionId: s.id, event: 'evento-novo', ms: 2000, penalty: null, at: t, scramble: 'R', note: '', createdAt: t },
    };
    server.records.set('solves/do-futuro', { ...novo, rev: ++server.rev });
    const desktop = await device();
    const old = network(server);
    await engineFor(desktop, old, { build: 'v1' }).engine.run();
    expect(await desktop.getSyncState()).toMatchObject({ cursor: server.rev, refusedBuild: 'v1' });
    expect((await desktop.listSolves()).map((x) => x.id)).not.toContain('do-futuro');
    // A versão nova entende o registro (aqui, o servidor o devolve válido, com a mesma revisão: ele não mudou de novo).
    server.records.set('solves/do-futuro', { ...novo, data: { ...novo.data, event: '333' }, rev: server.rev });
    await engineFor(desktop, old, { build: 'v1' }).engine.run(); // a mesma versão: o cursor não volta
    expect(old.calls.at(-1)?.cursor).toBe(server.rev);
    expect((await desktop.listSolves()).map((x) => x.id)).not.toContain('do-futuro');
    const updated = network(server);
    const v2 = engineFor(desktop, updated, { build: 'v2' }).engine;
    await v2.run(); // a primeira abertura da versão nova
    expect(updated.calls[0].cursor).toBe(0);
    expect((await desktop.listSolves()).map((x) => x.id)).toContain('do-futuro');
    expect(await desktop.getSyncState()).toMatchObject({ cursor: server.rev, refusedBuild: null });
    await v2.run();
    expect(updated.calls.at(-1)?.cursor).toBe(server.rev); // uma vez só
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
    // Até a conta voltar (resume ou firstLogin), nenhum gatilho chama o servidor: sem um 401 por gatilho.
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'auth' });
    expect(net.calls).toHaveLength(1);
    engine.resume(true); // a conta entrou de novo
    net.failNext(new ApiError('offline', 0));
    expect(await engine.run()).toMatchObject({ phase: 'offline', error: null, pending: 2 });
    expect(net.calls).toHaveLength(2);
  });

  it('401 e depois o primeiro login: a rodada volta a sair', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const { engine } = engineFor(repo, net);
    net.failNext(new ApiError('auth', 401));
    expect((await engine.run()).error).toBe('auth');
    expect((await engine.firstLogin(ACCOUNT)).phase).toBe('idle');
    expect(net.calls).toHaveLength(2);
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

  // A exclusão da sessão vem de um aparelho que não tinha os solves dela (o notebook só viu a sessão): no servidor, a cascata os apaga depois
  // dela, nas revisões seguintes, e a exclusão chega aqui com só 4 deles. (A fila de quem tem os solves leva a exclusão deles antes da
  // sessão, revisão final I4: esses chegam como exclusões comuns.)
  it(`um lote pequeno cuja cascata apaga ${MASS_DELETE} solves também pede a cópia antes de juntar (spec 6.6)`, async () => {
    const server = new FakeServer(5); // a exclusão da sessão chega com só 4 dos solves dela
    const phone = await device();
    const laptop = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    await engineFor(phone, network(server)).engine.run();
    await engineFor(laptop, network(server)).engine.run();
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
    await laptop.deleteSession(s.id);
    await engineFor(laptop, network(server)).engine.run();
    const before = sizes.length;
    await engine.run();
    expect(sizes[before]).toBeLessThan(MASS_DELETE);
    expect(copies).toEqual([{ at: before + 1, solves: MASS_DELETE }]); // no primeiro lote da exclusão, antes de juntar
    expect(await desktop.listSolves()).toEqual([]);
  });

  it('426: o servidor pede um app mais novo, sem nova tentativa; outro 4xx (429) tenta de novo', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const waits: number[] = [];
    const { engine } = engineFor(repo, net, {
      schedule: (_fn, ms) => {
        waits.push(ms);
        return () => undefined;
      },
    });
    net.failNext(new ApiError('update', 426));
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'update' });
    expect(waits).toEqual([]);
    net.failNext(new ApiError('client', 429));
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'server' });
    expect(waits).toEqual([RETRY_MS[0]]);
  });

  it('uma resposta fora da forma não tira nada da fila: erro do servidor e nova tentativa (spec 6.1)', async () => {
    const repo = await device();
    await repo.createSession({ event: '333' });
    const api = createSyncApi(async () => Response.json({ accepted: 1, changes: 'nada', cursor: 1, more: false, serverTime: 1 }));
    const waits: number[] = [];
    const { engine } = engineFor(repo, { ...network(new FakeServer()), api }, {
      schedule: (_fn, ms) => {
        waits.push(ms);
        return () => undefined;
      },
    });
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'server', pending: 1 });
    expect(await repo.outboxCount()).toBe(1);
    expect(waits).toEqual([RETRY_MS[0]]);
  });

  it('o servidor que diz `more` sem avançar o cursor não prende a rodada: log, erro do servidor e nova tentativa', async () => {
    const lines: string[] = [];
    const waits: number[] = [];
    const extra = {
      schedule: (_fn: () => void, ms: number) => {
        waits.push(ms);
        return () => undefined;
      },
      log: (l: string) => lines.push(l),
    };
    const stuck = (net: ReturnType<typeof network>) => {
      const real = net.api.sync;
      net.api.sync = async (req) => ({ ...(await real(req)), cursor: req.cursor, more: true });
      return net;
    };
    // Na subida: nada confirmado, nada juntado.
    const repo = await device();
    await repo.createSession({ event: '333' });
    const net = stuck(network(new FakeServer()));
    expect(await engineFor(repo, net, extra).engine.run()).toMatchObject({ phase: 'error', error: 'server', pending: 1 });
    expect(net.calls).toHaveLength(1);
    expect(await repo.outboxCount()).toBe(1);
    // Na descida do primeiro login, também.
    const fresh = await device(null);
    const pull = stuck(network(new FakeServer()));
    expect(await engineFor(fresh, pull, extra).engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'error', error: 'server' });
    expect(pull.calls).toHaveLength(1);
    expect((await fresh.getSyncState()).firstSync).toBe(true);
    expect(waits).toEqual([RETRY_MS[0], RETRY_MS[0]]);
    expect(lines).toEqual(['sync: o servidor mandou mais sem avançar o cursor (0)', 'sync: o servidor mandou mais sem avançar o cursor (0)']);
  });

  it('pedidos durante uma rodada viram uma rodada a mais, só uma, dividida por todos (decisão 20)', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const real = net.api.sync;
    const gate = deferred();
    const inFlight = deferred();
    net.api.sync = async (req) => {
      if (net.calls.length === 0) {
        inFlight.resolve();
        await gate.promise;
      }
      return real(req);
    };
    const { engine } = engineFor(repo, net);
    const a = engine.run();
    await inFlight.promise;
    const b = engine.run();
    const c = engine.run();
    expect(b).toBe(c);
    expect(b).not.toBe(a);
    gate.resolve();
    expect((await Promise.all([a, b, c])).map((x) => x.phase)).toEqual(['idle', 'idle', 'idle']);
    expect(net.calls).toHaveLength(2);
    await engine.run();
    expect(net.calls).toHaveLength(3);
  });

  it('uma rodada que rejeita não prende a rodada a mais pedida durante ela (decisão 20)', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    let shown = 0;
    const { engine } = engineFor(repo, net, {
      onStatus: () => {
        if (++shown <= 2) throw new Error('a tela caiu'); // o aviso da rodada e o do erro dela
      },
    });
    const a = engine.run();
    const b = engine.run();
    await expect(a).rejects.toThrow('a tela caiu');
    expect((await b).phase).toBe('idle');
    expect(net.calls).toHaveLength(1);
  });

  it('Sair e apagar: o stop() espera a rodada em andamento, e depois dele nada é gravado nem pedido (spec 7.7)', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const real = net.api.sync;
    const gate = deferred();
    const inFlight = deferred();
    net.api.sync = async (req) => {
      inFlight.resolve();
      await gate.promise;
      return real(req);
    };
    const { engine } = engineFor(desktop, net);
    const round = engine.run();
    await inFlight.promise;
    let drained = false;
    const stopped = engine.stop().then(() => {
      drained = true;
    });
    // Parado: um gatilho não pede a rodada a mais; devolve o estado na hora, sem pedido.
    expect((await engine.run()).phase).toBe('syncing');
    await new Promise((r) => setTimeout(r, 10));
    expect(drained).toBe(false); // a resposta ainda está na rede
    gate.resolve();
    await stopped;
    expect((await round).phase).toBe('idle'); // terminou antes do stop() resolver
    // O que a Task 15 faz depois do stop(): a fila vazia deixa apagar.
    expect(await desktop.outboxCount()).toBe(0);
    await desktop.wipeData();
    expect((await engine.run()).phase).toBe('idle'); // parado: devolve o estado, sem rodada
    expect(net.calls).toHaveLength(1);
    expect(await desktop.listSolves({ includeDeleted: true })).toEqual([]);
    expect(await desktop.listSessions({ includeDeleted: true })).toEqual([]);
    expect(await desktop.getSyncState()).toMatchObject({ accountId: null, cursor: 0 });
    engine.resume();
    expect(await engine.run()).toMatchObject({ phase: 'off', pending: 0 });
    expect(net.calls).toHaveLength(1);
  });

  it('a conta que sai no meio da rodada, sem esperar o motor: a resposta é descartada, sem confirmar, juntar nem guardar o cursor', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    await desktop.createSession({ event: '333' }); // na fila
    const net = network(server);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      await desktop.saveSyncState({ signedIn: false });
      return res;
    };
    const lines: string[] = [];
    const schedule = vi.fn(() => () => undefined);
    const { engine } = engineFor(desktop, net, { log: (l) => lines.push(l), schedule });
    expect(await engine.run()).toMatchObject({ phase: 'off', pending: 1 });
    expect(await desktop.outboxCount()).toBe(1); // sem confirmSent
    expect(await desktop.listSolves({ includeDeleted: true })).toEqual([]); // sem applyRemote
    expect((await desktop.getSyncState()).cursor).toBe(0);
    expect(schedule).not.toHaveBeenCalled();
    expect(lines).toEqual(['sync: a conta mudou durante a rodada; a resposta foi descartada']);
  });

  it('a conta que sai enquanto a volta espera o solve terminar: a resposta também é descartada', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const real = net.api.sync;
    let busy = false;
    net.api.sync = async (req) => {
      const res = await real(req);
      busy = true;
      return res;
    };
    const { engine } = engineFor(desktop, net, {
      busy: () => busy,
      sleep: async () => {
        await desktop.saveSyncState({ signedIn: false }); // saiu durante o solve
        busy = false;
      },
    });
    expect((await engine.run()).phase).toBe('off');
    expect(await desktop.listSolves({ includeDeleted: true })).toEqual([]);
    expect((await desktop.getSyncState()).cursor).toBe(0);
  });

  it('dados apagados no meio da rodada: nada da conta fica no aparelho, e o primeiro login noutra conta não leva nada dela', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      await desktop.wipeData();
      return res;
    };
    expect((await engineFor(desktop, net).engine.run()).phase).toBe('off');
    expect(await desktop.listSolves({ includeDeleted: true })).toEqual([]);
    expect(await desktop.listSessions({ includeDeleted: true })).toEqual([]);
    const other = new FakeServer();
    await engineFor(desktop, network(other)).engine.firstLogin({ accountId: 'conta-2', email: 'b@c.d' });
    expect(other.records.size).toBe(0);
  });

  it('a conta que troca no meio da rodada: nada é juntado, e a nova tentativa relê o estado', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      await desktop.saveSyncState({ accountId: 'conta-2' });
      return res;
    };
    const waits: number[] = [];
    const { engine } = engineFor(desktop, net, {
      schedule: (_fn, ms) => {
        waits.push(ms);
        return () => undefined;
      },
    });
    expect(await engine.run()).toMatchObject({ phase: 'error', error: 'server' });
    expect(await desktop.listSolves({ includeDeleted: true })).toEqual([]);
    expect(waits).toEqual([RETRY_MS[0]]);
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

  it('a fila do primeiro login e a deduplicação esperam o solve que começou durante a cópia ou a descida (spec 6.2)', async () => {
    const server = new FakeServer();
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333' });
    await desktop.addSolve(ns(ds.id, 4242));
    let busy = false;
    // O repositório visto pelo motor: cada lote juntado (com o cursor) liga o timer, como um solve que começa logo depois.
    const watched = new Proxy(desktop, {
      get(target, key) {
        if (key === 'applyRemote')
          return async (...args: Parameters<Repository['applyRemote']>) => {
            const joined = await target.applyRemote(...args);
            if (args[3]) busy = true;
            return joined;
          };
        const value = Reflect.get(target, key) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
      },
    });
    const seen: string[] = [];
    const { engine } = engineFor(desktop, network(server), {
      repo: () => watched,
      busy: () => busy,
      backup: async () => {
        await createBackup(desktop, 'pre-sync', t);
        busy = true; // o solve começou durante a cópia
      },
      sleep: async () => {
        const state = await desktop.getSyncState();
        seen.push(`${state.accountId ?? 'sem conta'} firstSync=${state.firstSync} fila=${await desktop.outboxCount()}`);
        busy = false;
      },
    });
    expect(await engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'idle', pending: 0 });
    expect(seen).toEqual([
      'sem conta firstSync=false fila=0', // a fila ainda não foi montada
      'conta-1 firstSync=true fila=2', // a deduplicação ainda não rodou
    ]);
  });

  it('o progresso de um primeiro sync em lotes: recebidos na descida, enviados na subida', async () => {
    const server = new FakeServer(2);
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await phone.addSolve(ns(ps.id, 5000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333' });
    await desktop.addSolve(ns(ds.id, 7777));
    const d = engineFor(desktop, network(server));
    await d.engine.firstLogin(ACCOUNT);
    expect(d.statuses.map((s) => s.phase)).toEqual(['syncing', 'syncing', 'syncing', 'syncing', 'idle']);
    expect(d.statuses.map((s) => s.progress)).toEqual([
      { sent: 0, total: 2, received: 0 },
      { sent: 0, total: 2, received: 2 }, // a conta desce de 2 em 2
      { sent: 0, total: 2, received: 4 },
      { sent: 2, total: 2, received: 6 }, // o que é daqui sobe, e volta com a revisão
      null,
    ]);
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

  it('o stop() descarta o primeiro login que ainda não começou: depois de sair, nada entra sozinho', async () => {
    const desktop = await device(null);
    const net = network(new FakeServer());
    let failCopy = true;
    const { engine, backups } = engineFor(desktop, net, {
      backup: async () => {
        if (failCopy) throw new DOMException('sem espaço', 'QuotaExceededError');
        backups.push(t);
      },
      schedule: () => () => undefined,
    });
    expect(await engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'error', error: 'server' });
    await engine.stop(); // saiu
    engine.resume();
    failCopy = false;
    expect((await engine.run()).phase).toBe('off');
    expect(backups).toEqual([]);
    expect(net.calls).toEqual([]);
    expect((await desktop.getSyncState()).accountId).toBeNull();
  });

  it('o stop() no meio de um primeiro sync em lotes volta depois do pedido em andamento: a rodada para ali, sem nova tentativa', async () => {
    const server = new FakeServer(1);
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    for (let i = 0; i < 4; i++) await phone.addSolve(ns(ps.id, 1000 + i, t + i));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device(null);
    const net = network(server);
    const real = net.api.sync;
    const gate = deferred();
    const second = deferred();
    net.api.sync = async (req) => {
      if (net.calls.length === 1) {
        second.resolve();
        await gate.promise;
      }
      return real(req);
    };
    const schedule = vi.fn(() => () => undefined);
    const { engine } = engineFor(desktop, net, { schedule });
    const round = engine.firstLogin(ACCOUNT);
    await second.promise; // o segundo pedido da descida está na rede
    const stopped = engine.stop();
    gate.resolve();
    await stopped;
    expect(await round).toMatchObject({ phase: 'off', error: null, progress: null });
    expect(net.calls).toHaveLength(2); // nenhum pedido depois do que estava na rede
    expect(schedule).not.toHaveBeenCalled();
    expect(await desktop.getSyncState()).toMatchObject({ firstSync: true, cursor: 2 }); // o primeiro login continua de onde parou
    engine.resume();
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect(await desktop.listSolves()).toHaveLength(4);
  });

  it('o stop() durante a cópia do primeiro login: a conta não entra, nada vai para a fila e nenhum pedido sai', async () => {
    const desktop = await device(null);
    const ds = await desktop.createSession({ event: '333' });
    await desktop.addSolve(ns(ds.id, 4242));
    const net = network(new FakeServer());
    const copying = deferred();
    const copied = deferred();
    const { engine } = engineFor(desktop, net, {
      backup: async () => {
        copying.resolve();
        await copied.promise;
      },
    });
    const round = engine.firstLogin(ACCOUNT);
    await copying.promise;
    const stopped = engine.stop(); // saiu enquanto a cópia era feita
    copied.resolve();
    await stopped;
    expect((await round).phase).toBe('off');
    expect(await desktop.getSyncState()).toMatchObject({ accountId: null, signedIn: false });
    expect(await desktop.outboxCount()).toBe(0);
    expect(net.calls).toEqual([]);
  });

  it('um primeiro login pedido enquanto o stop() espera não é esperado por ele', async () => {
    const desktop = await device(null);
    const net = network(new FakeServer());
    const real = net.api.sync;
    const gates = [deferred(), deferred()];
    const sent = [deferred(), deferred()];
    net.api.sync = async (req) => {
      const i = net.calls.length; // antes de real(), que conta o pedido
      sent[i]?.resolve();
      await gates[i]?.promise;
      return real(req);
    };
    const { engine } = engineFor(desktop, net);
    await desktop.saveSyncState({ accountId: 'conta-1', email: 'a@b.c', signedIn: true });
    const round = engine.run();
    await sent[0].promise;
    let drained = false;
    const stopped = engine.stop().then(() => {
      drained = true;
    });
    const login = engine.firstLogin({ accountId: 'conta-2', email: 'b@c.d' }); // entrou de novo antes de a espera terminar
    gates[0].resolve();
    await round;
    await sent[1].promise; // a rodada do login está na rede
    await stopped;
    expect(drained).toBe(true);
    gates[1].resolve();
    expect((await login).phase).toBe('idle');
  });

  it('o lote do servidor só entra se a conta ainda é a da rodada, conferida dentro da transação (outra aba que apaga no meio)', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const real = desktop.applyRemote.bind(desktop);
    const accounts: (string | undefined)[] = [];
    desktop.applyRemote = async (changes, serverTime, accountId) => {
      accounts.push(accountId);
      await desktop.wipeData(); // outra aba apagou os dados entre a conferência do motor e a transação
      return real(changes, serverTime, accountId);
    };
    const lines: string[] = [];
    const { engine } = engineFor(desktop, network(server), { log: (l) => lines.push(l) });
    expect((await engine.run()).phase).toBe('off');
    expect(accounts).toEqual(['conta-1']);
    expect(await desktop.listSolves({ includeDeleted: true })).toEqual([]);
    expect(await desktop.listSessions({ includeDeleted: true })).toEqual([]);
    expect(await desktop.getSyncState()).toMatchObject({ accountId: null, cursor: 0 });
    expect(lines).toEqual(['sync: a conta mudou durante a rodada; a resposta foi descartada']);
  });

  it('o cursor é gravado na mesma transação que junta o lote: a conta que troca logo depois não recebe o cursor da anterior', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const real = desktop.applyRemote.bind(desktop);
    let switched = false;
    desktop.applyRemote = async (...args) => {
      const result = await real(...args);
      if (!switched) {
        switched = true;
        // A líder congelou aqui; enquanto isso, outra aba trocou de conta (o primeiro login da conta 2).
        await desktop.beginFirstSync({ accountId: 'conta-2', email: 'b@c.d' });
      }
      return result;
    };
    const { engine } = engineFor(desktop, network(server), { schedule: () => () => undefined });
    await engine.run();
    expect(await desktop.getSyncState()).toMatchObject({ accountId: 'conta-2', firstSync: true, cursor: 0, lastSyncAt: null });
  });

  it('o stop() não espera o solve terminar: a rodada que espera o timer para ali, sem pedido', async () => {
    const repo = await device();
    const net = network(new FakeServer());
    const { engine } = engineFor(repo, net, { busy: () => true, sleep: () => new Promise((r) => setTimeout(r, 1)) });
    const round = engine.run();
    await new Promise((r) => setTimeout(r, 5));
    await engine.stop();
    expect((await round).phase).toBe('off');
    expect(net.calls).toHaveLength(0);
  });

  it('o stop() com a volta esperando o solve terminar: a volta não é juntada nem o cursor anda; a próxima rodada a recebe', async () => {
    const server = new FakeServer();
    const phone = await device();
    const ps = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(ps.id, 1000));
    await engineFor(phone, network(server)).engine.run();
    const desktop = await device();
    const net = network(server);
    const real = net.api.sync;
    let busy = false;
    const answered = deferred();
    net.api.sync = async (req) => {
      const res = await real(req);
      if (net.calls.length === 1) {
        busy = true; // a primeira resposta chegou durante um solve
        answered.resolve();
      }
      return res;
    };
    const { engine } = engineFor(desktop, net, { busy: () => busy, sleep: () => new Promise((r) => setTimeout(r, 1)) });
    const round = engine.run();
    await answered.promise;
    await engine.stop();
    expect((await round).phase).toBe('off');
    expect(await desktop.listSolves()).toEqual([]);
    expect((await desktop.getSyncState()).cursor).toBe(0);
    busy = false;
    engine.resume();
    expect((await engine.run()).phase).toBe('idle');
    expect(await desktop.listSolves()).toHaveLength(1);
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

describe('a cota e o orçamento do dia (endurecimento 4.1 e decisões 4 e 6)', () => {
  const LIMITS = { solves: 2, sessions: 10, practice: 10 };
  const DAY = 86_400_000;
  const ids = (req: SyncRequest | undefined) => (req?.changes ?? []).map((c) => c.id);

  // Uma conta de dois solves e um aparelho com três: a conta fica cheia e o terceiro, só neste aparelho.
  async function fullAccount() {
    const server = new FakeServer(500, { limits: LIMITS });
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    const a = await repo.addSolve(ns(s.id, 1000, t));
    const b = await repo.addSolve(ns(s.id, 2000, t + 1));
    const c = await repo.addSolve(ns(s.id, 3000, t + 2));
    const net = network(server);
    const { engine } = engineFor(repo, net);
    const first = await engine.run();
    return { server, repo, net, engine, s, a, b, c, first };
  }

  it('a cota: o terceiro solve sai da fila, fica só neste aparelho, não volta sozinho, e o estado diz quota', async () => {
    const { server, repo, net, engine, a, b, c, first } = await fullAccount();
    expect(first).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(activeSolves(server).map((x) => x.id).sort()).toEqual([a.id, b.id].sort());
    expect(await repo.heldCount()).toBe(1);
    expect((await repo.listSolves()).map((x) => x.id)).toEqual([a.id, b.id, c.id]); // nada some do aparelho
    t += 10;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: null });
    expect(ids(net.calls.at(-1))).toEqual([]); // sem reenvio sozinho
    expect(await repo.heldCount()).toBe(1);
    expect(await repo.localOnlyCount()).toBe(1);
  });

  it('Enviar de novo com vaga na conta sobe e zera a lista', async () => {
    const { server, repo, engine, a, b, c } = await fullAccount();
    expect(await repo.requeueHeld()).toBe(1);
    expect(await engine.run()).toMatchObject({ pending: 0, notice: 'quota' }); // ainda cheia: volta para a lista
    expect(await repo.heldCount()).toBe(1);
    t += 10;
    await repo.deleteSolve(a.id); // abre a vaga
    await engine.run();
    expect(await repo.requeueHeld()).toBe(1);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: null });
    expect(activeSolves(server).map((x) => x.id).sort()).toEqual([b.id, c.id].sort());
    expect(await repo.heldCount()).toBe(0);
  });

  // Review Focus 2.
  it('um solve guardado e depois apagado aqui sobe como apagado e sai da lista', async () => {
    const { server, repo, net, engine, c } = await fullAccount();
    t += 10;
    await repo.deleteSolve(c.id);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: null });
    expect(ids(net.calls.at(-1))).toEqual([c.id]);
    expect(server.records.get(`solves/${c.id}`)).toMatchObject({ deletedAt: expect.any(Number) });
    expect(await repo.heldCount()).toBe(0);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([c.id]); // na lixeira daqui, recuperável
  });

  it('editado, continua guardado e nada some do aparelho', async () => {
    const { server, repo, net, engine, c } = await fullAccount();
    t += 10;
    await repo.updateSolve(c.id, { note: 'boa' });
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(ids(net.calls.at(-1))).toEqual([c.id]); // a edição sobe, e a conta recusa de novo
    expect(server.records.has(`solves/${c.id}`)).toBe(false);
    expect(await repo.heldCount()).toBe(1);
    expect((await repo.listSolves()).find((x) => x.id === c.id)).toMatchObject({ note: 'boa', deletedAt: null });
    expect(await repo.listSolves()).toHaveLength(3);
  });

  it('restaurado da lixeira com a conta cheia volta para a lista', async () => {
    const { server, repo, engine, c } = await fullAccount();
    t += 10;
    await repo.deleteSolve(c.id);
    await engine.run();
    expect(await repo.heldCount()).toBe(0);
    t += 10;
    await repo.restoreSolve(c.id);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(await repo.heldCount()).toBe(1);
    expect(server.records.get(`solves/${c.id}`)).toMatchObject({ deletedAt: expect.any(Number) }); // restaurar conta como novo
    expect((await repo.listSolves()).map((x) => x.id)).toContain(c.id);
  });

  // Decisão (a): a resposta traz a chave recusada pela cota e também uma escrita dela (apagada pela cascata do servidor). A fila é confirmada
  // antes de juntar a volta, e a escrita é juntada pela regra de sempre: apagada nos dois lados, a chave sai da lista.
  it('a chave recusada e apagada pela cascata na mesma resposta é juntada e sai da lista', async () => {
    const server = new FakeServer(500, { limits: LIMITS });
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    await repo.addSolve(ns(s.id, 1000, t));
    await repo.addSolve(ns(s.id, 2000, t + 1));
    const c = await repo.addSolve(ns(s.id, 3000, t + 2));
    const net = network(server);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      const sent = req.changes.find((x) => x.id === c.id);
      if (!sent) return res;
      return { ...res, changes: [...res.changes, { ...sent, deletedAt: t + 50, deletionStamp: t + 50 }] };
    };
    expect(await engineFor(repo, net).engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: 'quota' });
    expect(await repo.heldCount()).toBe(0);
    expect((await repo.listTrash()).solves.map((x) => x.id)).toEqual([c.id]); // juntada, e o conteúdo fica na lixeira daqui
  });

  // Decisão (b): uma sessão guardada pela cota, e depois um solve gravado nela. Com vaga de sessão aberta noutro aparelho, o servidor aceitaria
  // o solve sozinho e ele ficaria sem sessão nos outros aparelhos: o solve vai para a lista com ela e só sobe com "Enviar de novo".
  it('o solve gravado numa sessão guardada não sobe sem ela: o servidor nunca recebe um solve sem a sessão', async () => {
    const server = new FakeServer(500, { limits: { solves: 10, sessions: 1, practice: 10 } });
    const phone = await device();
    const desktop = await device();
    const s1 = await phone.createSession({ event: '333' });
    await phone.addSolve(ns(s1.id, 1000));
    const net = network(server);
    const { engine } = engineFor(phone, net);
    await engine.run();
    t += 10;
    const s2 = await phone.createSession({ event: '333' });
    expect(await engine.run()).toMatchObject({ pending: 0, notice: 'quota' });
    expect(await phone.heldCount()).toBe(1);
    await engineFor(desktop, network(server)).engine.run();
    t += 10;
    await desktop.deleteSession(s1.id); // a conta ganha vaga para uma sessão
    await engineFor(desktop, network(server)).engine.run();
    t += 10;
    const x = await phone.addSolve(ns(s2.id, 2000));
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(net.calls.flatMap((c) => c.changes).some((c) => c.id === x.id)).toBe(false);
    expect(await phone.heldCount()).toBe(2);
    const orphans = () => {
      const active = server.active();
      return [...active.values()].filter((c) => c.store === 'solves' && !active.has(`sessions/${(c.data as { sessionId: string }).sessionId}`));
    };
    expect(orphans()).toEqual([]);
    // Enviar de novo: a sessão vai antes do solve, e os dois entram.
    expect(await phone.requeueHeld()).toBe(2);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(ids(net.calls.at(-1))).toEqual([s2.id, x.id]);
    expect(server.active().has(`solves/${x.id}`)).toBe(true);
    expect(orphans()).toEqual([]);
    expect(await phone.heldCount()).toBe(0);
  });

  // Decisões (d) e (e): uma exclusão que chega com o conteúdo maior pode ser recusada no teto de bytes da conta (o admit do servidor). Ela
  // fica guardada como qualquer recusa, e o solve continua ativo nos outros aparelhos até "Enviar de novo".
  it('a exclusão recusada no teto fica só neste aparelho, e o solve continua ativo nos outros até Enviar de novo', async () => {
    const server = new FakeServer();
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    const a = await phone.addSolve(ns(s.id, 1000));
    const { engine } = engineFor(phone, network(server));
    await engine.run();
    const other = engineFor(desktop, network(server)).engine;
    await other.run();
    server.admit = (_before, next) => !(next.store === 'solves' && next.deletedAt !== null);
    t += 10;
    await phone.deleteSolve(a.id);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(await phone.heldCount()).toBe(1);
    await other.run();
    expect((await desktop.listSolves()).map((x) => x.id)).toEqual([a.id]);
    server.admit = undefined; // a conta encolheu
    expect(await phone.requeueHeld()).toBe(1);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(await phone.heldCount()).toBe(0);
    await other.run();
    expect(await desktop.listSolves()).toEqual([]);
    expect((await desktop.listTrash()).solves.map((x) => x.id)).toEqual([a.id]);
  });

  // Review Focus 3.
  it('o orçamento corta o lote: o resto fica na fila na mesma ordem, a rodada continua recebendo, nada sobe antes de retryAt, e depois sobe', async () => {
    const server = new FakeServer(2, { budget: 3 });
    server.now = t;
    const desktop = await device();
    const ds = await desktop.createSession({ event: '333', name: 'Do computador' });
    await desktop.addSolve(ns(ds.id, 5000, t));
    await desktop.addSolve(ns(ds.id, 5001, t + 1));
    await engineFor(desktop, network(server)).engine.run();
    server.newDay();
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    const mine = [];
    for (let i = 0; i < 4; i++) mine.push(await phone.addSolve(ns(s.id, 1000 + i, t + i)));
    const net = network(server);
    const { engine } = engineFor(phone, net);
    const retryAt = (Math.floor(t / DAY) + 1) * DAY;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 2, refused: 0, notice: 'budget' });
    expect(net.calls.map(ids)).toEqual([[s.id, ...mine.map((x) => x.id)], [], []]); // um lote, e depois só recebendo
    expect(activeSolves(server)).toHaveLength(4); // dois de cada aparelho
    expect(await phone.listSolves()).toHaveLength(6); // recebeu os do computador
    expect(await phone.getSyncState()).toMatchObject({ pushAfter: retryAt, cursor: server.rev });
    // Antes de retryAt nada sobe, nem o que foi gravado depois.
    t += 1000;
    const late = await phone.addSolve(ns(s.id, 1999, t));
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 3, notice: 'budget' });
    expect(ids(net.calls.at(-1))).toEqual([]);
    // Virou o dia (UTC): o resto sobe, na ordem em que ficou na fila.
    t = retryAt + 1;
    server.now = t;
    server.newDay();
    const before = net.calls.length;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: null });
    expect(ids(net.calls[before])).toEqual([mine[2].id, mine[3].id, late.id]);
    expect(activeSolves(server)).toHaveLength(7);
    expect((await phone.getSyncState()).pushAfter).toBeNull();
  });

  it('cota e orçamento no mesmo lote', async () => {
    const server = new FakeServer(500, { limits: { solves: 1, sessions: 10, practice: 10 }, budget: 3 });
    server.now = t;
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    const mine = [];
    for (let i = 0; i < 4; i++) mine.push(await repo.addSolve(ns(s.id, 1000 + i, t + i)));
    const { engine } = engineFor(repo, network(server));
    // O lido do lote: a sessão e o primeiro solve entram, o segundo fica só neste aparelho; os dois últimos ficam na fila para amanhã.
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 2, refused: 0, notice: 'budget' });
    expect(activeSolves(server).map((x) => x.id)).toEqual([mine[0].id]);
    expect(await repo.heldCount()).toBe(1);
    t = (Math.floor(t / DAY) + 1) * DAY;
    server.now = t;
    server.newDay();
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(await repo.heldCount()).toBe(3);
    expect(await repo.listSolves()).toHaveLength(4); // nada some do aparelho
  });

  // A hora de retryAt é a do servidor: o dia que virou durante o pedido (retryAt já passou para ele) não pausa nada.
  it('com retryAt já passado não pausa: o resto sobe na mesma rodada; o lote que o servidor não leu não se repete na rodada', async () => {
    const server = new FakeServer(500, { budget: 2 });
    server.now = t;
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await repo.addSolve(ns(s.id, 1000 + i, t + i));
    const net = network(server);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      if (res.retryAt === undefined) return res;
      server.newDay(); // o dia virou durante o pedido: a resposta sai depois de retryAt
      return { ...res, serverTime: res.retryAt };
    };
    expect(await engineFor(repo, net).engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(net.calls.map((c) => c.changes.length)).toEqual([4, 2]);
    // O servidor que não lê nada e já passou de retryAt (o orçamento ficou no dia de antes): um pedido, e a rodada para de mandar (a próxima
    // tenta de novo), sem repetir o lote sem fim.
    const stuck = new FakeServer(500, { budget: 0 });
    const other = await device();
    await other.createSession({ event: '333' });
    const net2 = network(stuck);
    const real2 = net2.api.sync;
    net2.api.sync = async (req) => {
      const res = await real2(req);
      return res.retryAt === undefined ? res : { ...res, serverTime: res.retryAt };
    };
    expect(await engineFor(other, net2).engine.run()).toMatchObject({ phase: 'idle', pending: 1, notice: 'budget' });
    expect(net2.calls.map((c) => c.changes.length)).toEqual([1]);
    expect((await other.getSyncState()).pushAfter).toBeNull();
  });

  // Fix round 1, item 2: pushAfter é a espera que o servidor pede (retryAt − serverTime), contada no relógio do aparelho e nunca acima de
  // MAX_BUDGET_WAIT_MS. Um aparelho com a data dias atrás não espera os dias de diferença, e um retryAt absurdo não prende a fila.
  it('a espera do orçamento é a do relógio do servidor: o aparelho dias atrasado sobe o resto quando ela passa no relógio dele, e nunca espera mais de 2 dias', async () => {
    expect(MAX_BUDGET_WAIT_MS).toBe(2 * DAY);
    const server = new FakeServer(500, { budget: 2 });
    server.now = t + 5 * DAY; // o relógio do aparelho está cinco dias atrás
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await repo.addSolve(ns(s.id, 1000 + i, t + i));
    const net = network(server);
    const { engine } = engineFor(repo, net);
    const wait = (Math.floor(server.now / DAY) + 1) * DAY - server.now;
    expect(await engine.run()).toMatchObject({ pending: 2, notice: 'budget' });
    expect((await repo.getSyncState()).pushAfter).toBe(t + wait);
    t += wait - 1;
    server.now += wait - 1;
    await engine.run();
    expect(ids(net.calls.at(-1))).toEqual([]); // ainda no dia do orçamento
    t += 2;
    server.now += 2;
    server.newDay();
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(activeSolves(server)).toHaveLength(3);
    // Um retryAt absurdo (um ano depois): a espera fica em 2 dias.
    const far = new FakeServer(500, { budget: 1 });
    far.now = t;
    const other = await device();
    const o = await other.createSession({ event: '333' });
    await other.addSolve(ns(o.id, 1000));
    const net2 = network(far);
    const real = net2.api.sync;
    net2.api.sync = async (req) => {
      const res = await real(req);
      return res.retryAt === undefined ? res : { ...res, retryAt: res.serverTime + 365 * DAY };
    };
    await engineFor(other, net2).engine.run();
    expect((await other.getSyncState()).pushAfter).toBe(t + MAX_BUDGET_WAIT_MS);
    // Sem a hora do servidor na resposta, a espera sai do relógio daqui, com o mesmo teto.
    const net3 = network(far);
    const real3 = net3.api.sync;
    net3.api.sync = async (req) => ({ ...(await real3(req)), serverTime: undefined as unknown as number, retryAt: t + 3 * DAY });
    const third = await device();
    const th = await third.createSession({ event: '333' });
    await third.addSolve(ns(th.id, 1000));
    far.newDay();
    await engineFor(third, net3).engine.run();
    expect((await third.getSyncState()).pushAfter).toBe(t + MAX_BUDGET_WAIT_MS);
  });

  // Revisão final (Minor 4): o relógio do aparelho volta dias depois da pausa (a pessoa mexeu na data). pushAfter, gravado no relógio de
  // antes, ficaria mais longe do que qualquer espera que o servidor pede, e a fila esperaria esses dias a mais. Mais longe que
  // MAX_BUDGET_WAIT_MS conta como vencido: a fila sobe, e o servidor adia de novo se ainda for o caso.
  it('com o relógio do aparelho atrasado depois da pausa, um pushAfter além de MAX_BUDGET_WAIT_MS conta como vencido, e a fila sobe', async () => {
    const server = new FakeServer(500, { budget: 2 });
    server.now = t;
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    for (let i = 0; i < 3; i++) await repo.addSolve(ns(s.id, 1000 + i, t + i));
    const net = network(server);
    const { engine } = engineFor(repo, net);
    expect(await engine.run()).toMatchObject({ pending: 2, notice: 'budget' });
    const pushAfter = (await repo.getSyncState()).pushAfter!;
    server.now = pushAfter + 1; // o dia virou para o servidor
    server.newDay();
    t -= 3 * DAY; // e o relógio daqui voltou três dias
    expect(pushAfter - t).toBeGreaterThan(MAX_BUDGET_WAIT_MS);
    const before = net.calls.length;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(ids(net.calls[before])).toHaveLength(2);
    expect(activeSolves(server)).toHaveLength(3);
    expect((await repo.getSyncState()).pushAfter).toBeNull();
  });

  // Fix round 1, item 3: o servidor recusa por outro motivo o que está só neste aparelho (editado e mandado de novo).
  it('um guardado recusado por outro motivo sai da fila, conta como recusado e continua só neste aparelho', async () => {
    const { repo, net, engine, c } = await fullAccount();
    t += 10;
    await repo.updateSolve(c.id, { note: 'boa' });
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      return { ...res, rejected: res.rejected.map((r) => ({ ...r, reason: 'solve inválido' })) };
    };
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 1, notice: null });
    expect(await repo.heldCount()).toBe(1);
    expect(await repo.localOnlyCount()).toBe(1);
  });

  // A rodada só recebe enquanto pushAfter está no futuro: o resto da fila não é "a enviar" nela, e a linha não diz "Enviando 0 de N".
  it('o resto que ficou para amanhã não conta como a enviar: a rodada que só recebe não diz "Enviando 0 de N"', async () => {
    const server = new FakeServer(2, { budget: 3 });
    server.now = t;
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    for (let i = 0; i < 4; i++) await repo.addSolve(ns(s.id, 1000 + i, t + i));
    const { engine, statuses } = engineFor(repo, network(server));
    expect(await engine.run()).toMatchObject({ pending: 2, notice: 'budget' });
    // Do lote, o servidor leu 3: depois disso, o total da rodada é o que subiu nela.
    const parked = statuses.filter((x) => x.progress !== null && x.progress.sent > 0);
    expect(parked.length).toBeGreaterThan(0);
    for (const x of parked) expect(x.progress).toMatchObject({ sent: 3, total: 3 });
    // A rodada seguinte, antes de retryAt, só recebe: nada é "a enviar", nem o que já esperava nem o gravado depois.
    t += 1000;
    await repo.addSolve(ns(s.id, 1999, t));
    const before = statuses.length;
    expect(await engine.run()).toMatchObject({ pending: 3, notice: 'budget' });
    const round = statuses.slice(before).filter((x) => x.progress !== null);
    expect(round.length).toBeGreaterThan(0);
    for (const x of round) expect(x.progress).toMatchObject({ sent: 0, total: 0 });
  });

  // Task 12: o servidor lê no máximo MAX_WRITES_PER_REQUEST mudanças por pedido (o falso, `perRequest`) e devolve o resto com retryAt =
  // agora: o motor não pausa (a espera é 0) nem acha que o servidor não leu nada (`stuck`), e manda o resto na mesma rodada.
  it('um lote maior que MAX_WRITES_PER_REQUEST volta com deferred e retryAt = agora, e o motor manda o resto na mesma rodada', async () => {
    const server = new FakeServer(500, { perRequest: 2 });
    server.now = t;
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    for (let i = 0; i < 4; i++) await repo.addSolve(ns(s.id, 1000 + i, t + i));
    const net = network(server);
    const answers: SyncResponse[] = [];
    const real = net.api.sync;
    net.api.sync = async (req) => {
      const res = await real(req);
      answers.push(res);
      return res;
    };
    expect(await engineFor(repo, net).engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: null });
    expect(net.calls.map((c) => c.changes.length)).toEqual([5, 3, 1]);
    expect(answers.map((r) => [r.accepted, r.deferred, r.retryAt])).toEqual([[2, 3, t], [2, 1, t], [1, undefined, undefined]]);
    expect(activeSolves(server)).toHaveLength(4);
    expect((await repo.getSyncState()).pushAfter).toBeNull();
  });

  // Task 12 (a cascata): a exclusão de uma sessão conta, no orçamento do dia, os solves ativos que a cascata dela grava no servidor. A que
  // não caberia nem num dia inteiro volta com o motivo da cota: fica guardada neste aparelho (nada se perde), a sessão continua apagada aqui
  // (mesmo com outro aparelho mexendo nela), e Enviar de novo a leva quando a cascata cabe. O falso conta registros; o de verdade, linhas.
  it('a exclusão de uma sessão grande demais para um dia fica só neste aparelho, continua apagada aqui, e Enviar de novo a leva quando cabe', async () => {
    const server = new FakeServer();
    server.now = t;
    const phone = await device();
    const desktop = await device();
    const s = await phone.createSession({ event: '333' });
    const mine = [];
    for (let i = 0; i < 4; i++) mine.push(await phone.addSolve(ns(s.id, 1000 + i, t + i)));
    const { engine } = engineFor(phone, network(server));
    await engine.run();
    const other = engineFor(desktop, network(server)).engine;
    await other.run();
    // Um dia com 4 registros de orçamento: a cascata da sessão grava ela e os 4 solves (5).
    server.budget = 4;
    server.newDay();
    t += 10;
    await phone.deleteSession(s.id);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, refused: 0, notice: 'quota' });
    expect(await phone.heldCount()).toBe(1);
    expect(server.active().has(`sessions/${s.id}`)).toBe(true); // nada gravado para ela
    expect(activeSolves(server)).toEqual([]); // os solves, que vieram no mesmo lote, cabem um a um
    expect((await phone.listSessions()).map((x) => x.id)).not.toContain(s.id);
    expect((await phone.listTrash()).sessions.map((x) => x.id)).toEqual([s.id]);
    // No dia seguinte, outro aparelho mexe na sessão, que continua ativa no servidor: aqui ela continua apagada, e guardada.
    t = (Math.floor(t / DAY) + 1) * DAY;
    server.now = t;
    server.newDay();
    await desktop.renameSession(s.id, 'Outro nome');
    await other.run();
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0 });
    expect((await phone.listTrash()).sessions.map((x) => x.id)).toEqual([s.id]);
    expect(await phone.heldCount()).toBe(1);
    // Enviar de novo: sem solves ativos no servidor, a cascata cabe num dia, mas não no que sobra hoje: fica para amanhã, e então entra.
    server.budget = 1; // o rename gastou o dia
    expect(await phone.requeueHeld()).toBe(1);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 1, notice: 'budget' });
    expect(server.active().has(`sessions/${s.id}`)).toBe(true);
    t = (Math.floor(t / DAY) + 1) * DAY;
    server.now = t;
    server.newDay();
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(await phone.heldCount()).toBe(0);
    expect(server.active().has(`sessions/${s.id}`)).toBe(false);
    await other.run();
    expect((await desktop.listSessions()).map((x) => x.id)).not.toContain(s.id);
  });

  // Revisão final (I4): apagar uma sessão com mais solves ativos do que um dia comporta. A fila leva a exclusão dos solves antes da sessão,
  // que vai por último: os solves sobem pelo orçamento de cada dia (pushAfter os leva de um dia para o outro), e a sessão chega sem solves
  // ativos no servidor. Nada fica "só neste aparelho", e o aviso da conta cheia não aparece numa conta que não está cheia. O falso lê no
  // máximo 4 mudanças por pedido, menos que o dia (como MAX_WRITES_PER_REQUEST e RECORDS_PER_DAY no de verdade).
  it('apagar uma sessão maior que um dia: os solves sobem pelo orçamento de cada dia, a sessão por último, e nada fica guardado', async () => {
    const server = new FakeServer(500, { perRequest: 4 });
    server.now = t;
    const phone = await device();
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < 25; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    const { engine, statuses } = engineFor(phone, network(server));
    await engine.run();
    expect(activeSolves(server)).toHaveLength(25);
    server.budget = 10; // a sessão e a cascata dela (26) nunca caberiam num dia
    server.newDay();
    t += 10;
    server.now = t;
    await phone.deleteSession(s.id);
    for (let day = 0; day < 6 && (await phone.outboxCount()) > 0; day++) {
      await engine.run();
      t = (Math.floor(t / DAY) + 1) * DAY;
      server.now = t;
      server.newDay();
    }
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(server.active().has(`sessions/${s.id}`)).toBe(false);
    expect(activeSolves(server)).toEqual([]);
    expect(await phone.heldCount()).toBe(0);
    expect(statuses.some((x) => x.notice === 'quota')).toBe(false);
    const trash = await phone.listTrash();
    expect([trash.sessions.map((x) => x.id), trash.solves.length]).toEqual([[s.id], 25]);
  });

  // Task 12, fix round 1 (c): a sessão cuja cascata nunca caberia num dia, na fila de um app de antes da revisão final (I4), em que a exclusão
  // da sessão ia antes da dos solves. Ela volta com a cota; os solves dela que ficaram para depois esperam com ela na lista (Task 6). Um toque
  // em Enviar de novo põe a exclusão dos solves antes da sessão: eles sobem pelo orçamento de cada dia (pushAfter os leva de um dia para o
  // outro), e a sessão, sem solves ativos lá, cabe no fim. Nada se perde no aparelho.
  it('apagar uma sessão grande demais para um dia: um toque em Enviar de novo leva os solves pelo orçamento e a sessão por último', async () => {
    const server = new FakeServer();
    server.now = t;
    const db = await openKlickDb(`engine-${++n}`);
    const phone = createRepository(db, { now, channel: null });
    await phone.saveSyncState({ accountId: 'conta-1', email: 'a@b.c', signedIn: true });
    const s = await phone.createSession({ event: '333' });
    for (let i = 0; i < 7; i++) await phone.addSolve(ns(s.id, 1000 + i, t + i));
    const net = network(server);
    const { engine } = engineFor(phone, net);
    await engine.run();
    expect(activeSolves(server)).toHaveLength(7);
    const nextDay = () => {
      t = (Math.floor(t / DAY) + 1) * DAY;
      server.now = t;
      server.newDay();
    };
    // Um dia de 3 registros: a sessão e a cascata dela (8) nunca caberiam.
    server.budget = 3;
    server.newDay();
    t += 10;
    server.now = t;
    await phone.deleteSession(s.id);
    // A fila de um app de antes da revisão final: a sessão com a mesma data dos solves, e (pela chave) antes deles.
    const entries = await db.getAll('outbox');
    const together = entries.find((e) => e.store === 'solves')!.queuedAt;
    await db.put('outbox', { store: 'sessions', id: s.id, queuedAt: together }, `sessions/${s.id}`);
    // A sessão volta com a cota; 3 solves do mesmo lote entram, e os outros 4 ficam para amanhã.
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 4, notice: 'budget' });
    expect(await phone.heldCount()).toBe(1);
    // No dia seguinte, os 4 são de uma sessão guardada: esperam com ela.
    nextDay();
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: 'quota' });
    expect(await phone.heldCount()).toBe(5);
    expect(activeSolves(server)).toHaveLength(4);
    // Um toque: os solves antes, a sessão por último.
    expect(await phone.requeueHeld()).toBe(5);
    const first = net.calls.length;
    for (let day = 0; day < 5 && (await phone.outboxCount()) > 0; day++) {
      await engine.run();
      nextDay();
    }
    // Em cada pedido, a sessão (quando vai) é a última do lote.
    const where = net.calls.slice(first).map((c) => [c.changes.findIndex((x) => x.store === 'sessions'), c.changes.length]);
    expect(where.some(([i]) => i !== -1)).toBe(true);
    for (const [i, length] of where) if (i !== -1) expect(i).toBe(length - 1);
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(await phone.heldCount()).toBe(0);
    expect(server.active().has(`sessions/${s.id}`)).toBe(false);
    expect(activeSolves(server)).toEqual([]);
    const trash = await phone.listTrash();
    expect([trash.sessions.map((x) => x.id), trash.solves.length]).toEqual([[s.id], 7]);
  });

  // Revisão final (I2 c): o orçamento de leituras do dia da conta acabou. O servidor não lê nada (nem a página, nem o lote) e diz
  // readsDeferred, com retryAt na virada do dia. A rodada para sem laço, com o aviso 'reads', o cursor fica, e nada sobe antes de retryAt. Um
  // primeiro login não deduplica nem sobe com a conta pela metade: no dia seguinte, ele continua do mesmo cursor, e nada se perde.
  it('passado o orçamento de leituras, o primeiro login para sem laço e com o aviso, e continua no dia seguinte do mesmo cursor', async () => {
    const server = new FakeServer(2);
    server.now = t;
    const desktop = await device();
    const ds = await desktop.createSession({ event: '333', name: 'Do computador' });
    for (let i = 0; i < 4; i++) await desktop.addSolve(ns(ds.id, 5000 + i, t + i));
    await engineFor(desktop, network(server)).engine.run();
    server.reads = 3; // registros lidos por dia
    server.newDay();
    const phone = await device(null);
    const mine = await phone.createSession({ event: '333', name: 'Do celular' });
    await phone.addSolve(ns(mine.id, 1000, t));
    const net = network(server);
    const { engine } = engineFor(phone, net);
    const retryAt = (Math.floor(t / DAY) + 1) * DAY;
    expect(await engine.firstLogin(ACCOUNT)).toMatchObject({ phase: 'idle', error: null, notice: 'reads' });
    expect(net.calls.map((c) => [c.cursor, c.changes.length])).toEqual([[0, 0], [2, 0], [4, 0]]); // duas páginas; a terceira volta sem nada
    expect(await phone.getSyncState()).toMatchObject({ firstSync: true, cursor: 4, pushAfter: retryAt });
    expect(activeSolves(server)).toHaveLength(4); // nada daqui subiu
    // Antes de retryAt, outra rodada pede uma vez, e para de novo.
    t += 1000;
    server.now = t;
    const before = net.calls.length;
    expect(await engine.run()).toMatchObject({ phase: 'idle', notice: 'reads' });
    expect(net.calls.length).toBe(before + 1);
    // No dia seguinte: o resto chega do mesmo cursor, a deduplicação roda, e o daqui sobe.
    t = retryAt + 1;
    server.now = t;
    server.newDay();
    const resumed = net.calls.length;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(net.calls[resumed].cursor).toBe(4);
    expect(await phone.getSyncState()).toMatchObject({ firstSync: false, pushAfter: null });
    expect(activeSolves(server)).toHaveLength(5);
    expect(await phone.listSolves()).toHaveLength(5);
  });

  it('passado o orçamento de leituras numa rodada comum, o lote volta todo, a fila espera a virada do dia, e sobe nela', async () => {
    const server = new FakeServer();
    server.now = t;
    const repo = await device();
    const s = await repo.createSession({ event: '333' });
    await engineFor(repo, network(server)).engine.run();
    server.reads = 0;
    const solve = await repo.addSolve(ns(s.id, 1000, t));
    const net = network(server);
    const { engine } = engineFor(repo, net);
    const retryAt = (Math.floor(t / DAY) + 1) * DAY;
    const cursor = (await repo.getSyncState()).cursor;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 1, notice: 'reads' });
    expect(net.calls.map((c) => c.changes.length)).toEqual([1]); // um pedido só: sem laço
    expect(await repo.getSyncState()).toMatchObject({ cursor, pushAfter: retryAt });
    expect(activeSolves(server)).toEqual([]);
    t = retryAt;
    server.now = t;
    server.reads = null;
    expect(await engine.run()).toMatchObject({ phase: 'idle', pending: 0, notice: null });
    expect(activeSolves(server).map((x) => x.id)).toEqual([solve.id]);
  });

  it('a resposta grava copiesPaused no estado do sync', async () => {
    const server = new FakeServer();
    const repo = await device();
    const { engine } = engineFor(repo, network(server));
    expect((await repo.getSyncState()).copiesPaused).toBeNull();
    server.copiesPaused = 'space';
    await engine.run();
    expect((await repo.getSyncState()).copiesPaused).toBe('space');
    server.copiesPaused = 'ops';
    await engine.run();
    expect((await repo.getSyncState()).copiesPaused).toBe('ops');
    server.copiesPaused = 'size';
    await engine.run();
    expect((await repo.getSyncState()).copiesPaused).toBe('size');
    server.copiesPaused = null;
    await engine.run();
    expect((await repo.getSyncState()).copiesPaused).toBeNull();
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

  it('um relógio certo fica sem ajuste, qualquer que seja a latência do pedido', async () => {
    const server = new FakeServer();
    const clock = createServerClock(now);
    const repo = createRepository(await openKlickDb(`engine-${++n}`), { now: clock.now, channel: null });
    await repo.saveSyncState({ accountId: 'conta-1', email: 'a@b.c', signedIn: true });
    const net = network(server);
    const real = net.api.sync;
    net.api.sync = async (req) => {
      t += 120; // a ida
      server.now = t;
      const res = await real(req);
      t += 250; // a volta
      return res;
    };
    await engineFor(repo, net, { clock }).engine.run();
    expect(clock.offset()).toBe(0);
  });

  it('o relógio só atrasa: um aparelho atrasado não é adiantado, e uma resposta sem hora não mexe nele', () => {
    let device = 10_000;
    const clock = createServerClock(() => device);
    const answer = (serverTime: number, latency = 300) => {
      const done = clock.send();
      device += latency;
      done(serverTime);
    };
    answer(50_000);
    expect(clock.offset()).toBe(0);
    answer(4_000); // saiu em 10_300: o aparelho está 6_300 adiantado
    expect([clock.offset(), clock.now()]).toEqual([-6_300, 4_300]);
    answer(0);
    answer(Number.NaN);
    expect(clock.offset()).toBe(-6_300);
    device = 20_000;
    answer(20_050, 100); // o relógio do aparelho foi acertado
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

  it('uma resposta do sync fora da forma vira erro do servidor; sem `rejected`, a lista vem vazia', async () => {
    const body = (b: unknown) => createSyncApi(async () => Response.json(b)).sync({} as SyncRequest);
    const ok = { accepted: 0, changes: [], cursor: 3, more: false, serverTime: 1 };
    expect(await body(ok)).toEqual({ ...ok, rejected: [] });
    for (const bad of [null, [], { ...ok, cursor: '3' }, { ...ok, cursor: -1 }, { ...ok, changes: {} }, { ...ok, more: 'não' }, { ...ok, rejected: {} }]) {
      await expect(body(bad)).rejects.toMatchObject({ kind: 'server' });
    }
  });

  it('um pedido que não responde desiste no prazo: /api/health vira null e o sync, sem rede (sair não fica preso)', async () => {
    expect([HEALTH_TIMEOUT_MS, SYNC_TIMEOUT_MS]).toEqual([15_000, 60_000]);
    const hang: Fetcher = (_url, init) =>
      new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('prazo', 'TimeoutError'))));
    const api = createSyncApi(hang, '', { health: 20, sync: 20 });
    expect(await api.health()).toBeNull();
    await expect(api.sync({ v: SYNC_PROTOCOL, account: 'conta-1', deviceId: 'd', cursor: 0, clock: 0, changes: [] })).rejects.toMatchObject({ kind: 'offline' });
    // Os cabeçalhos chegaram e o corpo parou: o sync desiste também (erro do servidor, nova tentativa).
    const stalledBody: Fetcher = async (_url, init) =>
      new Response(
        new ReadableStream({
          start(controller) {
            init?.signal?.addEventListener('abort', () => controller.error(new DOMException('prazo', 'TimeoutError')));
          },
        }),
      );
    await expect(createSyncApi(stalledBody, '', { health: 20, sync: 20 }).sync({ v: SYNC_PROTOCOL, account: 'conta-1', deviceId: 'd', cursor: 0, clock: 0, changes: [] })).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('o pedido de sync vai como JSON, na mesma origem', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const api = createSyncApi(async (url, init) => {
      seen.push({ url, init });
      return Response.json({ accepted: 0, rejected: [], changes: [], cursor: 0, more: false, serverTime: 1 });
    });
    await api.sync({ v: SYNC_PROTOCOL, account: 'conta-1', deviceId: 'd', cursor: 0, clock: 0, changes: [] });
    expect(seen[0].url).toBe('/api/sync');
    expect(seen[0].init?.signal).toBeInstanceOf(AbortSignal); // com prazo
    expect(seen[0].init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
  });
});
