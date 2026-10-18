import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { idleStatus } from '../../src/sync/engine';
import { T } from '../../src/strings';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { CONFIRM_DELAY_MS, confirmReady } from '../../src/ui/confirm';
import { appWithAccount, fakeApi, fakeAuth } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('Ajustes: "Conta e sync" (spec 9.1)', () => {
  afterEach(() => vi.useRealTimers());

  it('com a conta desligada no ambiente, a seção não aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    render(AjustesScreen, { app });
    await screen.findByText('Ajustes');
    expect(screen.queryByText('Conta e sync')).toBeNull();
  });

  it('sem conta: a frase e "Entrar ou criar conta", que abre o diálogo; é a primeira seção da lista', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api);
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    render(AjustesScreen, { app });
    expect(await screen.findByText('Guarde seus solves na nuvem e use em outros aparelhos.')).toBeInTheDocument();
    expect(document.querySelector('.settings > fieldset')?.getAttribute('data-slot')).toBe('conta');
    await fireEvent.click(screen.getByRole('button', { name: 'Entrar ou criar conta' }));
    expect(app.dialog).toBe('signin');
  });

  it('com conta: o e-mail, a situação, "Sincronizar agora", passkeys e sair', async () => {
    const { auth } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    expect(await screen.findByText('ranielli@exemplo.com')).toBeInTheDocument();
    expect(document.querySelector('[data-sync-line]')?.textContent).toBe('Sincronizado agora');
    const sync = vi.spyOn(app.account!, 'syncNow');
    await fireEvent.click(screen.getByRole('button', { name: 'Sincronizar agora' }));
    expect(sync).toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Criar passkey' }));
    expect(await screen.findByRole('button', { name: /^Remover a passkey criada em/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: /^Sair$/ }));
    expect(app.dialog).toBe('signout');
  });

  it('sair deixa os dados no aparelho; apagar só sem mudanças esperando (spec 7.7)', async () => {
    const { auth, calls } = fakeAuth();
    const server = new FakeServer();
    const net = fakeApi(server);
    const { app, repo } = await appWithAccount(net.api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: /^Sair$/ }));
    await fireEvent.click(document.querySelector('[data-erase]')!);
    await fireEvent.click(screen.getAllByRole('button', { name: /^Sair$/ }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent('ainda não');
    expect(await repo.listSolves()).toHaveLength(1);
    await fireEvent.click(document.querySelector('[data-erase]')!); // desmarca: só sair
    await fireEvent.click(screen.getAllByRole('button', { name: /^Sair$/ }).at(-1)!);
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    expect(calls).toContain('sign-out');
    expect(await repo.listSolves()).toHaveLength(1);
    expect((await repo.getSyncState()).accountId).toBe('conta-1'); // fica, para a spec 7.6
  });

  // A revisão final (I4): o que o servidor recusaria só existe aqui; apagar os dados deste aparelho o perderia.
  it('apagar com registros que só existem aqui recusa, com o porquê e a contagem; nada sai (I4)', async () => {
    const db = await openKlickDb('secao-so-aqui');
    const repo = createRepository(db, { channel: null });
    const { auth, calls } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth, repo });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    const solve = await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await app.account!.syncNow();
    await db.put('solves', { ...(await db.get('solves', solve!.id))!, id: 'de antes da v3' }); // ficou fora da fila no primeiro login
    render(AjustesScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: /^Sair$/ }));
    await fireEvent.click(document.querySelector('[data-erase]')!);
    await fireEvent.click(screen.getAllByRole('button', { name: /^Sair$/ }).at(-1)!);
    expect(await screen.findByRole('alert')).toHaveTextContent(T.conta.localOnlyBlock(1));
    expect(calls).not.toContain('sign-out');
    expect(await repo.listSolves()).toHaveLength(2);
    expect(app.account!.signedIn).toBe(true);
  });

  // Spec 9.6: o botão que abriu o diálogo some quando a seção troca para sem conta. O foco não pode cair no <body>: vai para "Entrar ou criar
  // conta", o primeiro controle da seção.
  it('depois de sair, o foco fica em "Entrar ou criar conta", não no <body> (spec 9.6)', async () => {
    const { auth } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    const opener = await screen.findByRole('button', { name: /^Sair$/ });
    opener.focus();
    await fireEvent.click(opener);
    await fireEvent.click(screen.getAllByRole('button', { name: /^Sair$/ }).at(-1)!);
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entrar ou criar conta' })));
  });

  it('depois de apagar a conta, o foco fica em "Entrar ou criar conta", não no <body> (spec 9.6)', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    const opener = await screen.findByRole('button', { name: 'Apagar minha conta' });
    opener.focus();
    await fireEvent.click(opener);
    await fireEvent.input(await screen.findByLabelText('Para confirmar, digite ranielli@exemplo.com'), { target: { value: 'ranielli@exemplo.com' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Apagar para sempre' }));
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
    await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entrar ou criar conta' })));
  });

  it('sair de todos os aparelhos pede o segundo clique', async () => {
    const { auth, calls } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    render(AjustesScreen, { app });
    const button = await screen.findByRole('button', { name: 'Sair de todos os aparelhos' });
    vi.useFakeTimers({ toFake: ['Date'] }); // só o relógio: o segundo clique só vale depois de CONFIRM_DELAY_MS
    await fireEvent.click(button);
    expect(calls).not.toContain('sign-out-everywhere');
    vi.setSystemTime(Date.now() + CONFIRM_DELAY_MS);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(calls).toContain('sign-out-everywhere'));
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
  });

  it('o segundo clique em "Sair de todos os aparelhos" antes de 400 ms não confirma', async () => {
    const { auth, calls } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    render(AjustesScreen, { app });
    const button = await screen.findByRole('button', { name: 'Sair de todos os aparelhos' });
    vi.useFakeTimers({ toFake: ['Date'] });
    await fireEvent.click(button);
    vi.setSystemTime(Date.now() + CONFIRM_DELAY_MS - 1);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' })); // o clique duplo
    await new Promise((r) => setTimeout(r, 50)); // a saída espera o motor parar: dá tempo de ela chegar ao cliente, se houver
    expect(calls).not.toContain('sign-out-everywhere');
    expect(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' })).toBeInTheDocument(); // continua armado
    vi.setSystemTime(Date.now() + 1);
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(calls).toContain('sign-out-everywhere'));
  });

  it('CONFIRM_DELAY_MS é 400', () => {
    expect(CONFIRM_DELAY_MS).toBe(400);
    expect(confirmReady(null, 10_000)).toBe(false);
    expect(confirmReady(1000, 1399)).toBe(false);
    expect(confirmReady(1000, 1400)).toBe(true);
  });
});

// A cota e as cópias pausadas em Ajustes (endurecimento 4.1 e 4.2, decisões 1 e 4).
describe('Ajustes: o que só está neste aparelho e as cópias pausadas', () => {
  const activeSolves = (server: FakeServer) => [...server.active().values()].filter((c) => c.store === 'solves');

  it('com registros só neste aparelho, Ajustes mostra quantos e "Enviar de novo" os põe na fila', async () => {
    const limits = { solves: 1, sessions: 10, practice: 10 };
    const server = new FakeServer(500, { limits });
    const { app, repo } = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    for (let i = 0; i < 3; i++) await app.addSolve({ ms: 9000 + i, penalty: null, at: Date.now() + i });
    await app.account!.syncNow();
    expect(await repo.heldCount()).toBe(2);
    render(AjustesScreen, { app });
    const row = (await screen.findByText(T.conta.heldCount(2))).closest('.setting')!;
    expect(row).toHaveTextContent(T.conta.quotaFull);
    expect(T.conta.heldCount(2)).toBe('2 registros só neste aparelho');
    expect(T.conta.heldCount(1)).toBe('1 registro só neste aparelho');
    expect(T.conta.heldCount(12_000)).toBe('12.000 registros só neste aparelho');
    // A linha dos guardados vem logo abaixo da do sync, e só ela explica o limite: a linha do sync não repete a frase.
    expect(app.account!.status.notice).toBe('quota');
    expect(row.previousElementSibling?.querySelector('[data-sync-line]')).not.toBeNull();
    expect(document.querySelector('[data-sync-line]')).toHaveTextContent('Sincronizado agora');
    expect(screen.getAllByText(T.conta.quotaFull)).toHaveLength(1);
    // O botão diz o que envia, como o "Remover" das passkeys.
    const resend = screen.getByRole('button', { name: 'Enviar de novo os 2 registros só neste aparelho' });
    expect(resend).toHaveTextContent('Enviar de novo');
    expect(T.conta.heldResendAria(1)).toBe('Enviar de novo o registro só neste aparelho');
    // A conta ganhou vaga: "Enviar de novo" põe os dois na fila, e a rodada sai sozinha (como em "Sincronizar agora").
    limits.solves = 10;
    await fireEvent.click(resend);
    await vi.waitFor(() => expect(app.toast?.text).toBe(T.conta.heldResent));
    await vi.waitFor(() => expect(activeSolves(server)).toHaveLength(3));
    expect(await repo.heldCount()).toBe(0);
    expect(await repo.outboxCount()).toBe(0);
    await vi.waitFor(() => expect(screen.queryByText(/registros? só neste aparelho/)).toBeNull());
    expect(screen.queryByRole('button', { name: /^Enviar de novo/ })).toBeNull();
    expect(document.querySelector('[data-sync-line]')).toHaveTextContent('Sincronizado agora');
  });

  // Spec 9.6: o botão some com a linha (a refresh de resendHeld zera a contagem) enquanto tem o foco. O foco não cai no <body>: vai para a
  // linha do sync (focável só pelo script, tabindex -1), que diz o que aconteceu. Não para o primeiro botão da seção: com o sync rodando,
  // "Sincronizar agora" está desligado, e ele seria "Criar passkey", onde um Enter abriria o pedido do WebAuthn (revisão final, Minor 3).
  it('depois de "Enviar de novo", a linha some e o foco fica na linha do sync, não no <body> nem num botão (spec 9.6)', async () => {
    const limits = { solves: 1, sessions: 10, practice: 10 };
    const server = new FakeServer(500, { limits });
    const { app } = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    for (let i = 0; i < 2; i++) await app.addSolve({ ms: 9000 + i, penalty: null, at: Date.now() + i });
    await app.account!.syncNow();
    render(AjustesScreen, { app });
    const resend = await screen.findByRole('button', { name: 'Enviar de novo o registro só neste aparelho' });
    limits.solves = 10;
    resend.focus();
    await fireEvent.click(resend);
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^Enviar de novo/ })).toBeNull());
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await vi.waitFor(() => {
      const active = document.activeElement;
      expect(active).not.toBe(document.body);
      expect(active).toBe(document.querySelector('[data-sync-row]'));
      expect(active?.getAttribute('tabindex')).toBe('-1');
      expect(active?.querySelector('[data-sync-line]')).not.toBeNull();
    });
  });

  // Cota e orçamento na mesma rodada: o aviso é o do orçamento (o resto da fila só é explicado ali), e a cota aparece pela linha dos guardados.
  it('cota e orçamento na mesma rodada: a linha do sync diz que o resto sobe amanhã, e os guardados aparecem mesmo assim', async () => {
    const server = new FakeServer(500, { limits: { solves: 1, sessions: 10, practice: 10 }, budget: 3 });
    server.now = Date.now();
    const { app, repo } = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    for (let i = 0; i < 4; i++) await app.addSolve({ ms: 9000 + i, penalty: null, at: Date.now() + i });
    await app.account!.syncNow();
    expect(app.account!.status.notice).toBe('budget');
    const held = await repo.heldCount();
    expect(held).toBeGreaterThan(0);
    render(AjustesScreen, { app });
    expect(await screen.findByText(T.conta.heldCount(held))).toBeInTheDocument();
    expect(document.querySelector('[data-sync-line]')).toHaveTextContent(T.conta.budgetDeferred);
  });

  it('sem nenhum, a linha não aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() });
    await app.account!.syncNow();
    render(AjustesScreen, { app });
    await screen.findByText('ranielli@exemplo.com');
    expect(app.account!.held).toBe(0);
    expect(screen.queryByText(/registros? só neste aparelho/)).toBeNull();
    expect(screen.queryByRole('button', { name: /^Enviar de novo/ })).toBeNull();
  });

  it('com as cópias pausadas, a dica diz por quê', async () => {
    const server = new FakeServer();
    const { app } = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    const hint = () => screen.getByText(T.conta.cloud).closest('.setting')!.querySelector('small');
    await vi.waitFor(() => expect(hint()).toHaveTextContent(T.conta.cloudHint));
    server.copiesPaused = 'space';
    await app.account!.syncNow();
    await vi.waitFor(() => expect(hint()).toHaveTextContent('Cópias na nuvem pausadas: o espaço gratuito encheu.'));
    server.copiesPaused = 'ops';
    await app.account!.syncNow();
    await vi.waitFor(() => expect(hint()).toHaveTextContent('Cópias na nuvem pausadas até o mês que vem: o limite gratuito do mês acabou.'));
    server.copiesPaused = null;
    await app.account!.syncNow();
    await vi.waitFor(() => expect(hint()).toHaveTextContent(T.conta.cloudHint));
  });

  // Task 12: acima de SNAPSHOT_MAX_RECORDS registros (worker/limits.ts), a cópia do dia não sai e o sync diz 'size'.
  it('Ajustes diz que a conta passou do tamanho', async () => {
    const server = new FakeServer();
    const { app } = await appWithAccount(fakeApi(server).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    const hint = () => screen.getByText(T.conta.cloud).closest('.setting')!.querySelector('small');
    await vi.waitFor(() => expect(hint()).toHaveTextContent(T.conta.cloudHint));
    server.copiesPaused = 'size';
    await app.account!.syncNow();
    await vi.waitFor(() => expect(hint()).toHaveTextContent('Cópias na nuvem pausadas: a conta passou do tamanho que o plano gratuito copia.'));
    expect(T.conta.cloudPaused('size')).toBe('Cópias na nuvem pausadas: a conta passou do tamanho que o plano gratuito copia.');
  });
});

// "Sincronizar agora" com o cubinho (spec visual 7 e decisão 9): o cubo gira enquanto sincroniza; a linha só fica verde depois do toque da pessoa.
describe('Ajustes: "Sincronizar agora" com o cubo vivo', () => {
  afterEach(() => vi.useRealTimers());

  async function opened() {
    const { auth } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(AjustesScreen, { app });
    await screen.findByText('ranielli@exemplo.com');
    // Os estados abaixo são postos à mão: o toque não roda de verdade, para o teste mandar na fase.
    vi.spyOn(app.account!, 'syncNow').mockResolvedValue(undefined);
    const button = screen.getByRole('button', { name: 'Sincronizar agora' });
    const line = document.querySelector('[data-sync-line]')!;
    return { app, button, line };
  }

  it('o botão com o cubinho: gira enquanto sincroniza, e o toque que termina bem deixa a linha verde por um instante', async () => {
    const { app, button, line } = await opened();
    expect(button.querySelector('[data-cube="idle"]')).not.toBeNull();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await fireEvent.click(button);
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    expect(button.querySelector('[data-cube="turn"]')).not.toBeNull();
    expect(button).toBeDisabled();
    expect(line).not.toHaveAttribute('data-fresh');
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(line).toHaveTextContent('Sincronizado agora');
    expect(line).toHaveAttribute('data-fresh', 'true');
    expect(button.querySelector('[data-cube="wave"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1300);
    expect(line).not.toHaveAttribute('data-fresh');
    expect(button.querySelector('[data-cube="idle"]')).not.toBeNull();
  });

  it('um novo toque, ainda no verde do anterior, tira o verde: a linha não fica verde dizendo "Sincronizando…"', async () => {
    const { app, button, line } = await opened();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await fireEvent.click(button);
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(line).toHaveAttribute('data-fresh', 'true');
    await fireEvent.click(button);
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    expect(line).toHaveTextContent('Sincronizando');
    expect(line).not.toHaveAttribute('data-fresh');
    // o timer do toque antigo não apaga nem acende nada depois
    await vi.advanceTimersByTimeAsync(1300);
    expect(line).not.toHaveAttribute('data-fresh');
  });

  it('um sync automático com Ajustes aberto não pisca', async () => {
    const { app, button, line } = await opened();
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    expect(button.querySelector('[data-cube="turn"]')).not.toBeNull();
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(line).not.toHaveAttribute('data-fresh');
    expect(button.querySelector('[data-cube="wave"]')).toBeNull();
    expect(button.querySelector('[data-cube="idle"]')).not.toBeNull();
  });

  it('um toque que termina em erro não deixa o verde; o toque seguinte, que termina bem, deixa', async () => {
    const { app, button, line } = await opened();
    await fireEvent.click(button);
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    app.account!.status = { ...idleStatus(), phase: 'error', error: 'server' };
    await tick();
    expect(line).not.toHaveAttribute('data-fresh');
    // um sync automático que se recupera depois do erro também não pisca: o toque já foi gasto
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(line).not.toHaveAttribute('data-fresh');
    await fireEvent.click(button);
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(line).toHaveAttribute('data-fresh', 'true');
  });

  // A cota e o orçamento não são sucesso: a linha diz o aviso, sem o verde nem a onda.
  it('um toque que termina com um aviso (a cota, o orçamento) não fica verde nem toca a onda', async () => {
    const { app, button, line } = await opened();
    for (const notice of ['quota', 'budget'] as const) {
      await fireEvent.click(button);
      app.account!.status = { ...idleStatus(), phase: 'syncing' };
      await tick();
      app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now(), notice };
      await tick();
      expect(line).toHaveTextContent(notice === 'quota' ? T.conta.quotaFull : T.conta.budgetDeferred);
      expect(line).not.toHaveAttribute('data-fresh');
      expect(button.querySelector('[data-cube="wave"]')).toBeNull();
      expect(button.querySelector('[data-cube="idle"]')).not.toBeNull();
    }
    // O toque seguinte, que termina sem aviso, fica verde como sempre.
    await fireEvent.click(button);
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await tick();
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(line).toHaveAttribute('data-fresh', 'true');
  });

  it('erro: o cubinho em erro', async () => {
    const { app, button } = await opened();
    app.account!.status = { ...idleStatus(), phase: 'error', error: 'server' };
    await tick();
    expect(button.querySelector('[data-cube="error"]')).not.toBeNull();
  });

  it('o verde passageiro não anuncia nada: a linha não é região de aviso', async () => {
    const { line } = await opened();
    expect(line.closest('[aria-live]')).toBeNull();
    expect(line).not.toHaveAttribute('aria-live');
    expect(line).not.toHaveAttribute('role');
  });
});
