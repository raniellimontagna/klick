import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestoreRefusal, SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { gzipJson } from '../../src/core/gzip';
import type { CopyManifest, CopyPart } from '../../src/core/sync/copy-parts';
import { openKlickDb } from '../../src/data/db';
import { type ChangeKind, createRepository, defaultSyncState, type KlickExport } from '../../src/data/repository';
import { T } from '../../src/strings';
import { ApiError, createSyncApi } from '../../src/sync/api';
import type { LocksLike } from '../../src/sync/triggers';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { CONFIRM_DELAY_MS } from '../../src/ui/confirm';
import { appWithAccount, bus, fakeApi, manualEnv } from './sync-account';
import { FakeServer } from './sync-fakes';

const EMAIL = 'ranielli@exemplo.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let dbs = 0;

// O segundo clique de "Restaurar" só vale depois de CONFIRM_DELAY_MS (5.4): só o relógio (Date) é falso, o resto do teste segue real.
const fakeClock = () => vi.useFakeTimers({ toFake: ['Date'] });
const later = (ms = CONFIRM_DELAY_MS) => vi.setSystemTime(Date.now() + ms);
afterEach(() => vi.useRealTimers());

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
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 1234, parts: 0 },
      { name: '2026-10-14T21-03-00Z-antes', day: '2026-10-14', kind: 'pre-restore', solves: 1200, parts: 0 },
    ];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    expect(await screen.findByText('1234 solves')).toBeInTheDocument();
    expect(screen.getByText('2026-10-14, antes de uma restauração')).toBeInTheDocument();
    const sync = vi.spyOn(app.account!, 'syncNow');
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    expect(net.cloud.restored).toEqual([]);
    later();
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(net.cloud.restored).toEqual(['2026-10-15']));
    expect(sync).toHaveBeenCalled();
  });

  it('o segundo clique em "Restaurar este dia" antes de 400 ms não restaura; depois, restaura', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 5, parts: 0 }];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('5 solves');
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    later(CONFIRM_DELAY_MS - 1);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' })); // o clique duplo
    await sleep(20);
    expect(net.cloud.restored).toEqual([]);
    expect(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' })).toBeInTheDocument(); // continua armado
    later(1);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(net.cloud.restored).toEqual(['2026-10-15']));
  });

  it('a cópia que não existe mais (404) avisa e relê a lista, sem sincronizar; sem rede, nada muda', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-09-10', day: '2026-09-10', kind: 'daily', solves: 10, parts: 0 }];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    const sync = vi.spyOn(app.account!, 'syncNow');
    net.api.restoreCloudCopy = async () => {
      net.cloud.copies = []; // passou dos 30 dias: a regra do bucket a apagou
      throw new ApiError('client', 404);
    };
    fakeClock();
    await fireEvent.click(await screen.findByRole('button', { name: 'Restaurar a cópia de 2026-09-10' }));
    later();
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

// A cota de operações e as recusas da restauração (endurecimento 4.2 e decisões 1, 2, 3 e 6): cada recusa chega com o código do Worker
// ({ error }, no status de REFUSAL_STATUS em worker/router.ts) e vira a mensagem dela; nada muda neste aparelho.
describe('cópias na nuvem: pausas e recusas', () => {
  const REFUSALS: [RestoreRefusal, number, string][] = [
    ['no-room', 409, 'Não há espaço para guardar o estado de agora antes de restaurar. Tudo continua como estava.'],
    ['restore-limit', 429, 'Já foram restaurações demais hoje. Tente de novo amanhã.'],
    ['r2-budget', 503, 'As cópias na nuvem pararam até o mês que vem: o limite gratuito acabou. Tudo continua como estava.'],
    ['too-big', 413, 'Esta conta é grande demais para restaurar uma cópia na nuvem. As cópias deste aparelho continuam valendo.'],
    ['write-budget', 429, 'A conta já gravou muita coisa hoje. Tente restaurar amanhã.'],
  ];

  it.each(REFUSALS)('cada recusa da restauração mostra a mensagem dela e nada muda (%s, %i)', async (code, status, message) => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3, parts: 0 }];
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await app.account!.syncNow();
    const solves = await repo.listSolves();
    const state = await repo.getSyncState();
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('3 solves');
    const sync = vi.spyOn(app.account!, 'syncNow');
    net.api.restoreCloudCopy = createSyncApi(async () => Response.json({ error: code }, { status })).restoreCloudCopy;
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    later();
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(message));
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe(code);
    expect(screen.getByRole('heading', { name: 'Cópias na nuvem' })).toBeInTheDocument(); // o diálogo fica aberto
    expect(sync).not.toHaveBeenCalled();
    expect(net.cloud.restored).toEqual([]);
    expect(await repo.listSolves()).toEqual(solves);
    // A rodada limpa de antes do pedido (freshSync, a rodada residual) só renova a hora do sync.
    expect(await repo.getSyncState()).toEqual({ ...state, lastSyncAt: expect.any(Number) });
  });

  it('um código que não é de recusa (a rajada do Worker, 429 "limited") continua sendo a falha de sempre', async () => {
    const net = fakeApi(new FakeServer());
    net.api.restoreCloudCopy = createSyncApi(async () => Response.json({ error: 'limited' }, { status: 429 })).restoreCloudCopy;
    const { app } = await appWithAccount(net.api, { signedIn: true });
    const sync = vi.spyOn(app.account!, 'syncNow');
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('failed');
    expect(sync).not.toHaveBeenCalled();
  });

  it('a lista sem operações no mês mostra cloudOpsLimit', async () => {
    const net = fakeApi(new FakeServer());
    net.api.cloudCopies = createSyncApi(async () => Response.json({ error: 'r2-budget' }, { status: 503 })).cloudCopies;
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await vi.waitFor(() =>
      expect(app.toast?.text).toBe('As cópias na nuvem pararam até o mês que vem: o limite gratuito acabou. Tudo continua como estava.'),
    );
    expect(T.conta.cloudOpsLimit).toBe(app.toast?.text);
    expect(screen.queryByText(T.conta.cloudEmpty)).toBeNull();
  });

  // A lista que não carrega por falta de operações do R2 deixa a pausa fixa no topo, além do aviso; outra falha não inventa pausa nenhuma.
  it('a lista que não carrega por falta de operações deixa a pausa fixa no topo do diálogo', async () => {
    const net = fakeApi(new FakeServer());
    let fail: () => Response = () => Response.json({ error: 'r2-budget' }, { status: 503 });
    net.api.cloudCopies = (account) => createSyncApi(async () => fail()).cloudCopies(account);
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    expect(app.account!.sync.copiesPaused).toBeNull();
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudOpsLimit));
    expect(document.querySelector('[data-cloud-paused]')).toHaveTextContent(T.conta.cloudPaused('ops'));
    expect(screen.queryByText(T.conta.cloudEmpty)).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    fail = () => new Response(null, { status: 502 }); // a rede, não o limite
    await fireEvent.click(screen.getByRole('button', { name: 'Ver cópias na nuvem' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudLoadFailed));
    expect(document.querySelector('[data-cloud-paused]')).toBeNull();
  });

  it('a lista com as cópias pausadas diz por quê no topo do diálogo', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3, parts: 0 }];
    let paused: string | null = 'ops'; // a lista guardada, que não se renovou este mês
    net.api.cloudCopies = createSyncApi(async () => Response.json({ copies: net.cloud.copies, paused })).cloudCopies;
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    expect(await screen.findByText('Cópias na nuvem pausadas até o mês que vem: o limite gratuito do mês acabou.')).toBeInTheDocument();
    expect(screen.getByText('3 solves')).toBeInTheDocument(); // a lista aparece mesmo assim
    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    paused = 'space';
    await fireEvent.click(screen.getByRole('button', { name: 'Ver cópias na nuvem' }));
    expect(await screen.findByText('Cópias na nuvem pausadas: o espaço gratuito encheu.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    paused = 'size';
    await fireEvent.click(screen.getByRole('button', { name: 'Ver cópias na nuvem' }));
    expect(await screen.findByText('Cópias na nuvem pausadas: a conta passou do tamanho que o plano gratuito copia.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    paused = null;
    await fireEvent.click(screen.getByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('3 solves');
    expect(screen.queryByText(/^Cópias na nuvem pausadas/)).toBeNull();
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

  it('400 do servidor diz que o e-mail não confere', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    net.cloud.deleteError = new ApiError('client', 400, 'confirm'); // o e-mail daqui bate com o guardado, o do servidor não
    const syncs = vi.spyOn(net.api, 'sync');
    expect(await app.account!.deleteAccount(EMAIL)).toBe('mismatch');
    expect(app.account!.signedIn).toBe(true);
    await app.account!.syncNow();
    expect(syncs).toHaveBeenCalledTimes(1); // o sync não ficou parado
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));
    await fireEvent.input(await screen.findByLabelText('Para confirmar, digite ranielli@exemplo.com'), { target: { value: EMAIL } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.deleteMismatch);
  });

  it('401 de sessão vencida pede para entrar de novo e o sync volta', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    net.cloud.deleteError = new ApiError('auth', 401, 'auth');
    const syncs = vi.spyOn(net.api, 'sync');
    expect(await app.account!.deleteAccount(EMAIL)).toBe('auth');
    expect(app.account!.signedIn).toBe(true); // a conta continua: só a sessão venceu
    await app.account!.syncNow();
    expect(syncs).toHaveBeenCalledTimes(1);
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Apagar minha conta' }));
    await fireEvent.input(await screen.findByLabelText('Para confirmar, digite ranielli@exemplo.com'), { target: { value: EMAIL } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.deleteSignInAgain);
    expect(screen.getByRole('alert')).not.toHaveTextContent('conexão');
    await fireEvent.click(screen.getByRole('button', { name: T.conta.signInAgain }));
    await vi.waitFor(() => expect(app.dialog).toBe('signin'));
  });

  it('o 401 "gone" do servidor chega pelo cliente HTTP como ApiError e a conta o trata como conta já apagada', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const http = createSyncApi(async () => Response.json({ error: 'gone' }, { status: 401 }));
    await expect(http.deleteAccount(EMAIL, 'conta-1')).rejects.toMatchObject({ kind: 'auth', status: 401, code: 'gone' });
    net.api.deleteAccount = http.deleteAccount;
    expect(await app.account!.deleteAccount(EMAIL)).toBe('ok');
    expect(app.account!.signedIn).toBe(false);
  });

  it('401 de conta já apagada sai da conta como no apagar', async () => {
    const net = fakeApi(new FakeServer());
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    net.cloud.deleteError = new ApiError('auth', 401, 'gone'); // apagada em outro aparelho
    expect(await app.account!.deleteAccount(EMAIL)).toBe('ok');
    expect(app.account!.signedIn).toBe(false);
    expect(await repo.listSolves()).toHaveLength(1); // os dados ficam no aparelho
    expect(await repo.getSyncState()).toMatchObject({ accountId: null, cursor: 0 });
    expect(app.account!.status.phase).toBe('off');
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

// A restauração pelo aparelho (conta grande): o servidor diz "restaure aí", e o aparelho sincroniza, baixa, guarda a cópia local, aplica
// só as diferenças e deixa o sync subir o resto. Antes da gravação local, nada do aparelho muda (Review Focus 2).
describe('a restauração pelo aparelho', () => {
  const manifestOf = (copy: KlickExport, n: number): CopyManifest => ({
    format: 'klick-parts', version: 1, exportedAt: copy.exportedAt, day: '2026-10-20', profile: copy.profile, solves: copy.solves.length,
    parts: Array.from({ length: n }, (_, i) => ({ last: ['solves', `p${i + 1}`] as const, records: 1 })),
  });
  const partOf = (solves: KlickExport['solves'], sessions: KlickExport['sessions'] = []): CopyPart => ({ sessions, solves, practice: [], duels: [] });

  // O aparelho com a sessão e dois solves (A e B), e a cópia em partes: tem o A e um C que o aparelho não tem (o B ficou de fora).
  async function setup() {
    const net = fakeApi(new FakeServer());
    net.cloud.answer = { restore: 'device', parts: 2 };
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await app.addSolve({ ms: 8000, penalty: null, at: Date.now() });
    await app.account!.syncNow();
    const here = await repo.exportAll();
    const [a, b] = [...here.solves].sort((x, y) => x.ms - y.ms).reverse();
    const c = { ...b, id: 'solve-so-da-copia', ms: 7000 };
    const copy: KlickExport = { ...here, solves: [a, c] };
    const parts = [partOf([a], here.sessions), partOf([c])];
    net.cloud.partBytes = [await gzipJson(manifestOf(copy, 2)), await gzipJson(parts[0]), await gzipJson(parts[1])];
    return { net, app, repo, a, b, c };
  }

  it('resposta device: sincroniza, baixa, guarda a cópia local e grava só as diferenças', async () => {
    const { net, app, repo, a, b, c } = await setup();
    const events: string[] = [];
    const account = app.account!;
    const fresh = account.freshSync.bind(account);
    vi.spyOn(account, 'freshSync').mockImplementation(async (since) => {
      events.push('rodada');
      return fresh(since);
    });
    const sync = vi.spyOn(app.account!, 'syncNow').mockImplementation(async () => void events.push('sync'));
    const part = net.api.copyPart;
    net.api.copyPart = async (name, index, account) => {
      events.push(`parte:${index}`);
      return part(name, index, account);
    };
    const post = net.api.restoreCloudCopy;
    net.api.restoreCloudCopy = async (name, account) => {
      events.push('pedido');
      return post(name, account);
    };
    const backups = (await repo.listBackups()).length;
    const untouched = (await repo.listSolves()).find((s) => s.id === a.id)!;
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('device');
    // Uma rodada limpa antes do pedido (I2 e a rodada residual: 'stale' nem chega ao servidor), o objeto 0 e as partes 1..N em ordem, e o
    // sync de depois de gravar.
    expect(events).toEqual(['rodada', 'pedido', 'parte:0', 'parte:1', 'parte:2', 'sync']);
    expect(sync).toHaveBeenCalledTimes(1);
    // A cópia local 'pre-restore' foi guardada, com o estado de antes (A e B).
    const after = await repo.listBackups();
    expect(after).toHaveLength(backups + 1);
    expect(after.some((r) => r.reason === 'pre-restore')).toBe(true);
    // O A, igual dos dois lados, não foi tocado (nem a data de alteração); o C entrou; o B, que a cópia não tem, foi para a lixeira.
    const solves = await repo.listSolves();
    expect(solves.find((s) => s.id === a.id)).toEqual(untouched);
    expect(solves.map((s) => s.id).sort()).toEqual([a.id, c.id].sort());
    expect((await repo.listTrash()).solves.map((s) => s.id)).toEqual([b.id]);
    expect(net.cloud.restored).toEqual(['2026-10-15']);
  });

  it('o portão da cópia local segura a troca: held, o aviso é do app e o sync de depois não sai', async () => {
    const { app, repo } = await setup();
    const solves = await repo.listSolves();
    const held = vi.spyOn(app, 'restoreFromCloud').mockResolvedValue(false);
    const sync = vi.spyOn(app.account!, 'syncNow');
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('held');
    expect(held).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled(); // o sync de depois não houve
    expect(await repo.listSolves()).toEqual(solves);
  });

  it('o objeto 0 que é uma cópia inteira (arquivo só): grava sem pedir partes', async () => {
    const { net, app, repo, a, c } = await setup();
    const whole: KlickExport = { ...(await repo.exportAll()), solves: [a, c] };
    net.cloud.answer = { restore: 'device', parts: 0 };
    net.cloud.partBytes = [await gzipJson(whole)];
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('device');
    expect(net.cloud.partCalls).toEqual([0]);
    expect((await repo.listSolves()).map((s) => s.id).sort()).toEqual([a.id, c.id].sort());
  });

  it('download que falha no meio: failed, nenhuma cópia local nova, nada gravado', async () => {
    const { net, app, repo } = await setup();
    await app.account!.syncNow();
    const solves = await repo.listSolves();
    const trash = await repo.listTrash();
    const backups = (await repo.listBackups()).map((r) => r.id);
    const sync = vi.spyOn(app.account!, 'syncNow');
    net.api.copyPart = async (_name, index) => {
      if (index === 2) throw new ApiError('offline', 0); // a rede cai na última parte
      return net.cloud.partBytes[index].slice(0);
    };
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('failed');
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(backups);
    expect(await repo.listSolves()).toEqual(solves);
    expect(await repo.listTrash()).toEqual(trash);
    expect(sync).not.toHaveBeenCalled(); // o sync de depois não houve
  });

  // A revisão final (I2): o aparelho só compara com a cópia depois de uma rodada que começou depois do clique e terminou limpa (sem erro, sem
  // nada por receber, sem o orçamento de leituras do dia). Senão, 'stale': nada baixado, nada gravado.
  it('a rodada de antes de baixar não termina limpa (erro, mais por receber, leituras do dia): stale, nada baixado nem gravado', async () => {
    const { net, app, repo } = await setup();
    const solves = await repo.listSolves();
    const backups = (await repo.listBackups()).map((r) => r.id);
    const real = net.api.sync;
    const modes: [string, (req: SyncRequest) => Promise<SyncResponse>][] = [
      ['erro', async () => {
        throw new ApiError('server', 500);
      }],
      ['mais', async (req) => ({ ...(await real(req)), more: true, cursor: req.cursor })], // mais por receber, e o cursor não anda
      ['leituras', async (req) => ({ accepted: 0, rejected: [], changes: [], cursor: req.cursor, more: false, serverTime: Date.now(), retryAt: Date.now() + 3_600_000, readsDeferred: true, copiesPaused: null })],
    ];
    const asked = net.cloud.restored.length;
    for (const [mode, sync] of modes) {
      net.api.sync = sync;
      expect(await app.account!.restoreCloudCopy('2026-10-15'), mode).toBe('stale');
    }
    expect(net.cloud.restored).toHaveLength(asked); // o pedido de restaurar nem saiu: não conta nas restaurações do dia
    expect(net.cloud.partCalls).toEqual([]);
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(backups);
    expect(await repo.listSolves()).toEqual(solves);
    // Com a rodada limpa de novo, a mesma restauração segue.
    net.api.sync = real;
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('device');
  });

  it('com outra restauração em andamento (o portão do app), held avisa que ela já está em andamento', async () => {
    const { app, repo } = await setup();
    const solves = await repo.listSolves();
    (app as unknown as { restoreBusy: boolean }).restoreBusy = true; // a cópia local restaurando agora
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('held');
    expect(app.toast?.text).toBe(T.conta.cloudRestoreBusy);
    expect(T.conta.cloudRestoreBusy).toBe('Uma restauração já está em andamento. Espere ela terminar.');
    expect(await repo.listSolves()).toEqual(solves);
  });

  it('o limite de partes do dia (429 restore-limit) ou das operações (503 r2-budget) no download é a recusa dela, não failed', async () => {
    const { net, app, repo } = await setup();
    const solves = await repo.listSolves();
    for (const [status, code] of [[429, 'restore-limit'], [503, 'r2-budget']] as const) {
      net.api.copyPart = async (_name, index) => {
        if (index === 1) throw new ApiError(status === 429 ? 'client' : 'server', status, code);
        return net.cloud.partBytes[index].slice(0);
      };
      expect(await app.account!.restoreCloudCopy('2026-10-15'), code).toBe(code);
    }
    expect(await repo.listSolves()).toEqual(solves);
  });

  it('o andamento do download: k de N, com N das partes da resposta', async () => {
    const { app } = await setup();
    const steps: [number, number][] = [];
    expect(await app.account!.restoreCloudCopy('2026-10-15', (k, n) => steps.push([k, n]))).toBe('device');
    expect(steps).toEqual([[1, 2], [2, 2]]); // uma vez por parte: o manifesto não repete o "1 de 2"
  });

  it('numa aba que não lidera: espera a rodada da líder pedida depois do clique; limpa, segue; com erro ou sem resposta, stale', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.answer = { restore: 'device', parts: 0 };
    const name = `restaura-abas-${++dbs}`;
    const data = bus();
    const make = bus();
    const locks = firstWins();
    const env = manualEnv();
    const first = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), repo: createRepository(await openKlickDb(name), { channel: data() }) });
    const second = await appWithAccount(net.api, { signedIn: true, locks, channel: make(), env: env.env, repo: createRepository(await openKlickDb(name), { channel: data() }) });
    expect([first.app.account!.leader, second.app.account!.leader]).toEqual([true, false]);
    await vi.waitFor(() => expect(first.app.account!.status.phase).toBe('idle'));
    await first.app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await first.app.account!.syncNow();
    net.cloud.partBytes = [await gzipJson({ ...(await first.repo.exportAll()), solves: [] })];
    const syncs = vi.spyOn(net.api, 'sync');

    // A líder roda a rodada pedida pela outra aba, e só depois dela a outra baixa.
    expect(await second.app.account!.restoreCloudCopy('2026-10-15')).toBe('device');
    expect(syncs).toHaveBeenCalled();
    expect(await second.repo.listSolves()).toEqual([]);

    // A rodada da líder falha: stale, sem baixar.
    net.cloud.partCalls.length = 0;
    const real = net.api.sync;
    net.api.sync = async () => {
      throw new ApiError('server', 500);
    };
    const asked = net.cloud.restored.length;
    expect(await second.app.account!.restoreCloudCopy('2026-10-15')).toBe('stale');
    expect(net.cloud.partCalls).toEqual([]);
    expect(net.cloud.restored).toHaveLength(asked);

    // A líder não responde (a aba dela está suspensa): passado o prazo, stale.
    net.api.sync = real;
    const leaderChannel = (first.app.account as unknown as { channel: Parameters<typeof make.mute>[0] }).channel;
    make.mute(leaderChannel);
    const waiting = second.app.account!.restoreCloudCopy('2026-10-15');
    await vi.waitFor(() => expect(env.pending()).toBeGreaterThan(0));
    env.fireDelayed();
    expect(await waiting).toBe('stale');
    expect(net.cloud.partCalls).toEqual([]);
    expect(net.cloud.restored).toHaveLength(asked);
  });

  it('parte torta, manifesto torto ou arquivo que não é do Klick: failed, sem gravar nada', async () => {
    const { net, app, repo } = await setup();
    await app.account!.syncNow();
    const solves = await repo.listSolves();
    const backups = (await repo.listBackups()).map((r) => r.id);
    const good = [...net.cloud.partBytes];
    for (const bad of [
      [good[0], await gzipJson({ sessions: 'x' }), good[2]], // a parte não é uma parte
      [await gzipJson({ format: 'klick-parts', version: 1 }), good[1], good[2]], // o manifesto não é um manifesto
      [await gzipJson({ format: 'outra-coisa' })], // nem manifesto nem cópia inteira
      [good[0], new TextEncoder().encode('não é gzip').buffer as ArrayBuffer, good[2]], // bytes que não abrem
    ]) {
      net.cloud.partBytes = bad;
      expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('failed');
    }
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(backups);
    expect(await repo.listSolves()).toEqual(solves);
  });

  it('parte 404: gone, e nada gravado', async () => {
    const { net, app, repo } = await setup();
    await app.account!.syncNow();
    const solves = await repo.listSolves();
    const backups = (await repo.listBackups()).map((r) => r.id);
    net.cloud.partBytes = [net.cloud.partBytes[0], net.cloud.partBytes[1]]; // a parte 2 sumiu (a regra do bucket)
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('gone');
    net.cloud.partBytes = []; // e o objeto 0 também
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('gone');
    expect((await repo.listBackups()).map((r) => r.id)).toEqual(backups);
    expect(await repo.listSolves()).toEqual(solves);
  });

  it('resposta server: ok, como hoje (sem baixar nada, e o sync pede a mudança depois)', async () => {
    const net = fakeApi(new FakeServer());
    const { app } = await appWithAccount(net.api, { signedIn: true });
    const sync = vi.spyOn(app.account!, 'syncNow');
    expect(await app.account!.restoreCloudCopy('2026-10-15')).toBe('ok');
    expect(net.cloud.partCalls).toEqual([]);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

describe('o diálogo das cópias grandes', () => {
  it('cópia com parts: o primeiro clique mostra o aviso de conta grande; sem parts, não', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 90_000, parts: 3 },
      { name: '2026-10-14', day: '2026-10-14', kind: 'daily', solves: 10, parts: 0 },
    ];
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('90000 solves');
    expect(document.querySelector('[data-cloud-big]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-14' }));
    expect(document.querySelector('[data-cloud-big]')).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    const big = document.querySelectorAll('[data-cloud-big]');
    expect(big).toHaveLength(1);
    expect(big[0]).toHaveTextContent(T.conta.cloudBig);
    expect(T.conta.cloudBig).toBe('Esta conta é grande: se a restauração não couber no dia, ela chega a este aparelho na hora e aos outros nos próximos dias.');
    expect(big[0].closest('li')).toHaveTextContent('90000 solves');
    // O aviso descreve o botão armado (o leitor de tela o lê junto com "Tem certeza?").
    const armed = screen.getByRole('button', { name: 'Tem certeza? Clique de novo' });
    expect(armed.getAttribute('aria-describedby')).toBe(big[0].id);
    expect(big[0].id).not.toBe('');
    expect(net.cloud.restored).toEqual([]); // o primeiro clique só arma
  });

  it('device mostra o toast de restaurado neste aparelho e fecha', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 5, parts: 1 }];
    net.cloud.answer = { restore: 'device', parts: 1 };
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    const whole: KlickExport = { ...(await repo.exportAll()), solves: [] };
    net.cloud.partBytes = [await gzipJson(whole)];
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('5 solves');
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    later();
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudRestoredHere));
    expect(T.conta.cloudRestoredHere).toBe('Restaurado neste aparelho. Os outros recebem nos próximos dias, pelo sync.');
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Cópias na nuvem' })).toBeNull());
  });

  it('enquanto baixa, o andamento numa região aria-live, e a lista ocupada (aria-busy)', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 5, parts: 1 }];
    net.cloud.answer = { restore: 'device', parts: 1 };
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    const whole: KlickExport = { ...(await repo.exportAll()), solves: [] };
    net.cloud.partBytes = [await gzipJson(whole)];
    const gate = deferred();
    const part = net.api.copyPart;
    net.api.copyPart = async (name, index, account) => {
      await gate.promise;
      return part(name, index, account);
    };
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('5 solves');
    const live = document.querySelector('[data-cloud-progress]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live).toHaveTextContent('');
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    later();
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(live).toHaveTextContent(T.conta.cloudDownloading(1, 1)));
    expect(T.conta.cloudDownloading(3, 23)).toBe('Baixando a cópia (3 de 23)…');
    expect(live.closest('dialog')!.querySelector('ul')!.getAttribute('aria-busy')).toBe('true');
    gate.resolve();
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudRestoredHere));
  });

  it('stale (a rodada de antes não terminou limpa) avisa para sincronizar antes, e nada muda', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 5, parts: 1 }];
    net.cloud.answer = { restore: 'device', parts: 1 };
    const { app } = await appWithAccount(net.api, { signedIn: true });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('5 solves');
    net.api.sync = async () => {
      throw new ApiError('offline', 0);
    };
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    later();
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.cloudSyncFirst));
    expect(T.conta.cloudSyncFirst).toBe('Não consegui sincronizar este aparelho antes de restaurar. Confira a conexão e tente de novo. Tudo continua como estava.');
    expect(net.cloud.partCalls).toEqual([]);
    expect(net.cloud.restored).toEqual([]); // nem o pedido de restaurar saiu
    expect(screen.getByRole('heading', { name: 'Cópias na nuvem' })).toBeInTheDocument();
  });

  it('held (o portão da cópia local segurou a troca) fecha o diálogo sem aviso próprio', async () => {
    const net = fakeApi(new FakeServer());
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 5, parts: 1 }];
    net.cloud.answer = { restore: 'device', parts: 1 };
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    const whole: KlickExport = { ...(await repo.exportAll()), solves: [] };
    net.cloud.partBytes = [await gzipJson(whole)];
    vi.spyOn(app, 'restoreFromCloud').mockResolvedValue(false);
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Ver cópias na nuvem' }));
    await screen.findByText('5 solves');
    fakeClock();
    await fireEvent.click(screen.getByRole('button', { name: 'Restaurar a cópia de 2026-10-15' }));
    later();
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(screen.queryByRole('heading', { name: 'Cópias na nuvem' })).toBeNull());
    expect(app.toast).toBeNull();
  });
});

// C1: as rotas da conta levam a conta deste aparelho (meta.sync.accountId), para o Worker recusar a sessão de outra conta.
describe('a conta deste aparelho nas rotas da conta (C1)', () => {
  it('listar, restaurar e apagar a conta mandam a conta daqui; fora de qualquer conta, nada sai', async () => {
    const net = fakeApi(new FakeServer());
    const sent: string[] = [];
    net.api.cloudCopies = async (account) => {
      sent.push(`copies:${account}`);
      return { copies: [], paused: null };
    };
    net.api.restoreCloudCopy = async (name, account) => {
      sent.push(`restore:${name}:${account}`);
      return { restore: 'server' };
    };
    net.api.deleteAccount = async (email, account) => void sent.push(`delete:${email}:${account}`);
    const { app, repo } = await appWithAccount(net.api, { signedIn: true });
    const account = app.account!;
    await account.cloudCopies();
    expect(await account.restoreCloudCopy('2026-10-15')).toBe('ok');
    expect(await account.deleteAccount(EMAIL)).toBe('ok');
    expect(sent).toEqual(['copies:conta-1', 'restore:2026-10-15:conta-1', `delete:${EMAIL}:conta-1`]);
    expect((await repo.getSyncState()).accountId).toBeNull();
    await expect(account.cloudCopies()).rejects.toMatchObject({ kind: 'auth' });
    expect(await account.restoreCloudCopy('2026-10-15')).toBe('failed');
    expect(sent).toHaveLength(3);
  });
});

describe('cliente HTTP das cópias e da conta (Task 17)', () => {
  it('lista, restaura e apaga nas rotas do servidor; o 404 da cópia chega como 404', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3, parts: 0 }];
    const api = createSyncApi(async (url, init) => {
      seen.push({ url, init });
      if (url === '/api/snapshots') return Response.json({ copies });
      if (url.includes('velha')) return Response.json({ error: 'not-found' }, { status: 404 });
      return new Response(null, { status: 204 });
    });
    expect(await api.cloudCopies('conta-1')).toEqual({ copies, paused: null });
    await api.restoreCloudCopy('2026-10-14T21-03-00Z-antes', 'conta-1');
    await api.deleteAccount(EMAIL, 'conta-1');
    await expect(api.restoreCloudCopy('velha', 'conta-1')).rejects.toMatchObject({ kind: 'client', status: 404 });
    expect(seen[0].init?.method ?? 'GET').toBe('GET');
    // A conta que o aparelho espera vai em cada rota da conta (C1): o Worker recusa a sessão de outra conta.
    expect(seen[0].init).toMatchObject({ headers: { 'x-klick-account': 'conta-1' } });
    expect(seen[1].url).toBe('/api/snapshots/2026-10-14T21-03-00Z-antes/restore');
    expect(seen[1].init).toMatchObject({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-klick-account': 'conta-1' } });
    expect(seen[2].url).toBe('/api/account');
    expect(seen[2].init).toMatchObject({
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'x-klick-account': 'conta-1' },
      body: JSON.stringify({ email: EMAIL }),
    });
    for (const init of seen.map((s) => s.init)) expect(init?.signal).toBeInstanceOf(AbortSignal); // com prazo
  });

  it('restaurar manda { device: true }; 204 é o servidor, 200 com parts inteiro de 0 a 999 é o aparelho; o resto é erro do servidor', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const answering = (res: () => Response) =>
      createSyncApi(async (url, init) => {
        seen.push({ url, init });
        return res();
      });
    expect(await answering(() => new Response(null, { status: 204 })).restoreCloudCopy('d', 'conta-1')).toEqual({ restore: 'server' });
    expect(seen[0].init?.body).toBe(JSON.stringify({ device: true }));
    expect(await answering(() => Response.json({ restore: 'device', parts: 3 })).restoreCloudCopy('d', 'conta-1')).toEqual({ restore: 'device', parts: 3 });
    expect(await answering(() => Response.json({ restore: 'device', parts: 0 })).restoreCloudCopy('d', 'conta-1')).toEqual({ restore: 'device', parts: 0 });
    expect(await answering(() => Response.json({ restore: 'device', parts: 999 })).restoreCloudCopy('d', 'conta-1')).toEqual({ restore: 'device', parts: 999 });
  });

  it('api: 200 torto vira ApiError server', async () => {
    const crooked: (() => Response)[] = [
      () => Response.json({ restore: 'device', parts: 1000 }),
      () => Response.json({ restore: 'device', parts: -1 }),
      () => Response.json({ restore: 'device', parts: 1.5 }),
      () => Response.json({ restore: 'device', parts: '3' }),
      () => Response.json({ restore: 'device' }),
      () => Response.json({ restore: 'server' }),
      () => Response.json({}),
      () => Response.json(null),
      () => new Response('<!doctype html>', { status: 200 }), // o index.html do vite preview, sem o Worker
      () => new Response(null, { status: 200 }),
    ];
    for (const res of crooked) {
      await expect(createSyncApi(async () => res()).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({ kind: 'server', status: 200 });
    }
  });

  it('copyPart baixa o objeto da parte com a conta daqui; 404 e os limites chegam como ApiError', async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const bytes = await gzipJson({ a: 1 });
    const api = createSyncApi(async (url, init) => {
      seen.push({ url, init });
      if (url.includes('/parts/9')) return Response.json({ error: 'not-found' }, { status: 404 });
      if (url.includes('/parts/8')) return Response.json({ error: 'restore-limit' }, { status: 429 });
      return new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } });
    });
    const got = await api.copyPart('2026-10-14T21-03-00Z-antes', 2, 'conta-1');
    expect(new Uint8Array(got)).toEqual(new Uint8Array(bytes));
    expect(seen[0].url).toBe('/api/snapshots/2026-10-14T21-03-00Z-antes/parts/2');
    expect(seen[0].init?.method ?? 'GET').toBe('GET');
    expect(seen[0].init).toMatchObject({ credentials: 'same-origin', headers: { 'x-klick-account': 'conta-1' } });
    expect(seen[0].init?.signal).toBeInstanceOf(AbortSignal);
    await expect(api.copyPart('d', 9, 'conta-1')).rejects.toMatchObject({ kind: 'client', status: 404 });
    await expect(api.copyPart('d', 8, 'conta-1')).rejects.toMatchObject({ status: 429, code: 'restore-limit' });
  });

  it('a cópia sem parts (um Worker de antes das partes) vale 0; parts torto tira a cópia da lista', async () => {
    const copies = [
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3 },
      { name: '2026-10-16', day: '2026-10-16', kind: 'daily', solves: 4, parts: 3 },
      { name: '2026-10-17', day: '2026-10-17', kind: 'daily', solves: 5, parts: '3' },
      { name: '2026-10-18', day: '2026-10-18', kind: 'daily', solves: 5, parts: -1 },
    ];
    const api = createSyncApi(async () => Response.json({ copies }));
    expect((await api.cloudCopies('conta-1')).copies).toEqual([
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3, parts: 0 },
      { name: '2026-10-16', day: '2026-10-16', kind: 'daily', solves: 4, parts: 3 },
    ]);
  });

  it('uma lista fora da forma (o index.html sem o Worker) é erro do servidor', async () => {
    await expect(createSyncApi(async () => new Response('<!doctype html>', { status: 200 })).cloudCopies('conta-1')).rejects.toMatchObject({ kind: 'server' });
    await expect(createSyncApi(async () => Response.json({ copies: 'nada' })).cloudCopies('conta-1')).rejects.toMatchObject({ kind: 'server' });
  });

  it('a lista traz a pausa das cópias; uma pausa torta vale null', async () => {
    const copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3, parts: 0 }];
    const list = (paused: unknown) => createSyncApi(async () => Response.json({ copies, paused })).cloudCopies('conta-1');
    expect(await list('space')).toEqual({ copies, paused: 'space' });
    expect(await list('ops')).toEqual({ copies, paused: 'ops' });
    expect(await list('size')).toEqual({ copies, paused: 'size' });
    expect(await list(null)).toEqual({ copies, paused: null });
    expect(await list('cheio')).toEqual({ copies, paused: null });
    expect(await list(undefined)).toEqual({ copies, paused: null });
  });

  it('o código do erro chega no ApiError; um corpo que não é JSON dá code null', async () => {
    const failing = (res: () => Response) => createSyncApi(async () => res());
    await expect(failing(() => Response.json({ error: 'no-room' }, { status: 409 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({
      kind: 'client',
      status: 409,
      code: 'no-room',
    });
    await expect(failing(() => Response.json({ error: 'r2-budget' }, { status: 503 })).cloudCopies('conta-1')).rejects.toMatchObject({
      kind: 'server',
      status: 503,
      code: 'r2-budget',
    });
    await expect(failing(() => Response.json({ code: 'write-budget' }, { status: 429 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({
      status: 429,
      code: 'write-budget',
    });
    await expect(failing(() => Response.json({ error: 'auth' }, { status: 401 })).deleteAccount(EMAIL, 'conta-1')).rejects.toMatchObject({
      kind: 'auth',
      code: 'auth',
    });
    // Um corpo que não é JSON (o proxy no meio), vazio, ou JSON sem código: code null, e o tipo de sempre.
    await expect(failing(() => new Response('<!doctype html>', { status: 502 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({
      kind: 'server',
      status: 502,
      code: null,
    });
    await expect(failing(() => new Response(null, { status: 404 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({
      kind: 'client',
      status: 404,
      code: null,
    });
    await expect(failing(() => Response.json({ error: 7 }, { status: 400 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({ code: null });
    await expect(failing(() => Response.json([1, 2], { status: 400 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({ code: null });
    await expect(failing(() => Response.json(null, { status: 400 })).restoreCloudCopy('d', 'conta-1')).rejects.toMatchObject({ code: null });
    // Sem rede: nem há corpo.
    await expect(
      createSyncApi(async () => {
        throw new TypeError('Failed to fetch');
      }).restoreCloudCopy('d', 'conta-1'),
    ).rejects.toMatchObject({ kind: 'offline', status: 0, code: null });
    expect(new ApiError('server', 500).code).toBeNull();
  });
});
