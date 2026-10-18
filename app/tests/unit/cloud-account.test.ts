import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RestoreRefusal, SyncRequest, SyncResponse } from '../../src/core/sync/types';
import { openKlickDb } from '../../src/data/db';
import { type ChangeKind, createRepository, defaultSyncState } from '../../src/data/repository';
import { T } from '../../src/strings';
import { ApiError, createSyncApi } from '../../src/sync/api';
import type { LocksLike } from '../../src/sync/triggers';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { CONFIRM_DELAY_MS } from '../../src/ui/confirm';
import { appWithAccount, bus, fakeApi } from './sync-account';
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
      { name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 1234 },
      { name: '2026-10-14T21-03-00Z-antes', day: '2026-10-14', kind: 'pre-restore', solves: 1200 },
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
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 5 }];
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
    net.cloud.copies = [{ name: '2026-09-10', day: '2026-09-10', kind: 'daily', solves: 10 }];
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
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3 }];
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
    expect(await repo.getSyncState()).toEqual(state);
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
    net.cloud.copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3 }];
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

// C1: as rotas da conta levam a conta deste aparelho (meta.sync.accountId), para o Worker recusar a sessão de outra conta.
describe('a conta deste aparelho nas rotas da conta (C1)', () => {
  it('listar, restaurar e apagar a conta mandam a conta daqui; fora de qualquer conta, nada sai', async () => {
    const net = fakeApi(new FakeServer());
    const sent: string[] = [];
    net.api.cloudCopies = async (account) => {
      sent.push(`copies:${account}`);
      return { copies: [], paused: null };
    };
    net.api.restoreCloudCopy = async (name, account) => void sent.push(`restore:${name}:${account}`);
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
    const copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3 }];
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

  it('uma lista fora da forma (o index.html sem o Worker) é erro do servidor', async () => {
    await expect(createSyncApi(async () => new Response('<!doctype html>', { status: 200 })).cloudCopies('conta-1')).rejects.toMatchObject({ kind: 'server' });
    await expect(createSyncApi(async () => Response.json({ copies: 'nada' })).cloudCopies('conta-1')).rejects.toMatchObject({ kind: 'server' });
  });

  it('a lista traz a pausa das cópias; uma pausa torta vale null', async () => {
    const copies = [{ name: '2026-10-15', day: '2026-10-15', kind: 'daily', solves: 3 }];
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
