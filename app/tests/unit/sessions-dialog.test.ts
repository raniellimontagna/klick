import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Solve } from '../../src/core/types';
import { T } from '../../src/strings';
import { appWithAccount, fakeApi } from './sync-account';
import { FakeServer } from './sync-fakes';
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
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: /^Descartável/ })).toBeNull());
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
  // Juntar com… (o histórico inteiro, maquete 6a/6b): abre na própria linha, escolhe a sessão do mesmo evento e confirma.
  describe('Juntar com…', () => {
    // Solves de mentira só na memória do AppState: o diálogo conta pelo app.solves, e criar milhares pelo repositório seria lento à toa.
    const fake = (sessionId: string, n: number): Solve[] =>
      Array.from({ length: n }, (_, i) => ({
        id: `${sessionId}-${i}`, sessionId, event: '333', ms: 10_000 + i, penalty: null, at: 1_700_000_000_000 + i,
        scramble: 'R U', note: '', createdAt: 1, updatedAt: 1, deletedAt: null,
      }));

    it('Juntar com… lista só as sessões do mesmo evento, nunca a própria; evento com uma sessão só não oferece', async () => {
      const { a } = await app();
      await a.createSession('333', 'Treino');
      await a.createSession('333', 'Antiga');
      await a.createSession('sq1', 'Sozinha');
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      const escolha = (await screen.findByRole('combobox', { name: /^Juntar “Antiga”/ })) as HTMLSelectElement;
      expect([...escolha.options].map((o) => o.textContent)).toEqual(['Sessão 1 · 0 solves', 'Treino · 0 solves']);
      // O Sq-1 tem uma sessão só: sem destino, sem o botão. As do 3×3 seguem com ele.
      expect(screen.queryByRole('button', { name: 'Juntar Sozinha com outra sessão' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Juntar Treino com outra sessão' })).toBeInTheDocument();
    });

    it('confirmar junta, manda a de origem para a lixeira, mostra o toast e leva o foco ao botão da de destino', async () => {
      const { a, repo } = await app();
      const main = a.currentSession!;
      await a.addSolve({ ms: 60_000, penalty: null, at: 1_700_000_000_000 });
      await a.createSession('333', 'Antiga');
      const old = a.currentSession!;
      await a.addSolve({ ms: 61_000, penalty: null, at: 1_700_000_000_001 });
      await a.addSolve({ ms: 62_000, penalty: null, at: 1_700_000_000_002 });
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      expect(await screen.findByText('Os 2 solves passam para “Sessão 1”, e “Antiga” vai para a lixeira.')).toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: T.historico.mergeConfirm('Antiga', 2, 'Sessão 1') }));
      await vi.waitFor(async () => expect((await repo.listTrash()).sessions.map((s) => s.id)).toContain(old.id), { timeout: 3000 });
      await vi.waitFor(() => expect(a.toast?.text).toBe(T.historico.merged(2, 'Sessão 1')), { timeout: 3000 });
      expect((await repo.listSolves({ sessionId: main.id })).length).toBe(3);
      expect(a.currentSession?.id).toBe(main.id); // a de origem era a atual: a de destino passou a ser
      await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Sessão 1/ })));
      expect(screen.queryByRole('button', { name: /^Antiga/ })).toBeNull();
    });

    it('Esc cancela a junção sem mexer em nada, e o foco volta ao botão Juntar com…; o diálogo segue aberto', async () => {
      const { a, repo } = await app();
      await a.createSession('333', 'Antiga');
      render(SessionsDialog, { app: a, open: true });
      const abrir = await screen.findByRole('button', { name: 'Juntar Antiga com outra sessão' });
      await fireEvent.click(abrir);
      const escolha = await screen.findByRole('combobox', { name: /^Juntar “Antiga”/ });
      await fireEvent.keyDown(escolha, { key: 'Escape' });
      await vi.waitFor(() => expect(screen.queryByRole('combobox', { name: /^Juntar “Antiga”/ })).toBeNull());
      expect(document.querySelector('dialog')).toHaveAttribute('open');
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      expect((await repo.listSessions()).map((s) => s.name)).toEqual(['Sessão 1', 'Antiga']);
      expect((await repo.listTrash()).sessions).toEqual([]);
      // O Cancelar faz o mesmo.
      await fireEvent.click(screen.getByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      await fireEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
      await vi.waitFor(() => expect(screen.queryByRole('combobox', { name: /^Juntar “Antiga”/ })).toBeNull());
      expect((await repo.listTrash()).sessions).toEqual([]);
      await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Juntar Antiga com outra sessão' })));
    });

    it('se a sessão escolhida sai com o passo aberto, o select cai noutra; se sai a última, o passo fecha', async () => {
      const { a } = await app();
      await a.createSession('333', 'A');
      const idA = a.currentSession!.id;
      await a.createSession('333', 'B');
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar B com outra sessão' }));
      const escolha = (await screen.findByRole('combobox', { name: /^Juntar “B”/ })) as HTMLSelectElement;
      await fireEvent.change(escolha, { target: { value: idA } });
      await screen.findByText('“B” não tem solves e vai para a lixeira.');
      expect(escolha.value).toBe(idA);
      // Outra aba apaga o destino escolhido: sobra "Sessão 1", e o select e a frase seguem ela.
      await a.deleteSession(idA);
      await vi.waitFor(() => expect([...escolha.options].map((o) => o.textContent)).toEqual(['Sessão 1 · 0 solves']));
      expect(escolha.value).toBe(a.sessions.find((s) => s.name === 'Sessão 1')!.id);
      // E apaga o último destino: o passo fecha sozinho, o botão Juntar com… some (B ficou sozinha no evento).
      await a.deleteSession(a.sessions.find((s) => s.name === 'Sessão 1')!.id);
      await vi.waitFor(() => expect(screen.queryByRole('combobox', { name: /^Juntar “B”/ })).toBeNull());
      expect(screen.queryByRole('button', { name: 'Juntar B com outra sessão' })).toBeNull();
    });

    it('dois toques rápidos em Juntar fazem uma junção só', async () => {
      const { a } = await app();
      await a.createSession('333', 'Antiga');
      const real = a.mergeSessions.bind(a);
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const spy = vi.spyOn(a, 'mergeSessions').mockImplementation(async (from, to) => {
        await gate;
        return real(from, to);
      });
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      const juntar = await screen.findByRole('button', { name: /^Juntar “Antiga”/ });
      void fireEvent.click(juntar);
      void fireEvent.click(juntar); // sem esperar o primeiro: o segundo chega antes de a tela desabilitar o botão
      await sleep(20);
      release();
      await vi.waitFor(() => expect(screen.queryByRole('combobox', { name: /^Juntar “Antiga”/ })).toBeNull(), { timeout: 3000 });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('se a junção lança, o passo continua aberto e o Juntar volta a funcionar', async () => {
      const { a, repo } = await app();
      await a.createSession('333', 'Antiga');
      const old = a.currentSession!;
      vi.spyOn(a, 'mergeSessions').mockRejectedValueOnce(new Error('falhou'));
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      const juntar = await screen.findByRole('button', { name: /^Juntar “Antiga”/ });
      await fireEvent.click(juntar);
      await vi.waitFor(() => expect(juntar).toBeEnabled());
      expect(screen.getByRole('combobox', { name: /^Juntar “Antiga”/ })).toBeInTheDocument();
      expect(a.toast?.text).toBe(T.data.changeFailed);
      expect((await repo.listTrash()).sessions).toEqual([]);
      // De novo, agora de verdade.
      await fireEvent.click(juntar);
      await vi.waitFor(async () => expect((await repo.listTrash()).sessions.map((s) => s.id)).toContain(old.id), { timeout: 3000 });
    });

    it('abrir Juntar com um Renomear aberto em outra linha fecha o Renomear, e o contrário também', async () => {
      const { a } = await app();
      await a.createSession('333', 'Treino');
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Renomear Sessão 1' }));
      expect(await screen.findByRole('textbox', { name: /Novo nome para Sessão 1/ })).toBeInTheDocument();
      await fireEvent.click(screen.getByRole('button', { name: 'Juntar Treino com outra sessão' }));
      expect(await screen.findByRole('combobox', { name: /^Juntar “Treino”/ })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: /Novo nome para/ })).toBeNull();
      // O contrário: com o Juntar aberto, Renomear em outra linha fecha o passo de juntar.
      await fireEvent.click(screen.getByRole('button', { name: 'Renomear Sessão 1' }));
      expect(await screen.findByRole('textbox', { name: /Novo nome para Sessão 1/ })).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /^Juntar “Treino”/ })).toBeNull();
    });

    it('com conta e mais de 4.000 solves, avisa que o resto sobe pelo sync; sem conta, ou com 4.000, não', async () => {
      const { app: a } = await appWithAccount(fakeApi(new FakeServer()).api, { signedIn: true, sessionFirst: true });
      await vi.waitFor(() => expect(a.account!.signedIn).toBe(true));
      const main = a.currentSession!;
      await a.createSession('333', 'Treino OH antigo');
      const old = a.currentSession!;
      a.solves = [...fake(old.id, 4001)];
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Treino OH antigo com outra sessão' }));
      expect(await screen.findByText(T.historico.mergeSlow)).toBeInTheDocument();
      expect(screen.getByText('Os 4.001 solves passam para “Sessão 1”, e “Treino OH antigo” vai para a lixeira.')).toBeInTheDocument();
      expect(main.name).toBe('Sessão 1');
      // Com exatamente 4.000, sem o aviso.
      await fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
      a.solves = [...fake(old.id, 4000)];
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Treino OH antigo com outra sessão' }));
      await screen.findByText(/^Os 4\.000 solves passam/);
      expect(screen.queryByText(T.historico.mergeSlow)).toBeNull();
    });

    it('sem conta, mesmo com mais de 4.000 solves, não avisa do sync', async () => {
      const { a } = await app();
      await a.createSession('333', 'Antiga');
      a.solves = fake(a.currentSession!.id, 5000);
      render(SessionsDialog, { app: a, open: true });
      await fireEvent.click(await screen.findByRole('button', { name: 'Juntar Antiga com outra sessão' }));
      await screen.findByText(/^Os 5\.000 solves passam/);
      expect(screen.queryByText(T.historico.mergeSlow)).toBeNull();
    });

    it('a contagem usa o ponto de milhar', async () => {
      const { a } = await app();
      const main = a.currentSession!;
      a.solves = fake(main.id, 10_482);
      render(SessionsDialog, { app: a, open: true });
      expect(await screen.findByText('10.482 solves')).toBeInTheDocument();
    });
  });
});
