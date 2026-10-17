import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { idleStatus } from '../../src/sync/engine';
import { T } from '../../src/strings';
import SyncIndicator from '../../src/ui/SyncIndicator.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';
import { appWithAccount, fakeApi } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('indicador do sync na barra de cima (spec 9.3)', () => {
  it('sem conta, não aparece', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api);
    render(SyncIndicator, { app });
    expect(document.querySelector('.sync-ind')).toBeNull();
  });

  it('com conta: os quatro estados no data-sync e no rótulo; não gira com o timer ocupado; o toque leva a Ajustes', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: 'Conta e sync: Sincronizado agora' });
    expect(button).toHaveAttribute('data-sync', 'synced');
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'syncing'));
    app.timerBusy = true;
    await vi.waitFor(() => expect(button).toHaveAttribute('data-quiet', 'true'));
    app.account!.status = { ...idleStatus(), phase: 'offline', pending: 4 };
    await vi.waitFor(() => expect(button).toHaveAccessibleName('Conta e sync: 4 mudanças esperando rede'));
    expect(button).toHaveAttribute('data-sync', 'waiting');
    app.account!.status = { ...idleStatus(), phase: 'error', error: 'auth' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'error'));
    await fireEvent.click(button);
    expect(app.tab).toBe('ajustes');
  });

  it('não é uma região aria-live: o anúncio da falha fica só no AccountState (amendment 2)', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: /^Conta e sync: / });
    app.account!.status = { ...idleStatus(), phase: 'error', error: 'server' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'error'));
    expect(button).not.toHaveAttribute('aria-live');
    expect(button).not.toHaveAttribute('role');
    expect(document.querySelector('.sync-ind [aria-live], .sync-ind [role="status"]')).toBeNull();
  });
});

describe('a nuvem com o cubinho como selo (spec 6)', () => {
  afterEach(() => vi.useRealTimers());

  it('a nuvem só em contorno com o cubinho como selo: 9 peças, a do centro vermelha no erro', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: /^Conta e sync: / });
    const svg = button.querySelector('svg')!;
    expect(svg.querySelectorAll('mask')).toHaveLength(1);
    expect(svg.querySelector('path[fill="none"]')).not.toBeNull(); // só o contorno: nada pintado dentro da nuvem
    const pieces = svg.querySelectorAll('g[data-badge] [data-badge-piece]');
    expect(pieces).toHaveLength(9);
    expect(svg.querySelector('[data-center]')).toBeNull(); // fora do erro, nenhuma peça é vermelha
    app.account!.status = { ...idleStatus(), phase: 'error', error: 'server' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'error'));
    expect(pieces[4]).toHaveAttribute('data-center');
    expect(svg.querySelectorAll('[data-center]')).toHaveLength(1);
  });

  it('o recorte do selo é da máscara (o nuvem passa por ela), com id próprio por indicador', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const svg = (await screen.findByRole('button', { name: /^Conta e sync: / })).querySelector('svg')!;
    const mask = svg.querySelector('mask')!;
    expect(mask.id).not.toBe('');
    expect(svg.querySelector(`g[mask="url(#${mask.id})"]`)).not.toBeNull();
  });

  it('sincronizando → sincronizado: um pulinho, uma vez', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: /^Conta e sync: / });
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'syncing'));
    expect(button).not.toHaveAttribute('data-just-synced');
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await tick();
    expect(button).toHaveAttribute('data-sync', 'synced');
    expect(button).toHaveAttribute('data-just-synced', 'true');
    await vi.advanceTimersByTimeAsync(700);
    await tick();
    expect(button).not.toHaveAttribute('data-just-synced');
  });

  it('o pulinho só vem de "sincronizando", e não com o timer ocupado', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: /^Conta e sync: / });
    app.account!.status = { ...idleStatus(), phase: 'offline', pending: 1 };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'waiting'));
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'synced'));
    expect(button).not.toHaveAttribute('data-just-synced'); // veio de "esperando rede", não de "sincronizando"
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'syncing'));
    app.timerBusy = true;
    await vi.waitFor(() => expect(button).toHaveAttribute('data-quiet', 'true'));
    app.account!.status = { ...idleStatus(), phase: 'idle', lastSyncAt: Date.now() };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'synced'));
    expect(button).not.toHaveAttribute('data-just-synced');
  });

  it('com o timer ocupado, nada gira: o selo só ganha o giro com data-quiet="false"', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.status.phase).toBe('idle'));
    render(SyncIndicator, { app });
    const button = await screen.findByRole('button', { name: /^Conta e sync: / });
    const badge = button.querySelector('g[data-badge]')!;
    expect(badge).not.toHaveClass('spin');
    app.account!.status = { ...idleStatus(), phase: 'syncing' };
    await vi.waitFor(() => expect(button).toHaveAttribute('data-sync', 'syncing'));
    expect(button).toHaveAttribute('data-quiet', 'false');
    expect(badge).toHaveClass('spin');
    app.timerBusy = true;
    await vi.waitFor(() => expect(button).toHaveAttribute('data-quiet', 'true'));
    expect(badge).not.toHaveClass('spin');
  });
});

describe('o convite no lembrete de exportar (spec 9.4)', () => {
  it('com a conta ligada e sem conta, o lembrete oferece "Proteger na nuvem", que abre o diálogo de entrar', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api);
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    app.exportReminder = true;
    render(TimerScreen, { app });
    await fireEvent.click(await screen.findByRole('button', { name: 'Proteger na nuvem' }));
    expect(app.dialog).toBe('signin');
  });

  it('com a conta desligada no ambiente, o lembrete é o de sempre', async () => {
    const { app } = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    app.exportReminder = true;
    render(TimerScreen, { app });
    await screen.findByRole('button', { name: T.reminder.later });
    expect(screen.queryByRole('button', { name: 'Proteger na nuvem' })).toBeNull();
  });

  it('entrar na conta pelo convite tira o lembrete da tela, e sem conta no ambiente ele fica como era (spec 9.4)', async () => {
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api);
    await vi.waitFor(() => expect(app.account!.available).toBe(true));
    app.exportReminder = true;
    const { container } = render(TimerScreen, { app });
    await screen.findByRole('button', { name: 'Proteger na nuvem' });
    expect(container.querySelector('[data-export-reminder]')).not.toBeNull();
    await repo.saveSyncState({ accountId: 'conta-1', email: 'ranielli@exemplo.com', signedIn: true }); // o primeiro login terminou
    await app.account!.refresh();
    await vi.waitFor(() => expect(container.querySelector('[data-export-reminder]')).toBeNull());
    const off = await appWithAccount(fakeApi(new FakeServer(), { accounts: false, turnstileSiteKey: null }).api);
    off.app.exportReminder = true;
    const other = render(TimerScreen, { app: off.app });
    await other.findByRole('button', { name: T.reminder.later });
    expect(other.container.querySelector('[data-export-reminder]')).not.toBeNull();
  });

  it('quem tem conta não vê mais o lembrete de exportar', async () => {
    const { app, repo } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true });
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(true));
    await repo.saveMeta({ solvesSinceExport: 99 });
    await app.reload();
    await app.addSolve({ ms: 9000, penalty: null, at: Date.now() }); // o 100º desde a última exportação
    await vi.waitFor(async () => expect((await repo.getMeta()).solvesSinceExport).toBe(100));
    await new Promise((r) => setTimeout(r, 50));
    expect(app.exportReminder).toBe(false);
  });
});
