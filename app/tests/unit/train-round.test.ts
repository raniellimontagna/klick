import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';
import SetView from '../../src/ui/trilha/SetView.svelte';
import TrainRound from '../../src/ui/trilha/TrainRound.svelte';

// A figura do caso não carrega o cubing.js nos testes.
vi.mock('../../src/ui/trilha/cube-view', () => ({ drawFigure: vi.fn(async () => {}), mountCube: async () => null }));

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`tr-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  a.tab = 'trilha';
  return { a, repo };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const key = (type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body) => {
  const ev = new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true });
  target.dispatchEvent(ev);
  return ev;
};
// Uma execução pelo teclado: segura o espaço além do tempo de armar, solta (corre) e para com outra tecla.
async function solve(stop: [string, string] = ['KeyA', 'a']): Promise<void> {
  key('keydown', 'Space', ' ');
  await sleep(320);
  key('keyup', 'Space', ' ');
  await sleep(20);
  key('keydown', stop[0], stop[1]);
}
const round = (a: AppState) => render(TrainRound, { app: a, set: 'oll2', rng: () => 0 });

describe('conjunto do treino (spec 7.1 e 7.4)', () => {
  it('lista do mais fraco ao mais firme, com nível e números; Começar abre a rodada', async () => {
    const { a } = await app();
    for (let i = 0; i < 2; i++) await a.addPractice({ caseId: 'oll2-sune', ms: 3000, ok: true, helped: false, at: 1000 + i });
    await a.addPractice({ caseId: 'oll2-h', ms: 5000, ok: false, helped: false, at: 3000 });
    render(SetView, { app: a, set: 'oll2' });
    const order = [...document.querySelectorAll('[data-case]')].map((li) => li.getAttribute('data-case'));
    expect(order.slice(-2)).toEqual(['oll2-h', 'oll2-sune']); // os novos primeiro; o H (nível 0) antes do Sune (nível 2)
    const sune = document.querySelector('[data-case="oll2-sune"]') as HTMLElement;
    expect(sune).toHaveTextContent('firme');
    expect(sune).toHaveTextContent('2 tentativas · 100% de acerto · média 0:03.00');
    expect(screen.getByText('1 de 10 firmes')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Começar' }));
    expect(a.trailView).toEqual({ kind: 'round', set: 'oll2' });
  });

  it('tirar casos do sorteio grava; com todos fora, o treino não começa', async () => {
    const { a, repo } = await app();
    render(SetView, { app: a, set: 'pll2' });
    for (const name of ['T-perm', 'Y-perm', 'Ua', 'Ub', 'H-perm', 'Z-perm']) {
      await fireEvent.click(screen.getByRole('checkbox', { name: `${name} no sorteio` }));
      await waitFor(() => expect(a.profile.trainOff.length).toBeGreaterThan(0));
    }
    await waitFor(async () => expect((await repo.getProfile()).trainOff).toHaveLength(6));
    expect(screen.getByRole('button', { name: 'Começar' })).toBeDisabled();
    expect(screen.getByText(T.trilha.set.noneIncluded)).toBeInTheDocument();
  });

  it('tocar no caso mostra como reconhecer e deixa trocar o algoritmo', async () => {
    const { a, repo } = await app();
    render(SetView, { app: a, set: 'oll2' });
    await fireEvent.click(screen.getByRole('button', { name: 'H' }));
    expect(screen.getByText(/os amarelos dos cantos olham aos pares/)).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    await fireEvent.click(radios[1]);
    await waitFor(async () => expect((await repo.getProfile()).algChoice).toEqual({ 'oll2-h': 1 }));
  });

  it('se a gravação falha, a caixa e o algoritmo voltam ao que está salvo (spec 9.4)', async () => {
    const { a, repo } = await app();
    render(SetView, { app: a, set: 'oll2' });
    repo.saveProfile = async () => {
      throw new Error('quota');
    };
    const box = screen.getByRole('checkbox', { name: 'Sune no sorteio' }) as HTMLInputElement;
    await fireEvent.click(box);
    await waitFor(() => expect(a.toast?.text).toBe(T.data.changeFailed));
    await waitFor(() => expect(box.checked).toBe(true));
    await fireEvent.click(screen.getByRole('button', { name: 'H' }));
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    await fireEvent.click(radios[1]);
    await waitFor(() => expect(radios[0].checked).toBe(true));
    expect(radios[1].checked).toBe(false);
  });
});

describe('rodada do treino (spec 7.2)', () => {
  it('pelo teclado: monta o caso novo, mede, Enter marca acerto e o próximo caso vem', async () => {
    const { a, repo } = await app();
    round(a);
    expect(screen.getByText("F U R U' R' F'")).toBeInTheDocument(); // o inverso do algoritmo da Linha, sem giro de cima (sorteio 0)
    await solve();
    await screen.findByRole('button', { name: 'Acertei' });
    key('keydown', 'Enter', 'Enter');
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    const [p] = await repo.listPractice();
    expect(p).toMatchObject({ caseId: 'oll2-linha', ok: true, helped: false });
    expect(p.ms).toBeGreaterThanOrEqual(0);
    expect(await screen.findByText("f U R U' R' f'")).toBeInTheDocument(); // o L: o próximo novo, na ordem da aula
    const last = document.querySelector('[data-last-attempt]') as HTMLElement;
    expect(last).toHaveTextContent('Linha');
    expect(last).toHaveTextContent("F R U R' U' F'");
    expect(last).toHaveTextContent('acerto');
    expect(last).toHaveTextContent('média do caso');
  });

  it('"Errei" grava o erro; a ajuda marca a tentativa como com ajuda', async () => {
    const { a, repo } = await app();
    round(a);
    await fireEvent.click(screen.getByRole('button', { name: 'Ver o algoritmo' }));
    expect(document.querySelector('[data-help-alg]')).toHaveTextContent("F R U R' U' F'");
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Errei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect((await repo.listPractice())[0]).toMatchObject({ caseId: 'oll2-linha', ok: false, helped: true });
  });

  it('Enter num botão focado é do botão: "Errei" focado grava só o erro', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    const miss = await screen.findByRole('button', { name: 'Errei' });
    miss.focus();
    key('keydown', 'Enter', 'Enter', miss);
    await fireEvent.click(miss); // o clique que o navegador faria com o Enter no botão
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect((await repo.listPractice())[0].ok).toBe(false);
  });

  it('corrigir a última: trocar acerto e erro, ou apagar; vale até a próxima rodada começar', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Era erro' }));
    await waitFor(async () => expect((await repo.listPractice())[0].ok).toBe(false));
    await fireEvent.click(await screen.findByRole('button', { name: 'Era acerto' }));
    await waitFor(async () => expect((await repo.listPractice())[0].ok).toBe(true));
    await solve(); // a próxima rodada começou (e terminou): a anterior não se corrige mais
    await screen.findByRole('button', { name: 'Acertei' });
    expect(screen.queryByRole('button', { name: 'Era erro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apagar' })).toBeNull();
  });

  it('apagar a última tira do treino e do cartão', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await fireEvent.click(await screen.findByRole('button', { name: 'Apagar' }));
    await waitFor(() => expect(document.querySelector('[data-last-attempt]')).toBeNull());
    expect(await repo.listPractice()).toEqual([]);
  });

  it('o treino não vira solve: nada em solves, sessões, temporada; o body e o app voltam ao que eram ao sair', async () => {
    const { a, repo } = await app();
    document.body.dataset.tstate = 'idle';
    const season = JSON.stringify(a.seasonStatus());
    const r = round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect(a.solves).toEqual([]);
    expect(await repo.listSolves()).toEqual([]);
    expect(JSON.stringify(a.seasonStatus())).toBe(season);
    key('keydown', 'Space', ' ');
    await sleep(50);
    expect(a.timerBusy).toBe(true);
    r.unmount();
    expect(a.timerBusy).toBe(false);
    expect(a.trainerRunning).toBe(false);
    expect(document.body.dataset.tstate).toBe('idle');
    expect(document.body.classList.contains('solving')).toBe(false);
  });

  it('a tentativa que não grava: o aviso de sempre e o resultado continua para marcar', async () => {
    const { a, repo } = await app();
    repo.addPractice = async () => {
      throw new Error('quota');
    };
    round(a);
    await solve();
    await fireEvent.click(await screen.findByRole('button', { name: 'Acertei' }));
    await waitFor(() => expect(a.toast?.text).toBe(T.data.changeFailed));
    expect(screen.getByRole('button', { name: 'Acertei' })).not.toBeDisabled();
    expect(document.querySelector('[data-last-attempt]')).toBeNull();
  });

  it('com todos os casos fora do sorteio, a rodada diz isso e não arma', async () => {
    const { a } = await app();
    for (const id of ['pll2-t', 'pll2-y', 'pll2-ua', 'pll2-ub', 'pll2-h', 'pll2-z']) await a.setCaseOff(id, true);
    render(TrainRound, { app: a, set: 'pll2', rng: () => 0 });
    expect(screen.getByText(T.trilha.round.empty)).toBeInTheDocument();
    key('keydown', 'Space', ' ');
    await sleep(50);
    expect(a.timerBusy).toBe(false);
  });

  it('a tecla que para o treino não troca de aba nem abre os atalhos (a tela do Timer também ouve o teclado)', async () => {
    const { a, repo } = await app();
    render(TimerScreen, { app: a });
    round(a);
    await solve(['Digit1', '1']);
    await screen.findByRole('button', { name: 'Acertei' });
    expect(a.tab).toBe('trilha');
    await fireEvent.click(screen.getByRole('button', { name: 'Acertei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    await solve(['Slash', '?']);
    await screen.findByRole('button', { name: 'Acertei' });
    expect(a.dialog).toBeNull();
  });
});
