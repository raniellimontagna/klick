import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { AppState } from '../../src/ui/state/app.svelte';
import SessionsDialog from '../../src/ui/dialogs/SessionsDialog.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`sd-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return { a, repo };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let opener: HTMLButtonElement | null = null;
afterEach(() => {
  opener?.remove();
  opener = null;
});

describe('diálogo de sessões', () => {
  it('a sessão atual aparece marcada e escolher outra troca a atual', async () => {
    const { a } = await app();
    await a.createSession('333', 'Treino');
    render(SessionsDialog, { app: a, open: true });
    const atual = await screen.findByRole('button', { name: /^Treino/ });
    expect(atual).toHaveAttribute('aria-current', 'true');
    await fireEvent.click(screen.getByRole('button', { name: /^Sessão 1/ }));
    await vi.waitFor(() => expect(a.currentSession?.name).toBe('Sessão 1'), { timeout: 3000 });
    expect(screen.getByRole('button', { name: /^Sessão 1/ })).toHaveAttribute('aria-current', 'true');
  });

  it('criar com nome usa o nome dado e o evento escolhido', async () => {
    const { a } = await app();
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.change(await screen.findByLabelText('Evento da nova sessão'), { target: { value: 'clock' } });
    await fireEvent.input(screen.getByLabelText('Nome da nova sessão'), { target: { value: 'Relógio de manhã' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await vi.waitFor(() => expect(a.currentSession?.name).toBe('Relógio de manhã'), { timeout: 3000 });
    expect(a.event).toBe('clock');
    expect(screen.getByRole('heading', { level: 3, name: 'Clock' })).toBeInTheDocument();
  });

  it('Enter no nome da nova sessão cria a sessão, como o botão Criar', async () => {
    const { a } = await app();
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.change(await screen.findByLabelText('Evento da nova sessão'), { target: { value: 'clock' } });
    const nome = screen.getByLabelText('Nome da nova sessão');
    await fireEvent.input(nome, { target: { value: 'Pela tecla' } });
    await fireEvent.keyDown(nome, { key: 'Enter' });
    await vi.waitFor(() => expect(a.currentSession?.name).toBe('Pela tecla'), { timeout: 3000 });
    expect(a.event).toBe('clock');
  });

  it('o Enter que confirma uma composição de texto (IME) não cria a sessão; o Enter seguinte cria', async () => {
    const { a } = await app();
    render(SessionsDialog, { app: a, open: true });
    const nome = screen.getByLabelText('Nome da nova sessão');
    await fireEvent.input(nome, { target: { value: 'Acentuação' } });
    await fireEvent.keyDown(nome, { key: 'Enter', isComposing: true });
    await sleep(30);
    expect(a.sessions.map((x) => x.name)).not.toContain('Acentuação');
    await fireEvent.keyDown(nome, { key: 'Enter' });
    await vi.waitFor(() => expect(a.sessions.map((x) => x.name)).toContain('Acentuação'), { timeout: 3000 });
  });

  it('renomear troca o nome gravado', async () => {
    const { a, repo } = await app();
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: /^Renomear/ }));
    const campo = (await screen.findByRole('textbox', { name: /Novo nome/ })) as HTMLInputElement;
    await fireEvent.input(campo, { target: { value: 'Noturna' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await vi.waitFor(async () => expect((await repo.listSessions()).map((s) => s.name)).toEqual(['Noturna']), { timeout: 3000 });
    expect(await screen.findByRole('button', { name: /^Noturna/ })).toBeInTheDocument();
  });

  it('excluir manda a sessão para a lixeira', async () => {
    const { a, repo } = await app();
    await a.createSession('333', 'Descartável');
    const id = a.currentSession!.id;
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: /^Excluir Descartável/ }));
    await vi.waitFor(async () => expect((await repo.listTrash()).sessions.map((s) => s.id)).toContain(id), { timeout: 3000 });
    expect(screen.queryByRole('button', { name: /^Descartável/ })).toBeNull();
  });

  it('clicar no respiro não fecha; clicar no fundo fecha e libera app.dialog', async () => {
    const { a } = await app();
    a.dialog = 'sessions';
    render(SessionsDialog, { app: a, open: true });
    const d = document.querySelector('dialog') as HTMLDialogElement;
    d.getBoundingClientRect = () => ({ left: 100, right: 400, top: 100, bottom: 300, x: 100, y: 100, width: 300, height: 200, toJSON() {} }) as DOMRect;
    await fireEvent.click(d, { clientX: 150, clientY: 150 });
    expect(d).toHaveAttribute('open');
    await fireEvent.click(d, { clientX: 10, clientY: 10 });
    expect(d).not.toHaveAttribute('open');
    expect(a.dialog).toBeNull();
  });

  it('fechar devolve o foco ao botão que abriu', async () => {
    const { a } = await app();
    opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    a.dialog = 'sessions';
    render(SessionsDialog, { app: a, open: true });
    await fireEvent.click(await screen.findByRole('button', { name: 'Fechar' }));
    await sleep(0);
    expect(document.activeElement).toBe(opener);
  });
});
