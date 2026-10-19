import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeDuelLink, duelPayloadOf, encodeDuelLink } from '../../src/core/duel/link';
import type { DuelLink, DuelTime, EventId, Penalty } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { AppState } from '../../src/ui/state/app.svelte';

// A tela do desafio (a maquete aprovada, docs/design/2026-10-19-desafio-maquete.html): um modo do Timer, as folhas e as telas de fim. A
// casca monta com um estado pronto, como em app-dialogs.test.ts; o link é aberto direto por openLink (o #desafio= é da Task 7).
const hooks = vi.hoisted(() => ({ boot: null as null | (() => Promise<unknown>) }));
vi.mock('../../src/ui/state/boot', () => ({
  boot: async () => (hooks.boot ? hooks.boot() : new Promise<never>(() => {})),
}));

import App from '../../src/ui/App.svelte';

let dbn = 0;
const tm = (ms: number, penalty: Penalty = null): DuelTime => ({ ms, penalty });
const SCRAMBLES = Array.from({ length: 7 }, (_, i) => `R U R' U' F${i}`);
// Tempos de A fáceis de procurar no DOM: nenhum aparece antes de B ver o ponto.
const A_TIMES = [12_340, 13_450, 14_560, 15_670, 16_780, 17_890, 18_910].map((ms) => tm(ms));
const LINK: DuelLink = { v: 1, id: 'abcdefgh12345678', event: '333', scrambles: SCRAMBLES, a: { name: 'Ranielli', times: A_TIMES } };
const A_SHOWN = ['12.34', '13.45', '14.56', '15.67', '16.78', '17.89', '18.91'];

// Um aparelho com o app aberto: sem inspeção e sem tempo de armar (o solve pelo teclado fica síncrono), o tour já visto.
async function device(o: { onboarded?: boolean; name?: string } = {}) {
  const repo = createRepository(await openKlickDb(`dz-${++dbn}`), { channel: null });
  if (o.onboarded !== false) await repo.saveProfile({ onboarded: true });
  let k = 0;
  const a = new AppState({
    repo,
    queue: createScrambleQueue({ generate: async (ev) => `${ev} R U R'` }),
    storage: null,
    storageManager: null,
    duel: { generate: async (ev: EventId) => `${ev} D L${++k}` },
  });
  await a.init();
  await a.updateSettings({ inspection: false, holdMs: 0 });
  if (o.name) await a.setDuelName(o.name);
  return { a, repo };
}

async function mount(a: AppState) {
  hooks.boot = async () => a;
  const shell = render(App);
  await screen.findByRole('button', { name: 'Timer' });
  return shell;
}

function key(type: 'keydown' | 'keyup', code: string, k: string, target: EventTarget = document.body): void {
  target.dispatchEvent(new KeyboardEvent(type, { code, key: k, bubbles: true, cancelable: true }));
}

// Um solve pelo teclado de exatamente `ms`: o relógio do timer é o performance.now, segurado durante as teclas.
function solveIn(ms: number): void {
  const at = performance.now();
  const clock = vi.spyOn(performance, 'now').mockReturnValue(at);
  try {
    key('keydown', 'Space', ' ');
    key('keyup', 'Space', ' ');
    clock.mockReturnValue(at + ms);
    key('keydown', 'KeyA', 'a');
  } finally {
    clock.mockRestore();
  }
}

// O solve do desafio gravado: a tela já tem o resultado (o tempo e as ações).
async function solveDuel(a: AppState, ms: number): Promise<void> {
  const before = a.duel.current!.mine.length;
  solveIn(ms);
  await waitFor(() => expect(a.duel.current!.mine).toHaveLength(before + 1));
  await tick();
}

const timeText = (): string => document.querySelector('[data-screen="timer"] [data-time]')?.textContent ?? '';
const liveText = (): string => document.querySelector('[data-live]')?.textContent ?? '';
// Tudo o que o DOM mostra ou diz: o texto e os atributos (rótulos acessíveis inclusive). Os desenhos (SVG) ficam de fora: as coordenadas
// deles não são tempos.
// O texto vem também por textContent: o tempo grande e o do oponente partem os centésimos num <span>.
const everything = (): string => `${document.body.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '')}\n${document.body.textContent}`;
const litRing = (scope = '[data-centro-slot]'): number => document.querySelectorAll(`${scope} svg.centro .ring.lit`).length;

function stubShare(share: ((data: ShareData) => Promise<void>) | undefined, writeText?: (text: string) => Promise<void>): void {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true, writable: true });
  Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true, writable: true });
}

afterEach(() => {
  hooks.boot = null;
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>).share;
  delete (navigator as unknown as Record<string, unknown>).clipboard;
});

// B, com o desafio de LINK aceito, no primeiro embaralhamento.
async function acceptedB(o: { link?: DuelLink } = {}) {
  const b = await device();
  await mount(b.a);
  await b.a.duel.openLink(await encodeDuelLink(o.link ?? LINK));
  await fireEvent.click(await screen.findByRole('button', { name: T.duel.accept }));
  await waitFor(() => expect(b.a.duel.phase).toBe('solving'));
  await tick();
  return b;
}

describe('a tela do desafio (a maquete aprovada)', () => {
  it('como A: resolve os sete e manda o link', async () => {
    const { a, repo } = await device({ name: 'Ranielli' });
    await mount(a);
    // 1: "Desafiar" ao lado da pílula da sessão, que continua.
    const desafiar = screen.getByRole('button', { name: T.duel.challenge });
    expect(document.querySelector('[data-session-pill]')).not.toBeNull();
    await fireEvent.click(desafiar);
    // 2a: a folha, com o evento da sessão marcado.
    const sheet = await screen.findByRole('dialog', { name: T.duel.sheetTitle });
    expect(within(sheet).getByRole('combobox', { name: T.duel.eventLabel })).toHaveValue('333');
    expect(within(sheet).getAllByRole('option')).toHaveLength(13);
    expect(within(sheet).getByText(T.duel.outsideStats)).toBeInTheDocument();
    await fireEvent.click(within(sheet).getByRole('button', { name: T.duel.start }));
    await waitFor(() => expect(a.duel.phase).toBe('solving'));
    await tick();
    expect(sheet).not.toHaveAttribute('open');

    // 3: as duas pílulas viram a do modo; o embaralhamento da vez, "1 de 7"; sem os tiles de média.
    expect(screen.getByRole('button', { name: T.duel.pill('3×3') })).toBeInTheDocument();
    expect(document.querySelector('[data-session-pill]')).toBeNull();
    expect(screen.queryByRole('button', { name: T.duel.challenge })).toBeNull();
    expect(screen.getByText(T.duel.scramble(1))).toBeInTheDocument();
    expect(document.querySelector('[data-scramble]')).toHaveTextContent(a.duel.scramble);
    expect(document.querySelector('[data-tiles]')).toBeNull();
    expect(document.querySelector('[data-heat]')).toBeNull();
    expect(document.querySelector('.t-hints')).toHaveTextContent(T.duel.hints);

    for (let i = 0; i < 7; i++) {
      await solveDuel(a, 10_000 + i * 1000);
      if (i === 0) {
        // O primeiro: o tempo, o chip com o número, +2 e DNF sem Nota e sem Excluir; o embaralhamento já é o 2.
        await waitFor(() => expect(timeText()).toBe('0:10.00'));
        const chips = document.querySelector('[data-chips]')!;
        expect(chips).toHaveTextContent('1');
        expect(chips).toHaveTextContent('0:10.00');
        const actions = document.querySelector('[data-actions]')!;
        expect(actions).not.toHaveAttribute('hidden');
        expect(within(actions as HTMLElement).getByRole('button', { name: /\+2/ })).toBeInTheDocument();
        expect(within(actions as HTMLElement).queryByRole('button', { name: /Nota/ })).toBeNull();
        expect(within(actions as HTMLElement).queryByRole('button', { name: /Excluir/ })).toBeNull();
        expect(screen.getByText(T.duel.scramble(2))).toBeInTheDocument();
        // P vale para o último solve; ⌫ e N não fazem nada no desafio.
        const scramble = a.duel.scramble;
        key('keydown', 'KeyP', 'p');
        await waitFor(() => expect(a.duel.current!.mine[0]).toEqual(tm(10_000, '+2')));
        await waitFor(() => expect(timeText()).toBe('0:12.00+'));
        key('keydown', 'KeyP', 'p');
        await waitFor(() => expect(a.duel.current!.mine[0]).toEqual(tm(10_000)));
        key('keydown', 'Backspace', 'Backspace');
        key('keydown', 'KeyN', 'n');
        await tick();
        expect(a.duel.current!.mine).toHaveLength(1);
        expect(a.duel.scramble).toBe(scramble);
      }
    }

    // 4: os sete tempos, o nome dos Ajustes e "Mandar o desafio".
    await waitFor(() => expect(a.duel.phase).toBe('finished'));
    await tick();
    expect(screen.getByText(T.duel.readyLabel)).toBeInTheDocument();
    expect(screen.getByText(T.duel.readyCoach)).toBeInTheDocument();
    const times = document.querySelectorAll('[data-duel-times] li');
    expect([...times].map((li) => li.textContent?.trim())).toEqual(['10:10.00', '20:11.00', '30:12.00', '40:13.00', '50:14.00', '60:15.00', '70:16.00']);
    expect(screen.getByText(T.progress.best('0:10.00'))).toBeInTheDocument();
    const name = screen.getByRole('textbox', { name: T.duel.nameLabel });
    expect(name).toHaveValue('Ranielli');
    expect(name).toHaveAttribute('maxlength', '20');
    expect(screen.getByText('8/20')).toBeInTheDocument();
    // Os solves do desafio nunca vão para os solves.
    expect(a.solves).toEqual([]);
    expect(await repo.listSolves({ includeDeleted: true })).toEqual([]);

    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    await fireEvent.input(name, { target: { value: 'Rani' } });
    expect(screen.getByText('4/20')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.send }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = share.mock.calls[0]![0];
    expect(data.text).toBe('Rani te desafiou no Klick: 3×3, sete embaralhamentos, primeiro a 3 pontos.');
    const link = await decodeDuelLink(duelPayloadOf(new URL(data.url!).hash)!);
    expect(link).toMatchObject({ event: '333', a: { name: 'Rani', times: [10_000, 11_000, 12_000, 13_000, 14_000, 15_000, 16_000].map((ms) => tm(ms)) } });
    expect(a.profile.duelName).toBe('Rani');
    expect(a.duel.current).toMatchObject({ status: 'waiting' });
    expect(a.toast).toBeNull(); // a folha do sistema abriu: nada de aviso de cópia
  });

  it('como B: o tempo de A só aparece depois do solve e da penalidade', async () => {
    const b = await device();
    await mount(b.a);
    await b.a.duel.openLink(await encodeDuelLink(LINK));
    // 5: o convite, sem conta, sem os tempos de A em lugar nenhum.
    const invite = await screen.findByRole('dialog', { name: 'Ranielli te desafiou' });
    expect(within(invite).getByRole('heading', { name: 'Ranielli te desafiou' })).toBeInTheDocument();
    expect(within(invite).getByText(T.duel.noAccount)).toBeInTheDocument();
    expect(within(invite).getByText(T.duel.chipTarget)).toBeInTheDocument();
    for (const shown of A_SHOWN) expect(everything()).not.toContain(shown);
    await fireEvent.click(within(invite).getByRole('button', { name: T.duel.accept }));
    await waitFor(() => expect(b.a.duel.phase).toBe('solving'));
    await tick();
    expect(screen.getByRole('button', { name: T.duel.pill('3×3') })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Placar: Você 0, Ranielli 0\. 1: ainda não jogado;/ })).toBeInTheDocument();

    // 6a: parou; o tempo de B, +2 e DNF, "Ver o ponto". O de A, ainda nada (nem no placar, nem no leitor de tela).
    await solveDuel(b.a, 10_000);
    expect(b.a.duel.phase).toBe('confirm');
    await waitFor(() => expect(timeText()).toBe('0:10.00'));
    expect(screen.getByText(T.duel.scramble(1))).toBeInTheDocument();
    expect(screen.getByText(T.duel.checkPenalty)).toBeInTheDocument();
    for (const shown of A_SHOWN) expect(everything()).not.toContain(shown);
    // O Centro espera o ponto: o anel apagado.
    await waitFor(() => expect(litRing()).toBe(0));
    // +2 na confirmação vale (0:12.00 contra 0:12.34: ainda é de B).
    await fireEvent.click(within(document.querySelector('[data-actions]') as HTMLElement).getByRole('button', { name: /\+2/ }));
    await waitFor(() => expect(b.a.duel.current!.mine[0]).toEqual(tm(10_000, '+2')));
    await waitFor(() => expect(timeText()).toBe('0:12.00+'));
    for (const shown of A_SHOWN) expect(everything()).not.toContain(shown);

    // 6b: "Ver o ponto" revela o tempo de A daquele embaralhamento, o selo e o placar; o seguinte continua escondido.
    await fireEvent.click(screen.getByRole('button', { name: T.duel.seePoint }));
    await waitFor(() => expect(b.a.duel.phase).toBe('reveal'));
    await tick();
    const reveal = document.querySelector('[data-duel-reveal]') as HTMLElement;
    expect(reveal).toHaveTextContent(T.duel.pointMine);
    expect(reveal).toHaveTextContent('Ranielli');
    expect(reveal).toHaveTextContent('0:12.34');
    expect(reveal).toHaveTextContent('Você foi 0.34 s mais rápido');
    expect(everything()).toContain('0:12.34');
    for (const shown of A_SHOWN.slice(1)) expect(everything()).not.toContain(shown);
    expect(screen.getByRole('img', { name: /^Placar: Você 1, Ranielli 0\. 1: ponto seu; 2: ainda não jogado;/ })).toBeInTheDocument();
    expect(document.querySelector('[data-actions]')).toHaveAttribute('hidden');
    expect(screen.getByText(T.duel.scramble(2))).toBeInTheDocument(); // a nota do próximo
    // O ponto de B: o Centro com 6 verdes, depois do meio segundo da reação de sempre.
    await waitFor(() => expect(litRing()).toBe(6), { timeout: 2000 });
    await fireEvent.click(screen.getByRole('button', { name: T.duel.next }));
    expect(b.a.duel.phase).toBe('solving');
    await tick();
    expect(document.querySelector('[data-scramble]')).toHaveTextContent(SCRAMBLES[1]!);
    expect(b.a.solves).toEqual([]);
  });

  it('o placar mostra os pontos e o fim da partida com o vencedor', async () => {
    const b = await acceptedB();
    // B leva o 1 e o 3, A o 2 (B com DNF), e B fecha no 4: Você 3 × 1.
    for (const [ms, penalty] of [
      [10_000, null],
      [10_000, 'DNF'],
      [10_000, null],
      [10_000, null],
    ] as const) {
      await solveDuel(b.a, ms);
      if (penalty) {
        key('keydown', 'KeyD', 'd');
        await waitFor(() => expect(b.a.duel.current!.mine.at(-1)!.penalty).toBe('DNF'));
      }
      await fireEvent.click(screen.getByRole('button', { name: T.duel.seePoint }));
      await waitFor(() => expect(b.a.duel.phase).toBe('reveal'));
      await tick();
      if (penalty) {
        // O ponto do oponente: o selo claro e o Centro em 3 âmbar.
        const seal = document.querySelector('[data-duel-reveal] .dz-verdict')!;
        expect(seal).toHaveTextContent(T.duel.pointTheirs('Ranielli'));
        expect(seal).toHaveClass('op');
      }
      await fireEvent.click(screen.getByRole('button', { name: T.duel.next }));
    }
    await waitFor(() => expect(b.a.duel.phase).toBe('finished'));
    await tick();
    // 7: o resultado, o placar com o 5, o 6 e o 7 tracejados, e a partida ponto a ponto.
    expect(screen.getByRole('heading', { name: 'Você venceu 3 × 1' })).toBeInTheDocument();
    expect(screen.getByText('Contra Ranielli · 3×3 · fechou no embaralhamento 4')).toBeInTheDocument();
    const board = screen.getByRole('img', { name: /^Placar: Você 3, Ranielli 1\./ });
    expect(board.getAttribute('aria-label')).toBe(
      'Placar: Você 3, Ranielli 1. 1: ponto seu; 2: ponto de Ranielli; 3: ponto seu; 4: ponto seu; 5: não jogado; 6: não jogado; 7: não jogado.',
    );
    expect(board.querySelectorAll('[data-p="skip"]')).toHaveLength(6);
    expect(board.querySelectorAll('[data-p="won"]')).toHaveLength(4);
    const rows = [...document.querySelectorAll('.dz-match tbody tr')].map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent));
    expect(rows).toEqual([
      ['1', '0:10.00', '0:12.34', 'seu'],
      ['2', 'DNF', '0:13.45', 'Ranielli'],
      ['3', '0:10.00', '0:14.56', 'seu'],
      ['4', '0:10.00', '0:15.67', 'seu'],
      ['5–7', T.duel.notPlayed(3)],
    ]);
    expect(document.querySelector('.dz-match tbody tr td.w')).toHaveTextContent('0:10.00');
    expect(screen.getByRole('button', { name: T.duel.sendReply })).toBeInTheDocument();
    expect(screen.getByText(T.duel.replyNote('Ranielli'))).toBeInTheDocument();
    // A pílula do modo segue; o Timer de sempre, não.
    expect(document.querySelector('[data-screen="timer"]')).toHaveAttribute('hidden');
    expect(screen.getByRole('button', { name: T.duel.pill('3×3') })).toBeInTheDocument();

    // "Desafiar de volta": a folha "Desafiar" de novo, no evento da partida.
    await fireEvent.click(screen.getByRole('button', { name: T.duel.rematch }));
    expect(b.a.duel.phase).toBe('picking');
    expect(await screen.findByRole('dialog', { name: T.duel.sheetTitle })).toHaveAttribute('open');
  });

  it('sem Web Share, copia o link e avisa', async () => {
    const b = await acceptedB();
    for (let i = 0; i < 3; i++) {
      await solveDuel(b.a, 10_000);
      await fireEvent.click(screen.getByRole('button', { name: T.duel.seePoint }));
      await waitFor(() => expect(b.a.duel.phase).toBe('reveal'));
      await fireEvent.click(await screen.findByRole('button', { name: T.duel.next }));
    }
    await waitFor(() => expect(b.a.duel.phase).toBe('finished'));
    const writeText = vi.fn(async (_text: string) => {});
    stubShare(undefined, writeText);
    await fireEvent.input(await screen.findByRole('textbox', { name: T.duel.nameLabel }), { target: { value: 'Bia' } });
    await fireEvent.click(screen.getByRole('button', { name: T.duel.sendReply }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const link = await decodeDuelLink(duelPayloadOf(new URL(writeText.mock.calls[0]![0]).hash)!);
    expect(link).toMatchObject({ id: LINK.id, b: { name: 'Bia', times: [tm(10_000), tm(10_000), tm(10_000)] } });
    await waitFor(() => expect(b.a.toast?.text).toBe(T.duel.copied));
    expect(document.querySelector('.toast')).toHaveTextContent(T.duel.copied);
  });

  it('sem gravar, o link não sai: o aviso honesto e nada compartilhado', async () => {
    const { a, repo } = await device();
    await mount(a);
    await a.duel.start('333');
    for (let i = 0; i < 7; i++) await a.duel.record(tm(10_000 + i));
    await waitFor(() => expect(screen.getByRole('button', { name: T.duel.send })).toBeInTheDocument());
    const share = vi.fn(async (_data: ShareData) => {});
    stubShare(share);
    repo.saveDuel = async () => {
      throw new Error('quota');
    };
    await fireEvent.click(screen.getByRole('button', { name: T.duel.send }));
    await waitFor(() => expect(a.toast?.text).toBe(T.duel.linkFailed));
    expect(share).not.toHaveBeenCalled();
    expect(a.duel.current).toMatchObject({ status: 'playing' });
  });

  it('link torto mostra o aviso e nada mais', async () => {
    const { a, repo } = await device();
    await mount(a);
    await a.duel.openLink('lixo!');
    const alert = await screen.findByRole('alertdialog', { name: T.duel.invalidTitle });
    expect(within(alert).getByRole('heading', { name: T.duel.invalidTitle })).toBeInTheDocument();
    expect(within(alert).getByText(T.duel.invalidNothing)).toBeInTheDocument();
    expect(alert.querySelector('.live-cube')).toHaveAttribute('data-cube', 'error');
    // O Timer de sempre por baixo: a pílula da sessão e o "Desafiar".
    expect(document.querySelector('[data-session-pill]')).not.toBeNull();
    await fireEvent.click(within(alert).getByRole('button', { name: T.duel.close }));
    expect(a.duel.phase).toBe('idle');
    await tick();
    expect(alert).not.toHaveAttribute('open');
    expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    expect(screen.getByRole('button', { name: T.duel.challenge })).toBeInTheDocument();
  });

  it('teclado e leitor de tela: o placar e a revelação são anunciados', async () => {
    const b = await acceptedB();
    // A folha de aceitar fechou: o foco vai para o Timer.
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-screen="timer"]')));
    await solveDuel(b.a, 10_000);
    // Na confirmação, o espaço não arma: B confere a penalidade e vê o ponto antes do próximo.
    key('keydown', 'Space', ' ');
    key('keyup', 'Space', ' ');
    await tick();
    expect(document.body.dataset.tstate).toBe('done');
    // D e P valem na confirmação.
    key('keydown', 'KeyD', 'd');
    await waitFor(() => expect(b.a.duel.current!.mine[0]!.penalty).toBe('DNF'));
    key('keydown', 'KeyD', 'd');
    await waitFor(() => expect(b.a.duel.current!.mine[0]!.penalty).toBe(null));
    const see = screen.getByRole('button', { name: T.duel.seePoint });
    see.focus();
    await fireEvent.click(see);
    await waitFor(() => expect(b.a.duel.phase).toBe('reveal'));
    // O botão sumiu com o clique: o foco vai para "Próximo".
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: T.duel.next })));
    await waitFor(() => expect(liveText()).toBe('Ranielli: 0:12.34. Ponto seu. Você 1, Ranielli 0.'));
    // O placar se lê por extenso (role="img").
    expect(screen.getByRole('img', { name: /^Placar: Você 1, Ranielli 0\. 1: ponto seu;/ })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.next }));
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-screen="timer"]')));
  });

  it('um tempo de A com +2: a revelação e o anúncio dizem "com +2"', async () => {
    const c = await acceptedB({ link: { ...LINK, a: { name: 'Ranielli', times: [tm(13_510, '+2'), ...A_TIMES.slice(1)] } } });
    await solveDuel(c.a, 14_880);
    await fireEvent.click(screen.getByRole('button', { name: T.duel.seePoint }));
    await waitFor(() => expect(liveText()).toBe('Ranielli: 0:15.51 com +2. Ponto seu. Você 1, Ranielli 0.'));
    const reveal = document.querySelector('[data-duel-reveal]')!;
    expect(reveal.querySelector('.dz-vs')).toHaveTextContent('Ranielli0:15.51+');
    expect(reveal).toHaveTextContent('0:13.51 com +2 · você foi 0.63 s mais rápido');
  });
});

describe('a barra do topo e a pílula do modo', () => {
  it('Desafiar só aparece no Timer parado; some fora da aba e durante o solve', async () => {
    const { a } = await device();
    await mount(a);
    const meta = document.querySelector('.topbar .meta')!;
    const pills = () => [...meta.querySelectorAll('button.pill')].map((b) => b.textContent?.trim());
    expect(pills()).toEqual([T.duel.challenge, T.session.pill('3×3', a.activeSession!.name)]);
    screen.getAllByRole('button', { name: 'Evolução' })[0]!.click();
    await tick();
    expect(screen.queryByRole('button', { name: T.duel.challenge })).toBeNull();
    screen.getAllByRole('button', { name: 'Timer' })[0]!.click();
    await tick();
    expect(screen.getByRole('button', { name: T.duel.challenge })).toBeInTheDocument();
    key('keydown', 'Space', ' '); // armado (pronto, sem tempo de armar): o timer está ocupado
    await tick();
    expect(screen.queryByRole('button', { name: T.duel.challenge })).toBeNull();
    key('keyup', 'Space', ' ');
    key('keydown', 'KeyA', 'a');
    await waitFor(() => expect(a.solves).toHaveLength(1)); // sem desafio, o solve é um solve
    await tick();
    expect(screen.getByRole('button', { name: T.duel.challenge })).toBeInTheDocument();
  });

  it('a pílula do modo: continuar, pausar e descartar com o segundo toque; para B, sem descartar', async () => {
    const { a, repo } = await device();
    await mount(a);
    await a.duel.start('pyram');
    await solveDuel(a, 5_000);
    const id = a.duel.current!.id;
    await fireEvent.click(screen.getByRole('button', { name: T.duel.pill('Pyraminx') }));
    const menu = await screen.findByRole('dialog', { name: T.duel.menuLabel });
    expect(within(menu).getByRole('heading', { name: T.duel.menuTitle('Pyraminx') })).toBeInTheDocument();
    expect(within(menu).getByText(T.duel.menuText(2))).toBeInTheDocument();
    // Continuar fecha a folha e fica no desafio.
    await fireEvent.click(within(menu).getByRole('button', { name: T.duel.keepGoing }));
    expect(menu).not.toHaveAttribute('open');
    expect(a.duel.phase).toBe('solving');
    // Pausar volta ao Timer de sempre; o desafio fica guardado, jogando.
    await fireEvent.click(screen.getByRole('button', { name: T.duel.pill('Pyraminx') }));
    await fireEvent.click(within(menu).getByRole('button', { name: T.duel.pause }));
    expect(a.duel.phase).toBe('idle');
    await tick();
    expect(document.querySelector('[data-session-pill]')).not.toBeNull();
    expect(document.querySelector('[data-tiles]')).not.toBeNull();
    expect(await repo.getDuel(id)).toMatchObject({ status: 'playing', mine: [tm(5_000)] });
    // Descartar pede o segundo toque.
    await a.duel.resume(id);
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.pill('Pyraminx') }));
    const discard = within(menu).getByRole('button', { name: T.duel.discard });
    await fireEvent.click(discard);
    expect(discard).toHaveTextContent(T.duel.confirmAgain);
    expect(a.duel.phase).toBe('solving');
    await new Promise((resolve) => setTimeout(resolve, 450));
    await fireEvent.click(discard);
    await waitFor(() => expect(a.duel.phase).toBe('idle'));
    expect((await repo.getDuel(id))!.deletedAt).not.toBeNull();
  });

  it('para B, a pílula do modo não descarta: o desafio aceito vai até o fim', async () => {
    const b = await acceptedB();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.pill('3×3') }));
    const menu = await screen.findByRole('dialog', { name: T.duel.menuLabel });
    expect(within(menu).getByRole('button', { name: T.duel.keepGoing })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: T.duel.pause })).toBeInTheDocument();
    expect(within(menu).queryByRole('button', { name: T.duel.discard })).toBeNull();
    expect(b.a.duel.phase).toBe('solving');
  });

  it('gerando os sete: o cubo vivo girando; a falha avisa e deixa tentar de novo', async () => {
    const repo = createRepository(await openKlickDb(`dz-${++dbn}`), { channel: null });
    await repo.saveProfile({ onboarded: true });
    let release!: () => void;
    let calls = 0;
    const a = new AppState({
      repo,
      queue: createScrambleQueue({ generate: async (ev) => `${ev} R U R'` }),
      storage: null,
      storageManager: null,
      duel: {
        generate: async (ev) => {
          calls++;
          if (calls === 1) await new Promise<void>((resolve) => (release = resolve));
          if (calls === 2) throw new Error('timeout');
          return `${ev} L${calls}`;
        },
      },
    });
    await a.init();
    await mount(a);
    await fireEvent.click(screen.getByRole('button', { name: T.duel.challenge }));
    const sheet = await screen.findByRole('dialog', { name: T.duel.sheetTitle });
    await fireEvent.click(within(sheet).getByRole('button', { name: T.duel.start }));
    // 2b: o cubo gira, o texto diz o que acontece, o evento e o Começar ficam parados.
    expect(await within(sheet).findByRole('status')).toHaveTextContent(T.duel.generating);
    expect(sheet.querySelector('.live-cube')).toHaveAttribute('data-cube', 'turn');
    expect(within(sheet).getByRole('combobox', { name: T.duel.eventLabel })).toBeDisabled();
    expect(within(sheet).getByRole('button', { name: T.duel.start })).toBeDisabled();
    release();
    // A falha: o aviso honesto, o cubo em erro, e Começar de novo.
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(T.duel.generateFailed);
    expect(sheet.querySelector('.live-cube')).toHaveAttribute('data-cube', 'error');
    await fireEvent.click(within(sheet).getByRole('button', { name: T.duel.start }));
    await waitFor(() => expect(a.duel.phase).toBe('solving'));
    expect(a.duel.current!.scrambles).toHaveLength(7);
  });

  it('Agora não fecha o convite sem gravar; sem nome, "Alguém te desafiou"', async () => {
    const { a, repo } = await device();
    await mount(a);
    await a.duel.openLink(await encodeDuelLink({ ...LINK, a: { name: '', times: A_TIMES } }));
    const invite = await screen.findByRole('dialog', { name: T.duel.invited('') });
    expect(within(invite).getByRole('heading', { name: 'Alguém te desafiou' })).toBeInTheDocument();
    await fireEvent.click(within(invite).getByRole('button', { name: T.duel.notNow }));
    expect(a.duel.phase).toBe('idle');
    await tick();
    expect(invite).not.toHaveAttribute('open');
    expect(await repo.listDuels({ includeDeleted: true })).toEqual([]);
    await waitFor(() => expect(document.activeElement).toBe(document.querySelector('[data-screen="timer"]')));
  });

  it('a resposta abre por cima do Timer, com a barra normal, e o Centro reage ao resultado de quem desafiou', async () => {
    const A = await device({ name: 'Ranielli' });
    await A.a.duel.start('333');
    for (const t of A_TIMES) await A.a.duel.record(t);
    const url = (await A.a.duel.challengeUrl('https://klick.test'))!;
    A.a.duel.exit();
    // B (noutro aparelho) leva 3 × 1 no quarto.
    const B = await device();
    await B.a.duel.openLink(duelPayloadOf(new URL(url).hash)!);
    await B.a.duel.accept();
    for (const t of [tm(10_000), tm(20_000), tm(10_000), tm(10_000)]) {
      await B.a.duel.record(t);
      await B.a.duel.reveal();
      B.a.duel.next();
    }
    const reply = (await B.a.duel.replyUrl('https://klick.test', 'Bia'))!;
    await mount(A.a);
    await A.a.duel.openLink(duelPayloadOf(new URL(reply).hash)!);
    await waitFor(() => expect(A.a.duel.phase).toBe('reply'));
    await tick();
    // 8: a partida inteira; a barra normal (a pílula da sessão), sem a do modo.
    expect(screen.getByText(T.duel.replyLabel)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bia venceu 3 × 1' })).toBeInTheDocument();
    expect(screen.getByText('Bia fechou no embaralhamento 4. Seu melhor da partida: 0:12.34.')).toBeInTheDocument();
    expect(document.querySelector('[data-session-pill]')).not.toBeNull();
    expect(screen.queryByRole('button', { name: T.duel.pill('3×3') })).toBeNull();
    expect(screen.getByRole('img', { name: /^Placar: Você 1, Bia 3\./ })).toBeInTheDocument();
    const skip = [...document.querySelectorAll('.dz-match tbody tr')].at(-1)!;
    expect(skip).toHaveTextContent(`5–7${T.duel.notPlayed(3)} · ${T.duel.yoursUnplayed(['0:16.78', '0:17.89', '0:18.91'])}`);
    // O Centro de A: perdeu, 3 em âmbar (calmo).
    const centro = document.querySelector('[data-duel-centro] svg.centro')!;
    await waitFor(() => expect(centro.querySelectorAll('.ring.lit')).toHaveLength(3));
    expect(screen.getByRole('button', { name: T.duel.seeAll })).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.close }));
    expect(A.a.duel.phase).toBe('idle');
    await tick();
    expect(document.querySelector('[data-screen="timer"]')).not.toHaveAttribute('hidden');
  });

  it('uma partida só para ver (a resposta sem o desafio daqui, o desafio da lixeira) mostra o que tem e só oferece Fechar', async () => {
    const A = await device({ name: 'Ranielli' });
    await A.a.duel.start('333');
    for (const t of A_TIMES) await A.a.duel.record(t);
    const url = (await A.a.duel.challengeUrl('https://klick.test'))!;
    const aId = A.a.duel.current!.id;
    const B = await device();
    await B.a.duel.openLink(duelPayloadOf(new URL(url).hash)!);
    await B.a.duel.accept();
    for (const t of [tm(10_000), tm(10_000), tm(10_000)]) {
      await B.a.duel.record(t);
      await B.a.duel.reveal();
      B.a.duel.next();
    }
    const reply = (await B.a.duel.replyUrl('https://klick.test', 'Bia'))!;
    // Um terceiro aparelho abre a resposta: a partida do lado de A, sem gravar nada.
    const C = await device();
    const shell = await mount(C.a);
    await C.a.duel.openLink(duelPayloadOf(new URL(reply).hash)!);
    await waitFor(() => expect(C.a.duel.phase).toBe('view'));
    await tick();
    expect(screen.getByRole('heading', { name: 'Bia venceu 3 × 0' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: T.duel.seeAll })).toBeNull();
    expect(screen.queryByRole('button', { name: T.duel.rematch })).toBeNull();
    expect(screen.queryByRole('button', { name: T.duel.send })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: T.duel.close }));
    expect(C.a.duel.phase).toBe('idle');
    expect(await C.repo.listDuels({ includeDeleted: true })).toEqual([]);

    shell.unmount();

    // O desafio de A na lixeira, aberto pelo link dele: os sete tempos, sem mandar de novo.
    expect(A.a.duel.current!.id).toBe(aId);
    expect(await A.a.duel.discard()).toBe(true);
    await mount(A.a);
    await A.a.duel.openLink(duelPayloadOf(new URL(url).hash)!);
    expect(A.a.duel.phase).toBe('view');
    await tick();
    expect(screen.getByText(T.duel.myTimes('3×3'))).toBeInTheDocument();
    expect(document.querySelectorAll('[data-duel-times] li')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: T.duel.send })).toBeNull();
    expect(screen.queryByRole('textbox', { name: T.duel.nameLabel })).toBeNull();
    expect(screen.getByRole('button', { name: T.duel.close })).toBeInTheDocument();
  });

  it('a primeira visita por um link não mostra a apresentação antes do desafio', async () => {
    const { a } = await device({ onboarded: false });
    await a.duel.openLink(await encodeDuelLink(LINK));
    await mount(a);
    await screen.findByRole('dialog', { name: 'Ranielli te desafiou' });
    expect(a.dialog).toBeNull();
    expect(document.querySelector('dialog[aria-label="Apresentação do Klick"]')).not.toHaveAttribute('open');
    await fireEvent.click(screen.getByRole('button', { name: T.duel.notNow }));
    // A apresentação fica para depois.
    await waitFor(() => expect(a.dialog).toBe('onboarding'));
  });
});
