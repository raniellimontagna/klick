import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import AjustesScreen from '../../src/ui/ajustes/AjustesScreen.svelte';
import { appWithAccount, fakeApi, fakeAuth } from './sync-account';
import { FakeServer } from './sync-fakes';

describe('Ajustes: "Conta e sync" (spec 9.1)', () => {
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

  it('sair de todos os aparelhos pede o segundo clique', async () => {
    const { auth, calls } = fakeAuth();
    const { app } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, auth });
    render(AjustesScreen, { app });
    const button = await screen.findByRole('button', { name: 'Sair de todos os aparelhos' });
    await fireEvent.click(button);
    expect(calls).not.toContain('sign-out-everywhere');
    await fireEvent.click(screen.getByRole('button', { name: 'Tem certeza? Clique de novo' }));
    await vi.waitFor(() => expect(calls).toContain('sign-out-everywhere'));
    await vi.waitFor(() => expect(app.account!.signedIn).toBe(false));
  });
});
