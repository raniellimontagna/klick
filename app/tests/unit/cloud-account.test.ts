import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { type ChangeKind, createRepository, defaultSyncState } from '../../src/data/repository';
import { T } from '../../src/strings';
import { ApiError, createSyncApi } from '../../src/sync/api';
import type { LocksLike } from '../../src/sync/triggers';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { appWithAccount, bus, fakeApi } from './sync-account';
import { FakeServer } from './sync-fakes';

const EMAIL = 'ranielli@exemplo.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let dbs = 0;

// Uma promessa que o teste resolve na hora que quer (um pedido que fica "na rede").
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

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

describe('cópias na nuvem (spec 8.3 e 9.1)', () => {
  it('lista os dias com os solves; restaurar pede o segundo clique e depois sincroniza', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 1234 },
      { name: '2026-10-14T21-03-00Z-antes', day: '2026-10-14', kind: 'pre-restore', solves: 1200 },
    ];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    expect(await screen.findByText('1234 solves')).toBeInTheDocument();
    expect(screen.getByText('2026-10-14, antes de uma restauração')).toBeInTheDocument();
    const sync = vi.spyOn(app.account!, 'syncNow');
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    expect(net.cloud.restored).toEqual([]);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(net.cloud.restored).toEqual(['2026-10-15']));
    expect(sync).toHaveBeenCalled();
  });

  it('a cópia que não existe mais (404) avisa e relê a lista, sem sincronizar; sem rede, nada muda', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-09-10', day: '2026-09-10', kind: 'daily', solves: 10 }];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    const sync = vi.spyOn(app.account!, 'syncNow');
    net.api.restoreCloudCopy = async () => {
      net.cloud.copies = []; // passou dos 30 dias: a regra do bucket a apagou
      throw new ApiError('client', 404);
    };
    await fireEvent.click(await screen.findByRole('button', { name: 'Restaurar a cópia de 2026-09-10' }));
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudGone));
    expect(await screen.findByText(T.conta.cloudEmpty)).toBeInTheDocument();
    expect(sync).not.toHaveBeenCalled();
    net.api.restoreCloudCopy = async () => {
      throw new ApiError('offline', 0);
    };
    expect(await app.account!.restoreCloudCopy('2026-09-11')).toBe('failed');
    expect(sync).not.toHaveBeenCalled();
  });

  it('a lista que não carrega avisa, e não diz que não há cópias', async () => {
    const net = fakeApi(new FakeServer());
    net.api.cloudCopies = async () => {
      throw new ApiError('offline', 0);
    };
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudLoadFailed));
    expect(screen.queryByText(T.conta.cloudEmpty)).toBeNull();
  });
});

describe('apagar minha conta (spec 7.7)', () => {
  it('confirma digitando o e-mail; apaga no servidor e deixa os dados do aparelho, fora da conta', async () => {
    const net = fakeApi(new FakeServer());
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle')); // a rodada de abrir terminou: o solve fica na fila
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));
    const field = await screen.findByLabelText('Para confirmar, digite ranielli@exemplo.com');
    await fireEvent.input(field, { target: { value: 'outra@exemplo.com' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O e-mail não confere.');
    expect(net.cloud.deleted).toEqual([]);
    await fireEvent.input(field, { target: { value: ' Ranielli@Exemplo.com ' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    await vi.waitFor(() => expect(net.cloud.deleted).toEqual(['Ranielli@Exemplo.com']));
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    expect(await repo.listSolves()).toHaveLength(1);
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, cursor: 0 });
    expect(await repo.outboxCount()).toBe(1); // a fila fica no aparelho, como os dados (emenda 3)
  });

  it('espera a rodada em andamento antes de apagar no servidor; o 401 da conta apagada não vira "O sync parou"', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const real = net.api.sync;
    const gate = deferred();
    const inFlight = deferred();
    net.api.sync = async (req: SyncRequest): Promise<SyncResponse> => {
      inFlight.resolve();
      await gate.promise;
      return real(req); // depois do apagar, a conta responderia 401
    };
    const round = app.account!.syncNow();
    await inFlight.promise;
    const deleting = app.account!.deleteAccount(EMAIL);
    await sleep(20);
    expect(net.cloud.deleted).toEqual([]); // a resposta ainda está na rede
    gate.resolve();
    expect(await deleting).toBe('ok');
    await round;
    expect(net.cloud.deleted).toEqual([EMAIL]);
    expect(app.account!.signedIn).toBe(false);
    expect(app.account!.status.phase).toBe('off');
    await app.account!.syncNow();
    await sleep(100); // a região aria-live põe o texto 50 ms depois
    expect(app.live).toBe('');
  });

  it('o e-mail que não confere não para o sync; sem resposta do servidor, a conta continua e o sync volta', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const syncs = vi.spyOn(net.api, 'sync');
    expect(await app.account!.deleteAccount('outra@exemplo.com')).toBe('mismatch');
    await app.account!.syncNow();
    expect(syncs).toHaveBeenCalledTimes(1);
    net.api.deleteAccount = async () => {
      throw new ApiError('offline', 0);
    };
    expect(await app.account!.deleteAccount(EMAIL)).toBe('failed');
    expect(app.account!.signedIn).toBe(true);
    await app.account!.syncNow();
    expect(syncs).toHaveBeenCalledTimes(2); // o sync não ficou parado
  });

  it('apagar numa aba que não lidera para a líder antes; as duas saem da conta, sem aviso de falha', async () => {
    const net = fakeApi(new FakeServer());
    const name = `apagar-abas-${++dbs}`;
    const data = bus(); // o canal dos dados (o aviso 'sync' entre as abas)
    const make = bus(); // o canal da conta
    const locks = firstWins();
    const tab = async () =>
      appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: createRepository(await openKlickDb(name), { channel: data() }) });
    const first = await tab();
    const second = await tab();
    expect(first.app.account!.leader).toBe(true);
    expect(second.app.account!.leader).toBe(false);
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
    const deleting = second.app.account!.deleteAccount(EMAIL);
    await sleep(20);
    expect(net.cloud.deleted).toEqual([]); // a rodada da líder ainda está na rede
    gate.resolve();
    expect(await deleting).toBe('ok');
    await round;
    net.api.sync = real;
    await vi.waitFor(() => expect(first.app.account!.signedIn).toBe(false)); // pelo aviso 'sync' do repositório
    expect(second.app.account!.signedIn).toBe(false);
    const syncs = vi.spyOn(net.api, 'sync');
    await first.app.account!.syncNow();
    await second.app.account!.syncNow();
    expect(syncs).not.toHaveBeenCalled();
    await sleep(100);
    expect(first.app.live).toBe('');
    expect(second.app.live).toBe('');
  });
});

describe('o repositório esquece a conta (spec 7.7)', () => {
  it('numa transação, o estado do sync volta ao padrão com o relógio; os dados e a fila ficam; avisa "sync"', async () => {
    const repo = createRepository(await openKlickDb(`esquece-${++dbs}`), { channel: null });
    await repo.saveSyncState({ accountId: 'conta-1', email: EMAIL, signedIn: true, cursor: 7, lastSyncAt: 1, passkey: true });
    await repo.addSolve({ sessionId: (await repo.createSession({ event: '333' })).id, event: '333', ms: 9000, penalty: null, at: Date.now(), scramble: 'R U' });
    const before = await repo.getSyncState();
    const waiting = await repo.outboxCount();
    expect(waiting).toBeGreaterThan(0);
    const heard: ChangeKind[] = [];
    repo.onChange((kind) => heard.push(kind));
    await repo.forgetAccount();
    expect(await repo.getSyncState()).toEqual({ ...defaultSyncState(), clock: before.clock });
    expect(before.clock).toBeGreaterThan(0);
    expect(await repo.listSolves()).toHaveLength(1);
    expect(await repo.outboxCount()).toBe(waiting);
    expect(heard).toEqual(['sync']);
  });
});

describe('cliente HTTP das cópias e da conta (Task 17)', () => {
  it('lista, restaura e apaga nas rotas do servidor; o 404 da cópia chega como 404', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3 }];
    const api = createSyncApi(async (url, init) => {
      seen.push({ url, init });
      if (url === '/api/snapshots') return Response.json({ copies });
      if (url.includes('velha')) return Response.json({ error: 'not-found' }, { status: 404 });
      return new Response(null, { status: 204 });
    });
    expect(await api.cloudCopies()).toEqual(copies);
    await api.restoreCloudCopy('2026-10-14T21-03-00Z-antes');
    await api.deleteAccount(EMAIL);
    await expect(api.restoreCloudCopy('velha')).rejects.toMatchObject({ kind: 'client', status: 404 });
    expect(seen[0].init?.method ?? 'GET').toBe('GET');
    expect(seen[1].url).toBe('/api/snapshots/2026-10-14T21-03-00Z-antes/restore');
    expect(seen[1].init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    expect(seen[2].url).toBe('/api/account');
    expect(seen[2].init).toMatchObject({ method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAIL }) });
    for (const init of seen.map((s) => s.init)) expect(init?.signal).toBeInstanceOf(AbortSignal); // com prazo
  });

  it('uma lista fora da forma (o index.html sem o Worker) é erro do servidor', async () => {
    await expect(createSyncApi(async () => new Response('<!doctype html>', { status: 200 })).cloudCopies()).rejects.toMatchObject({ kind: 'server' });
    await expect(createSyncApi(async () => Response.json({ copies: 'nada' })).cloudCopies()).rejects.toMatchObject({ kind: 'server' });
  });
});
