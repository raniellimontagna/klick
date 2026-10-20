import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { pbFlags, rollingAverages } from '../../src/core/stats';
import type { Penalty, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import MoveDialog from '../../src/ui/dialogs/MoveDialog.svelte';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';
import { MAX_SELECTION, rowAt, whenLabel } from '../../src/ui/evolucao/rows';
import SolveList from '../../src/ui/evolucao/SolveList.svelte';
import { LONG_PRESS_MS } from '../../src/ui/longpress';
import { AppState } from '../../src/ui/state/app.svelte';

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`sl-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

const MIN = 60_000;
const at = (y: number, m: number, d: number, h: number, min: number) => new Date(y, m - 1, d, h, min).getTime();

// Um solve montado à mão, para as listas que não passam pelo banco.
function solve(i: number, ms: number, penalty: Penalty = null, note = '', when = at(2026, 10, 20, 14, 33) - (100 - i) * MIN): Solve {
  return { id: `s${i}`, sessionId: 'x', event: '333', ms, penalty, at: when, scramble: `R U F${i}`, note, createdAt: when, updatedAt: when, deletedAt: null };
}

const seriesOf = (pool: Solve[]) => ({ ao5: rollingAverages(pool, 5), ao12: rollingAverages(pool, 12), pb: pbFlags(pool) });
const rows = () => [...document.querySelectorAll<HTMLElement>('.hx-row')];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const bulk = () => screen.queryByRole('region', { name: T.historico.selection });

// Muda um <select> da Evolução como a pessoa muda.
function choose(label: string, value: string): void {
  const select = screen.getByLabelText(label) as HTMLSelectElement;
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('a linha da lista', () => {
  it('a linha mostra nº, tempo com +2 e DNF, ao5, ao12, data e o sinal de nota', async () => {
    // 10 s, 11 s, ..., 21 s; o 13º é um +2 (14,96 s com a penalidade) e o 14º um DNF com nota.
    const pool = Array.from({ length: 12 }, (_, i) => solve(i, 10_000 + i * 1000));
    pool.push(solve(12, 12_960, '+2'), solve(13, 9_000, 'DNF', 'pop no R, a peça voou'));
    const series = seriesOf(pool);
    const now = at(2026, 10, 20, 15, 0);
    expect(rowAt(pool, 11, series, now)).toMatchObject({ id: 's11', number: 12, time: '0:21.00', plus2: false, dnf: false, ao5: '0:19.00', ao12: '0:15.50', note: '', pb: false });
    expect(rowAt(pool, 12, series, now)).toMatchObject({ number: 13, time: '0:14.96+', plus2: true, ao5: '0:19.00', ao12: '0:15.90' });
    expect(rowAt(pool, 13, series, now)).toMatchObject({ number: 14, time: 'DNF', dnf: true, ao5: '0:20.00', note: 'pop no R, a peça voou' });
    // Antes de haver 5, a média é o traço.
    expect(rowAt(pool, 3, series, now)).toMatchObject({ ao5: '—', ao12: '—' });
    // O nome lido pelo leitor de tela, como na maquete.
    expect(rowAt(pool, 12, series, now).label).toBe('Solve 13: 0:14.96 mais 2, média de 5 0:19.00, média de 12 0:15.90, ter, 20 out, 13:05');
    expect(rowAt(pool, 12, series, now).when).toBe('20/10 13:05');
    expect(rowAt(pool, 13, series, now).label).toMatch(/^Solve 14: DNF, média de 5 0:20\.00, .*, nota: pop no R, a peça voou$/);

    // Na tela, o mais novo em cima.
    const a = await app();
    render(SolveList, { app: a, pool, series, now, onOpen: () => {} });
    const [dnf, plus2] = rows();
    expect(within(dnf!).getByText('14')).toHaveClass('hx-n');
    expect(dnf!.querySelector('.hx-t')).toHaveTextContent('DNF');
    expect(dnf!.querySelector('.hx-t .hx-dot')).not.toBeNull();
    expect(dnf!.querySelector('.hx-note')).toHaveTextContent('pop no R, a peça voou');
    expect(plus2!.querySelector('.hx-t')).toHaveTextContent('0:14.96+');
    expect(plus2!.querySelector('.hx-t .tag.hx-p2')).toHaveTextContent('+2');
    expect(plus2!.querySelector('.hx-t .hx-dot')).toBeNull();
    expect(plus2!).toHaveTextContent('0:19.00');
    expect(plus2!).toHaveTextContent('0:15.90');
    expect(plus2!.querySelector('.hx-scr')).toHaveTextContent('R U F12');
    expect(plus2!.querySelector('.hx-when')).toHaveTextContent(whenLabel(pool[12]!.at, now));
    expect(plus2!).toHaveAccessibleName(rowAt(pool, 12, series, now).label);
  });

  it('o recorde da época leva o losango', async () => {
    const pool = [solve(0, 12_000), solve(1, 10_000), solve(2, 11_000)];
    const a = await app();
    render(SolveList, { app: a, pool, series: seriesOf(pool), now: at(2026, 10, 20, 15, 0), onOpen: () => {} });
    expect(rows().map((r) => r.querySelector('.hx-pb') !== null)).toEqual([false, true, false]);
    expect(rows()[1]).toHaveAccessibleName(/, recorde$/);
  });

  it('data do mesmo ano sem o ano, de outro ano com o ano completo', () => {
    const now = at(2026, 10, 20, 15, 0);
    expect(whenLabel(at(2026, 10, 20, 14, 33), now)).toBe('20/10 14:33');
    expect(whenLabel(at(2026, 1, 2, 9, 5), now)).toBe('02/01 09:05');
    expect(whenLabel(at(2024, 3, 12, 21, 26), now)).toBe('12/03/2024');
    // Na virada do ano, o de ontem já leva o ano.
    expect(whenLabel(at(2025, 12, 31, 23, 59), at(2026, 1, 1, 0, 1))).toBe('31/12/2025');
  });
});

describe('a lista inteira', () => {
  it('com 100 mil solves, desenha só as linhas da tela', async () => {
    const N = 100_000;
    const pool = Array.from({ length: N }, (_, i) => solve(i, 10_000 + (i % 997)));
    const series = { ao5: new Array<number | null>(N).fill(null), ao12: new Array<number | null>(N).fill(null), pb: new Array<boolean>(N).fill(false) };
    const a = await app();
    render(SolveList, { app: a, pool, series, now: at(2026, 10, 20, 15, 0), onOpen: () => {} });
    expect(screen.getByRole('heading', { name: 'Solves do período · 100.000' })).toBeInTheDocument();
    const grid = screen.getByRole('grid');
    expect(grid).toHaveAttribute('aria-rowcount', String(N + 1));
    expect(rows().length).toBeGreaterThan(10);
    expect(rows().length).toBeLessThanOrEqual(60);
    // O mais novo em cima, com o número no filtro e o ponto de milhar.
    expect(rows()[0]).toHaveAttribute('aria-rowindex', '2');
    expect(rows()[0]!.querySelector('.hx-n')).toHaveTextContent('100.000');

    // Rolar até o meio: a lista desenha as linhas de lá, e continua desenhando poucas.
    const body = document.querySelector<HTMLElement>('.hx-rows')!;
    body.getBoundingClientRect = () => new DOMRect(0, -36 * 50_000, 800, 36 * N);
    window.dispatchEvent(new Event('scroll'));
    await waitFor(() => expect(rows().some((r) => r.querySelector('.hx-n')?.textContent === '50.000')).toBe(true));
    expect(rows().length).toBeLessThanOrEqual(60);
    expect(rows().some((r) => r.querySelector('.hx-n')?.textContent === '100.000')).toBe(false);
  });

  it('setas e Enter abrem o solve', async () => {
    const pool = Array.from({ length: 60 }, (_, i) => solve(i, 10_000 + i * 10));
    const onOpen = vi.fn();
    const a = await app();
    render(SolveList, { app: a, pool, series: seriesOf(pool), now: at(2026, 10, 20, 15, 0), onOpen });
    // Uma parada só de Tab: a primeira linha (o mais novo).
    const stops = rows().filter((r) => r.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAttribute('aria-rowindex', '2');
    stops[0]!.focus();
    await fireEvent.keyDown(stops[0]!, { key: 'ArrowDown' });
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-rowindex', '4'));
    await fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-rowindex', '3'));
    await fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onOpen).toHaveBeenCalledWith('s58');
    // End vai ao mais antigo, que estava fora das linhas desenhadas.
    expect(rows().some((r) => r.dataset.id === 's0')).toBe(false);
    await fireEvent.keyDown(document.activeElement!, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', 's0'));
    expect(document.activeElement).toHaveAttribute('aria-rowindex', '61');
    expect(rows().filter((r) => r.tabIndex === 0)).toEqual([document.activeElement]);
    await fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(onOpen).toHaveBeenLastCalledWith('s0');
    // Home volta ao mais novo; o clique também abre.
    await fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', 's59'));
    await fireEvent.click(rows()[1]!);
    expect(onOpen).toHaveBeenLastCalledWith('s58');
  });
});

describe('a seleção', () => {
  async function withSolves(count: number) {
    const a = await app();
    const base = Date.now() - count * MIN;
    for (let i = 0; i < count; i++) await a.addSolve({ ms: 10_000 + i * 100, penalty: null, at: base + i * MIN });
    return a;
  }

  it('Selecionar e o toque longo entram na seleção; Excluir pede o segundo toque', async () => {
    const a = await withSolves(5);
    render(EvolucaoScreen, { app: a });
    await waitFor(() => expect(rows()).toHaveLength(5));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    const mode = screen.getByRole('button', { name: T.historico.select });
    await fireEvent.click(mode);
    expect(mode).toHaveTextContent(T.historico.cancel);
    expect(mode).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('grid')).toHaveAttribute('aria-multiselectable', 'true');
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    // Com nada marcado, a barra não aparece.
    expect(bulk()).toBeNull();
    // A linha inteira marca; a caixa também.
    await fireEvent.click(rows()[0]!);
    await fireEvent.click(within(rows()[2]!).getByRole('checkbox'));
    expect(rows().map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'false', 'true', 'false', 'false']);
    expect(within(rows()[2]!).getByRole('checkbox')).toBeChecked();
    expect(within(bulk()!).getByText('2 selecionados')).toBeInTheDocument();
    // Tocar de novo desmarca.
    await fireEvent.click(rows()[2]!);
    expect(within(bulk()!).getByText('1 selecionado')).toBeInTheDocument();
    await fireEvent.click(rows()[1]!);

    // Excluir pede o segundo toque, e o toque duplo não passa.
    const remove = within(bulk()!).getByRole('button', { name: T.historico.remove });
    await fireEvent.click(remove);
    expect(remove).toHaveTextContent(T.historico.confirmAgain);
    await fireEvent.click(remove);
    expect(a.solves).toHaveLength(5);
    await sleep(450);
    const gone = [rows()[0]!.dataset.id, rows()[1]!.dataset.id];
    await fireEvent.click(remove);
    await waitFor(() => expect(a.solves).toHaveLength(3));
    expect(a.solves.map((s) => s.id)).not.toContain(gone[0]);
    await waitFor(() => expect(a.toast).toMatchObject({ text: T.historico.deleted(2), action: T.toast.undo }));
    // Depois do lote, a seleção some e o modo sai.
    await waitFor(() => expect(bulk()).toBeNull());
    expect(screen.getByRole('button', { name: T.historico.select })).not.toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    await waitFor(() => expect(rows()).toHaveLength(3));
    expect(screen.getByRole('heading', { name: 'Solves do período · 3' })).toBeInTheDocument();

    // O toque longo entra na seleção com a linha marcada; o clique que vem depois não a desmarca.
    const row = rows()[1]!;
    await fireEvent.pointerDown(row, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20 });
    await sleep(LONG_PRESS_MS + 60);
    await fireEvent.pointerUp(row, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20 });
    await fireEvent.click(row);
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(3));
    expect(rows()[1]).toHaveAttribute('aria-selected', 'true');
    expect(within(bulk()!).getByText('1 selecionado')).toBeInTheDocument();
    // Esc sai da seleção.
    await fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryAllByRole('checkbox')).toHaveLength(0));
  });

  it('o toque longo que arrasta (rolar a lista) não seleciona, nem o clique demorado do mouse', async () => {
    const a = await withSolves(3);
    render(EvolucaoScreen, { app: a });
    await waitFor(() => expect(rows()).toHaveLength(3));
    const row = rows()[0]!;
    await fireEvent.pointerDown(row, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 20 });
    await fireEvent.pointerMove(row, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 40 });
    await fireEvent.pointerDown(rows()[1]!, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 20, clientY: 20 });
    await sleep(LONG_PRESS_MS + 60);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('acima de 1.000, a caixa não marca e o aviso aparece', async () => {
    expect(MAX_SELECTION).toBe(1_000);
    const pool = Array.from({ length: 1_001 }, (_, i) => solve(i, 10_000 + i));
    const a = await app();
    render(SolveList, { app: a, pool, series: seriesOf(pool), now: at(2026, 10, 20, 15, 0), onOpen: () => {} });
    await fireEvent.click(screen.getByRole('button', { name: T.historico.select }));
    // O primeiro, e Shift+clique no mais antigo: marca o intervalo, até o máximo.
    await fireEvent.click(rows()[0]!);
    const first = rows()[0]!;
    first.focus();
    await fireEvent.keyDown(first, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', 's0'));
    await fireEvent.click(document.activeElement!, { shiftKey: true });
    expect(within(bulk()!).getByText(`1.000 selecionados · ${T.historico.atMax}`)).toBeInTheDocument();
    // O intervalo parou no máximo, com o aviso.
    const toast = () => a.toast?.text;
    expect(toast()).toBe(T.historico.selectionCap);
    a.toast = null;
    const last = rows().find((r) => r.dataset.id === 's0')!;
    const box = within(last).getByRole('checkbox');
    expect(box).not.toBeChecked();
    expect(box).toHaveAttribute('aria-disabled', 'true');
    // Tocar na caixa desligada não marca, e o aviso aparece.
    await fireEvent.click(box);
    expect(box).not.toBeChecked();
    expect(last).toHaveAttribute('aria-selected', 'false');
    expect(toast()).toBe(T.historico.selectionCap);
    // Desmarcar um libera as outras caixas (e o Espaço marca a linha da vez).
    await fireEvent.click(rows()[1]!);
    expect(within(bulk()!).getByText('999 selecionados')).toBeInTheDocument();
    rows()[1]!.focus();
    await fireEvent.keyDown(rows()[1]!, { key: 'End' });
    await waitFor(() => expect(document.activeElement).toHaveAttribute('data-id', 's0'));
    const again = within(document.activeElement as HTMLElement).getByRole('checkbox');
    expect(again).not.toHaveAttribute('aria-disabled');
    await fireEvent.keyDown(document.activeElement!, { key: ' ' });
    expect(again).toBeChecked();
    expect(within(bulk()!).getByText(`1.000 selecionados · ${T.historico.atMax}`)).toBeInTheDocument();
  });

  it('mudar o filtro limpa a seleção', async () => {
    const a = await withSolves(3);
    await a.createSession('333', 'Treino de cruz');
    await a.addSolve({ ms: 9_000, penalty: null, at: Date.now() });
    render(EvolucaoScreen, { app: a });
    await waitFor(() => expect(rows()).toHaveLength(4));
    const select = async () => {
      await fireEvent.click(screen.getByRole('button', { name: T.historico.select }));
      await fireEvent.click(rows()[0]!);
      expect(bulk()).not.toBeNull();
    };
    await select();
    // O período.
    await fireEvent.click(document.querySelector<HTMLButtonElement>('[data-period="7"]')!);
    await waitFor(() => expect(bulk()).toBeNull());
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // A sessão.
    await select();
    choose('Sessão', a.sessions.find((s) => s.name === 'Treino de cruz')!.id);
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(bulk()).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // O evento.
    choose('Sessão', 'all');
    await tick();
    await select();
    choose('Evento', '222');
    await waitFor(() => expect(rows()).toHaveLength(0));
    expect(bulk()).toBeNull();
  });
});

describe('mover para outra sessão', () => {
  it('Mover para… lista só as sessões do mesmo evento e move com Desfazer', async () => {
    const a = await app();
    await a.createSession('333', 'Treino de cruz');
    await a.addSolve({ ms: 9_000, penalty: null, at: Date.now() - 10 * MIN });
    await a.createSession('222', 'Dois');
    await a.addSolve({ ms: 3_000, penalty: null, at: Date.now() - 9 * MIN });
    const main = a.sessions.find((s) => s.name === 'Sessão 1')!;
    await a.switchSession(main.id);
    for (let i = 0; i < 3; i++) await a.addSolve({ ms: 10_000 + i * 100, penalty: null, at: Date.now() - (5 - i) * MIN });
    const cruz = a.sessions.find((s) => s.name === 'Treino de cruz')!;

    render(EvolucaoScreen, { app: a });
    render(MoveDialog, { app: a });
    choose('Sessão', main.id);
    await waitFor(() => expect(rows()).toHaveLength(3));
    await fireEvent.click(screen.getByRole('button', { name: T.historico.select }));
    await fireEvent.click(rows()[0]!);
    await fireEvent.click(rows()[1]!);
    const moved = [rows()[0]!.dataset.id!, rows()[1]!.dataset.id!];
    await fireEvent.click(within(bulk()!).getByRole('button', { name: T.historico.moveTo }));

    // A folha: as sessões de 3×3, com a contagem, a de origem marcada e parada; a de 2×2 não aparece.
    const sheet = await screen.findByRole('dialog', { name: T.historico.moveTitle(2) });
    expect(within(sheet).getByText(T.historico.moveIntro('3×3', 2))).toBeInTheDocument();
    const options = within(sheet).getAllByRole('button').filter((b) => b.classList.contains('list-btn'));
    const text = (el: Element) => el.textContent!.replace(/\s+/g, ' ').trim();
    expect(options.map((b) => [...b.children].map(text))).toEqual([
      [`Sessão 1 ${T.historico.here}`, '3 solves'],
      ['Treino de cruz', '1 solve'],
    ]);
    expect(options[0]).toBeDisabled();
    expect(options[0]).toHaveAttribute('aria-current', 'true');
    expect(within(sheet).queryByText('Dois')).toBeNull();

    // Tocar já move e fecha, com o aviso e o Desfazer.
    await fireEvent.click(options[1]!);
    await waitFor(() => expect(a.dialog).toBeNull());
    for (const id of moved) expect(a.solves.find((s) => s.id === id)!.sessionId).toBe(cruz.id);
    await waitFor(() => expect(a.toast).toMatchObject({ text: T.historico.moved(2, 'Treino de cruz'), action: T.toast.undo }));
    await waitFor(() => expect(rows()).toHaveLength(1));
    expect(bulk()).toBeNull();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    // Desfazer devolve os dois à sessão de onde vieram.
    a.toast!.onAction!();
    await waitFor(() => expect(rows()).toHaveLength(3));
    for (const id of moved) expect(a.solves.find((s) => s.id === id)!.sessionId).toBe(main.id);
  });

  it('o título de um solve só leva o número dele', () => {
    expect(T.historico.moveTitle(1, 10_471)).toBe('Mover o solve #10.471');
    expect(T.historico.moveTitle(3)).toBe('Mover 3 solves');
  });
});
