import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
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
