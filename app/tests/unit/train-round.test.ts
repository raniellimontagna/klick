import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { formatMs } from '../../src/core/stats';
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

// Toque: o mesmo que o navegador manda nas zonas (o soltar é ouvido na janela, como no Timer).
const pointer = (type: 'pointerdown' | 'pointerup', target: EventTarget, id: number, primary = true) =>
  target.dispatchEvent(new PointerEvent(type, { pointerId: id, bubbles: true, cancelable: true, pointerType: 'touch', isPrimary: primary }));
const zone = (side: 'left' | 'right') => document.querySelector(`[data-zone="${side}"]`);
// Dois polegares: segura as duas zonas além do tempo de armar e solta (corre). Sem as zonas na tela, não há o que tocar.
async function thumbs(): Promise<void> {
  const left = zone('left');
  const right = zone('right');
  if (!left || !right) return;
  pointer('pointerdown', left, 1);
  pointer('pointerdown', right, 2, false);
  await sleep(320);
  pointer('pointerup', window, 1);
  pointer('pointerup', window, 2);
  await sleep(30);
}
const shownTime = () => document.querySelector('[data-time]')?.textContent;

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
    // Sai no meio de uma execução (o timer rodando): é aí que trainerRunning e o solving ficam acesos e precisam ser desfeitos.
    key('keydown', 'Space', ' ');
    await sleep(320);
    key('keyup', 'Space', ' ');
    await waitFor(() => expect(a.trainerRunning).toBe(true));
    expect(a.timerBusy).toBe(true);
    expect(document.body.dataset.tstate).toBe('running');
    expect(document.body.classList.contains('solving')).toBe(true);
    r.unmount();
    expect(a.timerBusy).toBe(false);
    expect(a.trainerRunning).toBe(false);
    expect(document.body.dataset.tstate).toBe('idle');
    expect(document.body.classList.contains('solving')).toBe(false);
  });

  it('ao sair, a rodada devolve o AudioContext que abriu (o iOS limita quantos a página abre)', async () => {
    const opened: Array<{ closed: boolean }> = [];
    class FakeCtx {
      state = 'running';
      closed = false;
      constructor() {
        opened.push(this);
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        this.closed = true;
        return Promise.resolve();
      }
    }
    Object.assign(window, { AudioContext: FakeCtx });
    try {
      const { a } = await app();
      const r = round(a);
      key('keydown', 'Space', ' '); // o primeiro gesto acorda o som e abre o contexto
      await sleep(20);
      expect(opened).toHaveLength(1);
      expect(opened[0].closed).toBe(false);
      r.unmount();
      expect(opened[0].closed).toBe(true);
    } finally {
      Reflect.deleteProperty(window, 'AudioContext');
    }
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

// O toque só arma na montagem do caso: com o resultado na tela (ou sem caso), as zonas não armam o timer por cima dele.
describe('toque na rodada (spec 7.2: o espaço e os polegares só armam na montagem do caso)', () => {
  it('dois polegares na montagem armam e medem; um toque para e leva à marcação', async () => {
    const { a } = await app();
    round(a);
    await thumbs();
    expect(a.trainerRunning).toBe(true);
    pointer('pointerdown', zone('left')!, 3);
    pointer('pointerup', window, 3);
    await screen.findByRole('button', { name: 'Acertei' });
    expect(a.trainerRunning).toBe(false);
  });

  it('na marcação, dois polegares não armam de novo e o resultado continua para marcar', async () => {
    const { a, repo } = await app();
    round(a);
    await solve();
    await screen.findByRole('button', { name: 'Acertei' });
    await sleep(50); // o tempo do resultado é pintado no quadro seguinte
    const shown = shownTime();
    expect(shown).not.toBe('');
    expect(document.querySelector('[data-zones]')).toBeNull(); // as zonas só existem enquanto o caso pode ser armado
    await thumbs();
    expect(a.timerBusy).toBe(false);
    expect(a.trainerRunning).toBe(false);
    expect(document.body.dataset.tstate).toBe('done');
    expect(shownTime()).toBe(shown);
    expect(screen.getByRole('button', { name: 'Acertei' })).not.toBeDisabled();
    await fireEvent.click(screen.getByRole('button', { name: 'Acertei' }));
    await waitFor(async () => expect(await repo.listPractice()).toHaveLength(1));
    expect(formatMs((await repo.listPractice())[0].ms)).toBe(shown);
  });

  it('modo de um toque: tocar na tela na marcação não arma', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query === '(pointer: coarse)',
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      const { a } = await app();
      await a.updateSettings({ mobileArm: 'one' });
      round(a);
      await solve();
      await screen.findByRole('button', { name: 'Acertei' });
      const screenEl = document.querySelector('[data-round]')!;
      pointer('pointerdown', screenEl, 1);
      await sleep(320);
      pointer('pointerup', window, 1);
      await sleep(30);
      expect(a.timerBusy).toBe(false);
      expect(a.trainerRunning).toBe(false);
      expect(screen.getByRole('button', { name: 'Acertei' })).not.toBeDisabled();
    } finally {
      window.matchMedia = original;
    }
  });

  it('com todos os casos fora do sorteio, o toque não arma um timer que ninguém marca', async () => {
    const { a } = await app();
    for (const id of ['pll2-t', 'pll2-y', 'pll2-ua', 'pll2-ub', 'pll2-h', 'pll2-z']) await a.setCaseOff(id, true);
    render(TrainRound, { app: a, set: 'pll2', rng: () => 0 });
    expect(document.querySelector('[data-zones]')).toBeNull();
    await thumbs();
    expect(a.timerBusy).toBe(false);
    expect(a.trainerRunning).toBe(false);
  });
});
