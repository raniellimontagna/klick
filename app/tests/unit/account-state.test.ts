import { describe, expect, it, vi } from 'vitest';
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { type ChannelLike, createRepository, type Repository } from '../../src/data/repository';
import { T } from '../../src/strings';
import { ApiError } from '../../src/sync/api';
import type { SyncEngine } from '../../src/sync/engine';
import type { LocksLike, TriggerEnv } from '../../src/sync/triggers';
import { BUSY_BEAT_MS, BUSY_STALE_MS } from '../../src/ui/state/account.svelte';
import type { AppState } from '../../src/ui/state/app.svelte';
import { onUpdateLookup } from '../../src/ui/state/update.svelte';
import { appWithAccount, bus, fakeApi, manualEnv } from './sync-account';
import { FakeServer } from './sync-fakes';

const HOUR = 3_600_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let dbs = 0;

// Locks em que a primeira aba que pede lidera e as outras ficam na fila para sempre.
function firstWins(): LocksLike {
  let taken = false;
  return {
    request: (_name, cb) => {
      if (taken) return new Promise(() => undefined);
      taken = true;
      return cb();
    },
  };
}

// Locks com fila, como os do navegador: quem pediu antes lidera; quando a líder solta (a aba fecha), a próxima da fila assume.
function queueLocks(): LocksLike {
  let held: Promise<unknown> = Promise.resolve();
  return {
    request(_name, callback) {
      const turn = held.then(() => callback());
      held = turn.catch(() => undefined);
      return turn;
    },
  };
}

const ACCOUNT = { accountId: 'conta-1', email: 'ranielli@exemplo.com' };
const engineOf = (app: AppState): SyncEngine => (app.account as unknown as { engine: SyncEngine }).engine;

// Uma promessa que o teste resolve na hora que quer (um pedido que fica "na rede").
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

// "Abas": repositórios no mesmo banco, ligados pelo canal dos dados, como no navegador.
async function tabRepos(count: number): Promise<Repository[]> {
  const name = `abas-${++dbs}`;
  const data = bus();
  const repos: Repository[] = [];
  for (let i = 0; i < count; i++) repos.push(createRepository(await openKlickDb(name), { channel: data() }));
  return repos;
}

async function twoTabRepos(): Promise<[Repository, Repository]> {
  const [a, b] = await tabRepos(2);
  return [a, b];
}

const hasSolve = (server: FakeServer) => [...server.records.keys()].some((k) => k.startsWith('solves/'));

describe('a conta no app (spec 6.2 e 8.4)', () => {
  it('com a conta desligada no ambiente (ou sem servidor), nada de conta aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    await vi.waitFor(() => expect(app.account!.siteKey).toBeNull());
    expect(app.account!.available).toBe(false);
    const offline = await appWithAccount(fakeApi(new FakeServer(), null).api);
    expect(offline.app.account!.available).toBe(false);
  });

  it('um aparelho que já está numa conta mostra a conta mesmo sem servidor', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), null).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    expect(app.account!.sync.email).toBe('ranielli@exemplo.com');
  });

  it('com a conta desligada no ambiente, nem um aparelho que já está numa conta a mostra ou sincroniza (spec 8.4)', async () => {
    const net = fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null });
    const syncs = vi.spyOn(net.api, 'sync');
    const env = manualEnv();
    const { app } = await appWithAccount(net.api, { signedIn: true, env: env.env });
    expect(app.account!.signedIn).toBe(true);
    expect(app.account!.available).toBe(false);
    await app.addSolve({ ms: 10_000, penalty: null, at: Date.now() });
    env.fireDelayed();
    await app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
  });

  it('o aparelho numa conta que abriu sem resposta de /api/health pergunta de novo antes de sincronizar (spec 8.4)', async () => {
    const net = fakeApi(new FakeServer());
    const answers: (Awaited<ReturnType<typeof net.api.health>>)[] = [null, null, { accounts: false, turnstileSiteKey: null }];
    const health = vi.spyOn(net.api, 'health').mockImplementation(async () => answers.shift() ?? null);
    const syncs = vi.spyOn(net.api, 'sync');
    const env = manualEnv();
    const { app } = await appWithAccount(net.api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(health).toHaveBeenCalledTimes(2); // ao abrir e na rodada de abrir, as duas sem resposta: a rodada sai (sem rede, falharia)
    expect(syncs).toHaveBeenCalledTimes(1);
    await app.account!.syncNow(); // a rede voltou: a conta está desligada no ambiente
    expect(health).toHaveBeenCalledTimes(3);
    expect(app.account!.available).toBe(false);
    expect(syncs).toHaveBeenCalledTimes(1);
  });

  it('sem conta, só /api/health sai: nem o abrir, nem uma gravação, nem "Sincronizar agora" chamam o sync (spec 4.1)', async () => {
    const net = fakeApi(new FakeServer());
    const health = vi.spyOn(net.api, 'health');
    const syncs = vi.spyOn(net.api, 'sync');
    const env = manualEnv();
    const { app, repo } = await appWithAccount(net.api, { env: env.env });
    expect(app.account!.available).toBe(true); // a conta está ligada: Ajustes oferece entrar
    await app.addSolve({ ms: 10_000, penalty: null, at: Date.now() });
    env.fireDelayed();
    await app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    expect(health).toHaveBeenCalledTimes(1);
    expect(await repo.outboxCount()).toBe(0);
  });

  it('o solve feito no "iPhone" aparece no "computador" (objetivo da spec, seção 2)', async () => {
    const server = new FakeServer();
    const phone = manualEnv();
    const iphone = await appWithAccount(fakeApi(server).api, { signedIn: true, env: phone.env });
    const desktop = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await iphone.app.addSolve({ ms: 10_234, penalty: null, at: Date.now() });
    phone.fireDelayed(); // 5 s depois da última gravação
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
    await desktop.app.account!.syncNow();
    await vi.waitFor(() => expect(desktop.app.solves.map((s) => s.ms)).toEqual([10_234]));
    expect(desktop.app.sessions.map((s) => s.id)).toEqual(iphone.app.sessions.map((s) => s.id)); // a mesma "Sessão 1" padrão
  });

  it('o que o sync junta não agenda outra rodada; uma gravação daqui agenda (pré-voo X9)', async () => {
    const server = new FakeServer();
    const other = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await other.app.addSolve({ ms: 9_000, penalty: null, at: Date.now() });
    await other.app.account!.syncNow();
    const env = manualEnv();
    const { app } = await appWithAccount(fakeApi(server).api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.solves).toHaveLength(1)); // veio na rodada de abrir
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(env.pending()).toBe(0);
    await app.addSolve({ ms: 8_000, penalty: null, at: Date.now() });
    expect(env.pending()).toBe(1);
  });

  // Os desafios sobem como os solves (spec do desafio, seção 7): uma gravação deles agenda o sync 5 s depois da última.
  it('um desafio salvo neste aparelho sobe 5 s depois, como um solve', async () => {
    const server = new FakeServer();
    const env = manualEnv();
    const { app, repo } = await appWithAccount(fakeApi(server).api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(env.pending()).toBe(0);
    const scrambles = Array.from({ length: 7 }, (_, i) => `R U F${i}`);
    await repo.saveDuel({
      id: 'abcdefgh12345678-a', linkId: 'abcdefgh12345678', side: 'a', event: '333', scrambles, mine: [], theirs: null, myName: '', theirName: '',
      status: 'playing',
    });
    expect(env.pending()).toBe(1);
    env.fireDelayed();
    await vi.waitFor(() => expect(server.records.has('duels/abcdefgh12345678-a')).toBe(true));
  });

  it('a região aria-live fala só quando o sync falha e quando volta (spec 9.6)', async () => {
    const server = new FakeServer();
    const net = fakeApi(server);
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    net.fail(new ApiError('server', 500));
    await app.account!.syncNow();
    await vi.waitFor(() => expect(app.live).toBe(T.conta.syncFailedLive));
    await app.account!.syncNow(); // falha de novo: sem novo anúncio
    expect(app.live).toBe(T.conta.syncFailedLive);
    net.fail(null);
    await app.account!.syncNow();
    await vi.waitFor(() => expect(app.live).toBe(T.conta.syncBackLive));
  });

  // Revisão final (Minor 5): no 426, o app pede ao service worker que procure a versão nova, uma vez: sem isso, uma aba aberta mostra
  // "Atualize o Klick" e não tem o que tocar até recarregar (o service worker só procura sozinho ao abrir).
  it('um 426 procura a versão nova do app uma vez (registration.update)', async () => {
    const lookup = vi.fn(async () => undefined);
    onUpdateLookup(lookup);
    try {
      const net = fakeApi(new FakeServer());
      const { app } = await appWithAccount(net.api, { signedIn: true });
      await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
      expect(lookup).not.toHaveBeenCalled();
      net.fail(new ApiError('update', 426));
      await app.account!.syncNow();
      expect(app.account!.status.error).toBe('update');
      await app.account!.syncNow();
      expect(lookup).toHaveBeenCalledTimes(1);
    } finally {
      onUpdateLookup(null);
    }
  });

  it('sem rede não é falha: a região aria-live não fala ao cair nem ao voltar (spec 9.6)', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const announce = vi.spyOn(app, 'announce');
    net.fail(new ApiError('offline', 0));
    await app.account!.syncNow();
    expect(app.account!.status.phase).toBe('offline');
    net.fail(null);
    await app.account!.syncNow();
    expect(app.account!.status.phase).toBe('idle');
    expect(announce).not.toHaveBeenCalled();
  });

  it('depois de um 401, nenhum gatilho chama o servidor até a conta voltar (spec 6.6)', async () => {
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const { app } = await appWithAccount(net.api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    net.fail(new ApiError('auth', 401));
    await app.account!.syncNow();
    expect(app.account!.status).toMatchObject({ phase: 'error', error: 'auth' });
    await vi.waitFor(() => expect(app.live).toBe(T.conta.syncFailedLive));
    net.fail(null);
    const syncs = vi.spyOn(net.api, 'sync');
    await app.addSolve({ ms: 10_000, penalty: null, at: Date.now() });
    env.fireDelayed();
    await app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    app.account!.resumeSync(); // uma saída que falhou desfaz a parada, mas a conta não entrou de novo: o erro de sessão fica (C1)
    await app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled();
    app.account!.resumeSync(true); // a mesma conta entrou de novo (Task 15)
    await app.account!.syncNow();
    expect(syncs).toHaveBeenCalled();
    expect(app.account!.status).toMatchObject({ phase: 'idle', error: null, pending: 0 });
    await vi.waitFor(() => expect(app.live).toBe(T.conta.syncBackLive));
  });

  it('nunca durante um solve nem durante o treino (decisão 14)', async () => {
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const { app } = await appWithAccount(net.api, { signedIn: true, env: env.env });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const syncs = vi.spyOn(net.api, 'sync');
    app.trainerRunning = true;
    const round = app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    app.trainerRunning = false;
    app.timerBusy = true;
    env.fireDelayed(); // a espera do motor confere de novo: o timer está ocupado
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    app.timerBusy = false;
    app.pendingInspect = true; // o espaço segurado antes da inspeção
    env.fireDelayed();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    app.pendingInspect = false;
    env.fireDelayed();
    await round;
    expect(syncs).toHaveBeenCalled();
  });

  it('um aparelho 2 h adiantado grava na hora do servidor depois de um sync (spec 5.4)', async () => {
    const t = 1_791_500_000_000;
    const server = new FakeServer();
    server.now = t;
    const ahead = t + 2 * HOUR;
    const { app, repo, clock } = await appWithAccount(fakeApi(server).api, { signedIn: true, sessionFirst: true, now: () => ahead });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(clock.offset()).toBe(-2 * HOUR);
    await app.addSolve({ ms: 9_000, penalty: null, at: ahead });
    const [solve] = await repo.listSolves();
    expect(solve.at).toBe(ahead); // o instante do solve é o do aparelho
    expect(solve.updatedAt - t).toBeGreaterThan(0);
    expect(solve.updatedAt - t).toBeLessThan(1000); // a data do sync é a do servidor
    expect(solve.createdAt).toBe(solve.updatedAt);
  });

  it('o aviso "sync" de outra aba relê só o estado da conta, não os dados (Task 5)', async () => {
    const [mine, other] = await twoTabRepos();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { repo: mine });
    const reads = [vi.spyOn(mine, 'listSolves'), vi.spyOn(mine, 'listSessions'), vi.spyOn(mine, 'getProfile'), vi.spyOn(mine, 'getMeta'), vi.spyOn(mine, 'listPractice')];
    await other.saveSyncState({ accountId: 'conta-1', email: 'outra@aba.com', signedIn: true });
    await vi.waitFor(() => expect(app.account!.sync.email).toBe('outra@aba.com'));
    await sleep(10);
    for (const read of reads) expect(read).not.toHaveBeenCalled();
  });
});

describe('uma aba só sincroniza (spec 6.2)', () => {
  it('a outra pede "agora" pelo canal e recebe o estado', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(server);
    const syncs = vi.spyOn(net.api, 'sync');
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make() });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo });
    expect([first.app.account!.leader, second.app.account!.leader]).toEqual([true, false]);
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    const before = syncs.mock.calls.length;
    await second.app.account!.syncNow();
    await vi.waitFor(() => expect(syncs.mock.calls.length).toBeGreaterThan(before));
    await vi.waitFor(() => expect(second.app.account!.status.phase).toBe('idle'));
  });

  it('a gravação numa aba que não lidera chega à líder pelo canal e sobe 5 s depois', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = firstWins();
    const env = manualEnv();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(fakeApi(server).api, { signedIn: true, locks, channel: make(), env: env.env, repo: mine });
    const second = await appWithAccount(fakeApi(server).api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    expect(env.pending()).toBe(0);
    await second.app.addSolve({ ms: 7_000, penalty: null, at: Date.now() });
    expect(env.pending()).toBe(1);
    env.fireDelayed();
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
  });

  it('a aba que abre depois já recebe o estado da líder', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = firstWins();
    const first = await appWithAccount(fakeApi(server).api, { signedIn: true, locks, channel: make() });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    const second = await appWithAccount(fakeApi(server).api, { signedIn: true, locks, channel: make(), repo: first.repo });
    await vi.waitFor(() => expect(second.app.account!.status.phase).toBe('idle'));
  });

  it('uma aba que abre com o sync já falhando não anuncia a falha; só a mudança depois do primeiro estado fala (spec 9.6)', async () => {
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(new FakeServer());
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make() });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    net.fail(new ApiError('server', 500));
    await first.app.account!.syncNow();
    await vi.waitFor(() => expect(first.app.account!.status.error).toBe('server'));
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo });
    expect(second.app.account!.leader).toBe(false);
    await vi.waitFor(() => expect(second.app.account!.status.error).toBe('server')); // o primeiro estado que esta aba conhece
    await sleep(100); // a região aria-live põe o texto 50 ms depois
    expect(second.app.live).toBe('');
    net.fail(null);
    await first.app.account!.syncNow();
    await vi.waitFor(() => expect(second.app.live).toBe(T.conta.syncBackLive));
  });

  it('sair numa aba que não lidera para o sync na líder, e só volta depois da rodada em andamento (spec 7.7)', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(server);
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make() });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    const real = net.api.sync;
    const gate = deferred();
    const inFlight = deferred();
    net.api.sync = async (req: SyncRequest): Promise<SyncResponse> => {
      inFlight.resolve();
      await gate.promise;
      return real(req);
    };
    const round = first.app.account!.syncNow();
    await inFlight.promise;
    let stopped = false;
    const stopping = second.app.account!.stopSync().then(() => {
      stopped = true;
    });
    await sleep(20);
    expect(stopped).toBe(false); // a resposta ainda está na rede
    gate.resolve();
    await stopping;
    await round;
    net.api.sync = real;
    const syncs = vi.spyOn(net.api, 'sync');
    await second.app.account!.syncNow();
    await first.app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled(); // parado nas duas abas
    second.app.account!.resumeSync(); // a mesma conta entrou de novo pela outra aba
    await first.app.account!.syncNow();
    expect(syncs).toHaveBeenCalledTimes(1);
  });

  it('sair na aba líder espera o motor dela; sem canal, a aba que não lidera não espera ninguém', async () => {
    const net = fakeApi(new FakeServer());
    const leader = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(leader.app.account!.status.phase).toBe('idle'));
    await leader.app.account!.stopSync();
    const syncs = vi.spyOn(net.api, 'sync');
    await leader.app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled();
    const alone = await appWithAccount(net.api, { signedIn: true, locks: firstWins(), repo: leader.repo });
    const queued = await appWithAccount(net.api, { signedIn: true, locks: { request: () => new Promise(() => undefined) }, repo: leader.repo });
    expect(alone.app.account!.leader).toBe(true);
    expect(queued.app.account!.leader).toBe(false);
    await queued.app.account!.stopSync(); // resolve na hora: o repositório confere a conta dentro da transação
  });

  it('a aba que outra versão do app substituiu (banco atualizado) solta o lock e para de sincronizar', async () => {
    let released = false;
    const locks: LocksLike = { request: (_name, cb) => cb().then(() => (released = true)) };
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true, locks });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(app.account!.leader).toBe(true);
    app.supersede();
    await vi.waitFor(() => expect(released).toBe(true));
    expect(app.account!.leader).toBe(false);
    const syncs = vi.spyOn(net.api, 'sync');
    await app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled();
  });

  it('voltar a ficar visível ou online numa aba que não lidera pede o sync à líder (spec 6.2)', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(server);
    const env = manualEnv();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make() });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo, env: env.env });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    const syncs = vi.spyOn(net.api, 'sync');
    env.fire.visible();
    await vi.waitFor(() => expect(syncs).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    env.fire.online();
    await vi.waitFor(() => expect(syncs).toHaveBeenCalledTimes(2));
    expect(second.app.account!.leader).toBe(false);
  });

  it('a parada pedida a uma líder que não responde (suspensa) desiste no prazo, pelo relógio dos gatilhos', async () => {
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const leaderChannel = make();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: leaderChannel });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo, env: env.env });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    make.mute(leaderChannel);
    let stopped = false;
    const stopping = second.app.account!.stopSync().then(() => {
      stopped = true;
    });
    await sleep(10);
    expect(stopped).toBe(false);
    env.fireDelayed(); // passou o prazo
    await stopping;
  });

  it('a parada pedida à líder que fecha sem responder: a aba que assume para o próprio motor e responde', async () => {
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const leaderChannel = make();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: leaderChannel, repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other, env: env.env });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    make.mute(leaderChannel); // suspensa: não recebe o pedido
    const stopping = second.app.account!.stopSync();
    first.app.account!.stop(); // a aba da líder fecha
    await stopping; // sem disparar o prazo (env.fireDelayed)
    expect(second.app.account!.leader).toBe(true);
    const syncs = vi.spyOn(net.api, 'sync');
    await second.app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled(); // parado
  });

  it('o primeiro login pedido a uma líder que some antes de atender não se perde: a aba que assume o faz (Task 14)', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(server);
    const leaderChannel = make();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { locks, channel: leaderChannel, repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    await first.app.addSolve({ ms: 6_000, penalty: null, at: Date.now() });
    make.mute(leaderChannel); // suspensa: o pedido se perde
    await second.app.account!.firstLogin(ACCOUNT);
    await sleep(10);
    expect(second.app.account!.signedIn).toBe(false);
    first.app.account!.stop(); // a aba da líder fecha
    await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
    await vi.waitFor(() => expect(second.app.account!.signedIn).toBe(true));
  });

  it('a volta da conta pedida a uma líder que some antes de atender não se perde (Task 15)', async () => {
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(new FakeServer());
    const leaderChannel = make();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: leaderChannel, repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    await second.app.account!.stopSync(); // saiu (a líder parou e respondeu)
    make.mute(leaderChannel);
    second.app.account!.resumeSync(); // entrou de novo, mas a líder está suspensa
    const syncs = vi.spyOn(net.api, 'sync');
    first.app.account!.stop();
    await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
    await vi.waitFor(() => expect(syncs).toHaveBeenCalled()); // a rodada de abrir da nova líder sai
    await vi.waitFor(() => expect(second.app.account!.status.phase).toBe('idle'));
  });

  it('o primeiro login perdido pela líder que some é feito pela aba que assume, mesmo que não seja a que pediu (Task 14)', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(server);
    const leaderChannel = make();
    const [a, b, c] = await tabRepos(3);
    const first = await appWithAccount(net.api, { locks, channel: leaderChannel, repo: a });
    const next = await appWithAccount(net.api, { locks, channel: make(), repo: b }); // a próxima da fila
    const asking = await appWithAccount(net.api, { locks, channel: make(), repo: c });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    await first.app.addSolve({ ms: 6_000, penalty: null, at: Date.now() });
    make.mute(leaderChannel); // suspensa: o pedido se perde
    await asking.app.account!.firstLogin(ACCOUNT);
    await sleep(10);
    expect(asking.app.account!.signedIn).toBe(false);
    first.app.account!.stop(); // a aba da líder fecha
    await vi.waitFor(() => expect(next.app.account!.leader).toBe(true));
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
    await vi.waitFor(() => expect(asking.app.account!.signedIn).toBe(true));
    expect(asking.app.account!.leader).toBe(false);
  });

  it('sair depois de pedir o primeiro login desfaz o pedido em todas as abas: a que assume não entra na conta', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(server);
    const env = manualEnv();
    const leaderChannel = make();
    const [a, b, c] = await tabRepos(3);
    const first = await appWithAccount(net.api, { locks, channel: leaderChannel, repo: a });
    const next = await appWithAccount(net.api, { locks, channel: make(), repo: b });
    const asking = await appWithAccount(net.api, { locks, channel: make(), repo: c, env: env.env });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    make.mute(leaderChannel);
    await asking.app.account!.firstLogin(ACCOUNT);
    const stopping = asking.app.account!.stopSync(); // saiu logo depois (a líder suspensa não responde)
    first.app.account!.stop();
    await vi.waitFor(() => expect(next.app.account!.leader).toBe(true));
    await sleep(20);
    env.fireDelayed(); // o prazo de parar
    await stopping;
    expect(await a.getSyncState()).toMatchObject({ accountId: null, signedIn: false });
    expect(server.records.size).toBe(0);
  });

  it('a aba que parou o próprio motor ao sair e assume depois de outra aba entrar de novo sincroniza (Task 15)', async () => {
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(new FakeServer());
    const [a, b, c] = await tabRepos(3);
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: a });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: b }); // a próxima da fila
    const third = await appWithAccount(net.api, { locks, channel: make(), repo: c });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    await second.app.account!.stopSync(); // saiu nesta aba: o motor dela e o da líder param
    third.app.account!.resumeSync(); // a mesma conta entrou de novo pela terceira aba
    await sleep(10);
    first.app.account!.stop(); // a líder fecha
    await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
    const syncs = vi.spyOn(net.api, 'sync');
    await second.app.account!.syncNow();
    expect(syncs).toHaveBeenCalled();
  });

  it('a aba que assume faz o que foi pedido por último: parar e depois entrar de novo entra na conta', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(server);
    const env = manualEnv();
    const leaderChannel = make();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { locks, channel: leaderChannel, repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other, env: env.env });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    await first.app.addSolve({ ms: 6_000, penalty: null, at: Date.now() });
    make.mute(leaderChannel); // suspensa: não recebe nem a parada nem o login
    const stopping = second.app.account!.stopSync();
    await second.app.account!.firstLogin(ACCOUNT);
    first.app.account!.stop(); // a aba da líder fecha
    await stopping; // a aba que assume para o motor e responde, sem disparar o prazo
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
    await vi.waitFor(() => expect(second.app.account!.signedIn).toBe(true));
  });

  it('o primeiro login que a líder já começou não é repetido pela aba que assume depois', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(server);
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { locks, channel: make(), repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    const replays = vi.spyOn(engineOf(second.app), 'firstLogin');
    await second.app.account!.firstLogin(ACCOUNT);
    await vi.waitFor(() => expect(second.app.account!.signedIn).toBe(true)); // o aviso 'sync' do começo do primeiro login chegou
    first.app.account!.stop();
    await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
    await sleep(10);
    expect(replays).not.toHaveBeenCalled();
  });

  it('a líder que entra noutra conta desfaz o login perdido de outra aba: a que assume depois não troca de conta sozinha (Task 14)', async () => {
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(new FakeServer());
    const leaderChannel = make();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { locks, channel: leaderChannel, repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    make.mute(leaderChannel); // suspensa: o pedido da conta 1 se perde
    await second.app.account!.firstLogin(ACCOUNT);
    make.unmute(leaderChannel);
    await first.app.account!.firstLogin({ accountId: 'conta-2', email: 'outra@exemplo.com' }); // depois, a líder entra na conta 2
    await vi.waitFor(() => expect(second.app.account!.sync.accountId).toBe('conta-2'));
    const replays = vi.spyOn(engineOf(second.app), 'firstLogin');
    first.app.account!.stop(); // a aba da líder fecha
    await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
    await sleep(20);
    expect(replays).not.toHaveBeenCalled();
    expect(await other.getSyncState()).toMatchObject({ accountId: 'conta-2', signedIn: true });
  });

  it('sair na líder desfaz o login que outra aba pediu e ficou sem resposta: a aba que assume depois não entra na conta (Task 14)', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(server);
    const leaderChannel = make();
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { locks, channel: leaderChannel, repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    await first.app.addSolve({ ms: 6_000, penalty: null, at: Date.now() });
    make.mute(leaderChannel); // o pedido não chega à líder: fica pendente na outra aba
    await second.app.account!.firstLogin(ACCOUNT);
    make.unmute(leaderChannel);
    expect(await first.app.account!.signOut(false)).toBe('ok'); // sair, na líder (stopSync avisa as outras abas)
    first.app.account!.stop(); // a aba da líder fecha
    await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
    await sleep(20);
    expect(second.app.account!.signedIn).toBe(false);
    expect(await other.getSyncState()).toMatchObject({ accountId: null, signedIn: false });
    expect(server.records.size).toBe(0);
  });

  it.each(['resumeSync', 'firstLogin'] as const)(
    'a conta que volta na líder (%s) tira da parada o motor das outras abas: a que assume depois sincroniza (Task 14)',
    async (how) => {
      const make = bus();
      const locks = queueLocks();
      const net = fakeApi(new FakeServer());
      const [mine, other] = await twoTabRepos();
      const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: mine });
      const second = await appWithAccount(net.api, { locks, channel: make(), repo: other }); // a próxima da fila
      await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
      await second.app.account!.stopSync(); // saiu nesta aba: o motor dela e o da líder param
      if (how === 'resumeSync') first.app.account!.resumeSync();
      else await first.app.account!.firstLogin(ACCOUNT);
      await sleep(10);
      first.app.account!.stop(); // a líder fecha
      await vi.waitFor(() => expect(second.app.account!.leader).toBe(true));
      const syncs = vi.spyOn(net.api, 'sync');
      await second.app.account!.syncNow();
      expect(syncs).toHaveBeenCalled();
    },
  );

  it('o primeiro login pedido numa aba que não lidera roda na líder', async () => {
    const server = new FakeServer();
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(server);
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { locks, channel: make(), repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await first.app.addSolve({ ms: 6_000, penalty: null, at: Date.now() });
    await second.app.account!.firstLogin({ accountId: 'conta-1', email: 'ranielli@exemplo.com' });
    await vi.waitFor(() => expect(hasSolve(server)).toBe(true));
    await vi.waitFor(() => expect(first.app.account!.signedIn).toBe(true));
    await vi.waitFor(() => expect(second.app.account!.signedIn).toBe(true));
    await vi.waitFor(() => expect(second.app.account!.status.phase).toBe('idle'));
  });

  // C1: uma volta pedida por outra aba só tira o erro de sessão da líder quando a conta entrou de novo de verdade (o código ou a passkey
  // conferiram a mesma conta). A de uma saída que falhou e desfez a parada não: a líder continua sem pedir nada até a pessoa entrar.
  it('a volta pedida por outra aba sem a conta de volta não tira o erro de sessão da líder; a da mesma conta que entrou de novo, sim', async () => {
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(new FakeServer());
    const [mine, other] = await twoTabRepos();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: mine });
    const second = await appWithAccount(net.api, { locks, channel: make(), repo: other });
    await vi.waitFor(() => expect(first.app.account!.leader).toBe(true));
    net.fail(new ApiError('auth', 401));
    await first.app.account!.syncNow();
    expect(first.app.account!.status.error).toBe('auth');
    net.fail(null);
    const syncs = vi.spyOn(net.api, 'sync');
    second.app.account!.resumeSync(); // uma saída que falhou na outra aba desfaz a parada dela
    await sleep(10);
    await first.app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled();
    expect(first.app.account!.status.error).toBe('auth');
    second.app.account!.resumeSync(true); // a mesma conta entrou de novo pela outra aba
    await sleep(10);
    await first.app.account!.syncNow();
    expect(syncs).toHaveBeenCalled();
    await vi.waitFor(() => expect(first.app.account!.status.error).toBeNull());
  });
});

// A revisão final, 5.5: um solve (ou a inspeção, ou o treino) em qualquer aba segura o sync da líder. Cada aba avisa pelo canal quando
// fica ocupada ou livre, e repete o aviso enquanto está ocupada; a líder esquece a aba que some sem avisar.
describe('a aba ocupada segura o sync de todas (revisão final 5.5)', () => {
  // Os avisos 'busy' que passam pelo canal, vistos de uma aba a mais.
  function busyLog(channel: ChannelLike) {
    const seen: { type: string; tab: string; busy: boolean }[] = [];
    channel.onmessage = (ev) => {
      const m = ev.data as { type: string; tab: string; busy: boolean };
      if (m.type === 'busy') seen.push(m);
    };
    return seen;
  }

  // Uma aba que nunca lidera (o lock fica com outra).
  const never: LocksLike = { request: () => new Promise(() => undefined) };

  it('as esperas da aba ocupada: BUSY_BEAT_MS 5 s e BUSY_STALE_MS 15 s', async () => {
    expect([BUSY_BEAT_MS, BUSY_STALE_MS]).toEqual([5_000, 15_000]);
    const make = bus();
    const manual = manualEnv();
    const delays: number[] = [];
    const env: TriggerEnv = {
      ...manual.env,
      schedule: (fn, ms) => {
        delays.push(ms);
        return manual.env.schedule(fn, ms);
      },
    };
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, locks: never, channel: make(), env });
    const seen = busyLog(make());
    delays.length = 0;
    app.timerBusy = true;
    expect(seen.map((m) => m.busy)).toEqual([true]);
    expect(delays).toEqual([BUSY_BEAT_MS]);
    manual.fireDelayed(); // 5 s depois, ainda ocupada: avisa de novo
    expect(seen.map((m) => m.busy)).toEqual([true, true]);
    expect(delays).toEqual([BUSY_BEAT_MS, BUSY_BEAT_MS]);
    app.pendingInspect = true;
    app.timerBusy = false; // o espaço segurado ainda a ocupa: nada muda
    expect(seen.map((m) => m.busy)).toEqual([true, true]);
    app.pendingInspect = false; // livre: avisa uma vez, e a repetição para
    expect(seen.map((m) => m.busy)).toEqual([true, true, false]);
    expect(manual.pending()).toBe(0);
    app.trainerRunning = true;
    app.account!.stop(); // a aba fecha no meio do treino: avisa que ficou livre
    expect(seen.map((m) => m.busy)).toEqual([true, true, false, true, false]);
    expect(manual.pending()).toBe(0);
    expect(new Set(seen.map((m) => m.tab)).size).toBe(1); // sempre a mesma aba
  });

  it('a aba ocupada que sai da conta avisa uma vez que ficou livre e para de repetir o aviso', async () => {
    const make = bus();
    const manual = manualEnv();
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, locks: never, channel: make(), env: manual.env });
    const seen = busyLog(make());
    app.timerBusy = true;
    expect(seen.map((m) => m.busy)).toEqual([true]);
    expect(manual.pending()).toBe(1); // a repetição
    await repo.saveSyncState({ signedIn: false }); // saiu da conta (nesta aba ou noutra) no meio do solve
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    expect(seen.map((m) => m.busy)).toEqual([true, false]);
    expect(manual.pending()).toBe(0);
    app.timerBusy = false; // fora da conta: nada mais sai
    app.timerBusy = true;
    expect(seen.map((m) => m.busy)).toEqual([true, false]);
    expect(manual.pending()).toBe(0);
  });

  it('a líder não começa uma rodada enquanto outra aba está ocupada, e começa quando ela fica livre', async () => {
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), env: env.env });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: first.repo });
    expect([first.app.account!.leader, second.app.account!.leader]).toEqual([true, false]);
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    const syncs = vi.spyOn(net.api, 'sync');
    second.app.timerBusy = true; // um solve na outra aba
    const round = first.app.account!.syncNow();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    env.fireDelayed(); // a espera do motor confere de novo: a outra aba segue ocupada
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    expect(first.app.account!.status.phase).toBe('idle'); // a rodada nem começou
    second.app.timerBusy = false;
    env.fireDelayed();
    await round;
    expect(syncs).toHaveBeenCalled();
  });

  it('uma aba ocupada que some sem avisar deixa de segurar o sync depois de 15 s', async () => {
    let t = Date.now();
    const make = bus();
    const locks = firstWins();
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), env: env.env, now: () => t });
    const busyChannel = make();
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: busyChannel, repo: first.repo });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    second.app.timerBusy = true;
    make.mute(busyChannel); // a aba do solve some sem avisar (o navegador a congelou, ou ela travou)
    const syncs = vi.spyOn(net.api, 'sync');
    const round = first.app.account!.syncNow();
    t += BUSY_STALE_MS - 1;
    env.fireDelayed();
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled();
    t += 1;
    env.fireDelayed();
    await round;
    expect(syncs).toHaveBeenCalled();
  });

  it('a aba que assume quando a líder fecha também espera o solve de outra aba', async () => {
    const make = bus();
    const locks = queueLocks();
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const [a, b, c] = await tabRepos(3);
    await a.saveSyncState({ accountId: 'conta-1', email: 'ranielli@exemplo.com', signedIn: true });
    const first = await appWithAccount(net.api, { locks, channel: make(), repo: a });
    const next = await appWithAccount(net.api, { locks, channel: make(), repo: b, env: env.env }); // a próxima da fila
    const solving = await appWithAccount(net.api, { locks, channel: make(), repo: c });
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    await vi.waitFor(() => expect(solving.app.account!.signedIn).toBe(true));
    solving.app.timerBusy = true;
    const syncs = vi.spyOn(net.api, 'sync');
    first.app.account!.stop(); // a aba da líder fecha no meio do solve da outra
    await vi.waitFor(() => expect(next.app.account!.leader).toBe(true));
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled(); // a rodada de abrir da nova líder espera
    solving.app.timerBusy = false;
    env.fireDelayed();
    await vi.waitFor(() => expect(syncs).toHaveBeenCalled());
  });

  it('a aba que abre durante o solve de outra fica sabendo dele: a aba ocupada responde ao pedido de estado', async () => {
    const make = bus();
    const net = fakeApi(new FakeServer());
    const env = manualEnv();
    const solving = await appWithAccount(net.api, { signedIn: true, locks: never, channel: make() });
    solving.app.timerBusy = true; // ninguém ouviu ainda
    const syncs = vi.spyOn(net.api, 'sync');
    const opened = await appWithAccount(net.api, { signedIn: true, channel: make(), repo: solving.repo, env: env.env }); // lidera sozinha
    expect(opened.app.account!.leader).toBe(true);
    await sleep(10);
    expect(syncs).not.toHaveBeenCalled(); // a rodada de abrir espera
    solving.app.timerBusy = false;
    env.fireDelayed();
    await vi.waitFor(() => expect(syncs).toHaveBeenCalled());
  });

  it('sem conta, nenhuma mensagem busy sai', async () => {
    const make = bus();
    const env = manualEnv();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { channel: make(), env: env.env });
    const other = make();
    const seen = busyLog(other);
    app.timerBusy = true;
    app.pendingInspect = true;
    app.trainerRunning = true;
    expect(env.pending()).toBe(0); // nenhuma repetição agendada
    other.postMessage({ type: 'ask' }); // uma aba que abre pergunta o estado
    app.timerBusy = false;
    app.pendingInspect = false;
    app.trainerRunning = false;
    app.trainerRunning = true;
    app.account!.stop();
    expect(seen).toEqual([]);
  });
});
