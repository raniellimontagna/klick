import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMs, records, rollingAverages } from '../../src/core/stats';
import type { Penalty, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { copyText } from '../../src/ui/clipboard';
import { CONFIRM_DELAY_MS } from '../../src/ui/confirm';
import SolveDialog from '../../src/ui/dialogs/SolveDialog.svelte';
import { copyLink } from '../../src/ui/duel/send';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';
import { copyTextOf } from '../../src/ui/evolucao/rows';
import { dateLabel, fullDate, timeOfDay } from '../../src/ui/format';
import { AppState } from '../../src/ui/state/app.svelte';

// O cubing.js não carrega nos testes: a imagem do embaralhamento fica vazia, e o texto continua na tela.
vi.mock('../../src/scramble/cubing-loader', () => ({ loadCubing: () => Promise.reject(new Error('sem cubing nos testes')) }));

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`sd-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

const MIN = 60_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// `times.length` solves na sessão atual, um a cada 5 min a partir de `start` (por padrão, o último fica há 5 min), cada um com o embaralhamento "R U F<i>".
async function seed(a: AppState, times: (number | [number, Penalty])[], start = Date.now() - (times.length + 1) * 5 * MIN): Promise<Solve[]> {
  const out: Solve[] = [];
  for (const [i, t] of times.entries()) {
    const [ms, penalty] = Array.isArray(t) ? t : [t, null];
    await waitFor(() => expect(a.scramble).not.toBe('')); // o gerador do AppState não pode sobrescrever o embaralhamento que se põe a seguir
    a.scramble = `R U F${i}`;
    const s = await a.addSolve({ ms, penalty, at: start + i * 5 * MIN });
    out.push(s!);
  }
  return out;
}

const sheet = () => screen.getByRole('dialog');
const live = (a: AppState, id: string) => a.solves.find((s) => s.id === id)!;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('o detalhe de um solve', () => {
  it('abre com tempo, data, sessão, embaralhamento e a ao5/ao12 que terminam nele', async () => {
    const a = await app();
    const solves = await seed(a, Array.from({ length: 14 }, (_, i) => 12_000 + i * 150));
    render(SolveDialog, { app: a });
    expect(screen.queryByRole('dialog')).toBeNull();

    const x = solves[12]!; // o 13º
    a.openSolve(x.id);
    const d = await screen.findByRole('dialog', { name: /Solve #13/ });
    expect(a.dialog).toBe('solve');
    expect(within(d).getByRole('heading', { name: 'Solve #13' })).toBeInTheDocument();
    expect(within(d).getByRole('img', { name: '0:13.80' })).toHaveTextContent('0:13.80'); // 12.000 + 12 × 150
    // Sem penalidade, não há linha do tempo cru.
    expect(d.querySelector('.hx-raw')).toBeNull();
    expect(d.querySelector('.hx-meta')).toHaveTextContent(`${dateLabel(x.at)}, ${timeOfDay(x.at)} · 3×3 · Sessão 1`);
    expect(within(d).getByText(`R U F12`)).toBeInTheDocument();

    const pool = a.solves;
    expect(within(d).getByText(T.historico.avgChip(5, formatMs(rollingAverages(pool, 5)[12])))).toBeInTheDocument();
    expect(within(d).getByText(T.historico.avgChip(12, formatMs(rollingAverages(pool, 12)[12])))).toBeInTheDocument();
    // O 13º solve fecha uma ao12 e uma ao5; o 3º só uma ao5 incompleta (o traço).
    a.openSolve(solves[2]!.id);
    expect(await within(sheet()).findByText(T.historico.avgChip(12, '—'))).toBeInTheDocument();
    expect(within(sheet()).getByText(T.historico.avgChip(5, '—'))).toBeInTheDocument();
  });

  it('um +2 mostra o tempo com o + e o tempo cru embaixo; um DNF, o DNF', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, [13_240, '+2'], [9_000, 'DNF']]);
    render(SolveDialog, { app: a });

    a.openSolve(solves[1]!.id);
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('img', { name: T.historico.plus2Spoken('0:15.24') })).toHaveTextContent('0:15.24+');
    expect(d.querySelector('.hx-raw')).toHaveTextContent(T.historico.rawPlus2('0:13.24'));
    expect(within(d).getByRole('button', { name: '+2' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(d).getByRole('button', { name: 'OK' })).toHaveAttribute('aria-pressed', 'false');

    a.openSolve(solves[2]!.id);
    await waitFor(() => expect(within(sheet()).getByRole('img', { name: 'DNF' })).toHaveTextContent('DNF'));
    expect(sheet().querySelector('.hx-raw')).toHaveTextContent(T.historico.rawDnf('0:09.00'));
    expect(within(sheet()).getByRole('button', { name: 'DNF' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('o ajuste que esconde a imagem do embaralhamento vale aqui', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, 11_000]);
    render(SolveDialog, { app: a });
    a.openSolve(solves[0]!.id);
    const d = await screen.findByRole('dialog');
    expect(d.querySelector('.scr-img')).not.toBeNull();
    await a.updateSettings({ scrambleImage: false });
    await waitFor(() => expect(d.querySelector('.scr-img')).toBeNull());
    expect(within(d).getByText('R U F0')).toBeInTheDocument();
  });

  it('OK/+2/DNF muda a penalidade de um solve antigo e a lista e os recordes acompanham', async () => {
    const a = await app();
    // O 3º é o melhor single (8 s). São 4 solves: sem média de 5, o único selo possível é o do single.
    const solves = await seed(a, [12_000, 12_500, 8_000, 13_000]);
    render(EvolucaoScreen, { app: a });
    render(SolveDialog, { app: a });
    const old = solves[2]!;
    const row = () => document.querySelector<HTMLElement>(`.hx-row[data-id="${old.id}"]`);
    await waitFor(() => expect(row()).not.toBeNull());
    expect(row()!.querySelector('.hx-t')).toHaveTextContent('0:08.00');

    a.openSolve(old.id);
    const d = await screen.findByRole('dialog');
    const inRecord = () => within(d).queryByText(T.historico.inRecord('single'));
    expect(inRecord()).not.toBeNull();
    const pen = (name: string) => within(d).getByRole('button', { name });

    await fireEvent.click(pen('+2'));
    await waitFor(() => expect(live(a, old.id).penalty).toBe('+2'));
    // O tempo grande, a lista e o recorde acompanham.
    await waitFor(() => expect(within(d).getByRole('img', { name: T.historico.plus2Spoken('0:10.00') })).toHaveTextContent('0:10.00+'));
    expect(pen('+2')).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(row()!.querySelector('.hx-t')).toHaveTextContent('0:10.00+'));
    expect(inRecord()).not.toBeNull(); // 10 s ainda é o melhor

    // Tocar no +2 de novo não tira: é um seletor de três valores, não o liga e desliga do Timer.
    await fireEvent.click(pen('+2'));
    await sleep(30);
    expect(live(a, old.id).penalty).toBe('+2');

    await fireEvent.click(pen('DNF'));
    await waitFor(() => expect(live(a, old.id).penalty).toBe('DNF'));
    await waitFor(() => expect(within(d).getByRole('img', { name: 'DNF' })).toBeInTheDocument());
    await waitFor(() => expect(row()!.querySelector('.hx-t')).toHaveTextContent('DNF'));
    expect(inRecord()).toBeNull(); // o DNF perdeu o recorde de single
    expect(records(a.solves).single.bestEnd).not.toBe(2);

    await fireEvent.click(pen('OK'));
    await waitFor(() => expect(live(a, old.id).penalty).toBeNull());
    await waitFor(() => expect(row()!.querySelector('.hx-t')).toHaveTextContent('0:08.00'));
    await waitFor(() => expect(inRecord()).not.toBeNull());
    expect(pen('OK')).toHaveAttribute('aria-pressed', 'true');
  });

  it('a nota se edita e salva: Enter e sair do campo salvam, Esc desfaz', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, 11_000]);
    render(SolveDialog, { app: a });
    const x = solves[0]!;
    a.openSolve(x.id);
    const d = await screen.findByRole('dialog');
    const input = within(d).getByLabelText('Nota') as HTMLInputElement;
    expect(input).toHaveAttribute('maxlength', '80');
    expect(input.value).toBe('');

    await fireEvent.input(input, { target: { value: '  esqueci o AUF no fim ' } });
    await fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(live(a, x.id).note).toBe('esqueci o AUF no fim'));
    expect(a.dialog).toBe('solve'); // salvar não fecha a folha

    // Enter durante a composição de texto (IME) só confirma a letra.
    await fireEvent.input(input, { target: { value: 'pop no R' } });
    await fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    await sleep(30);
    expect(live(a, x.id).note).toBe('esqueci o AUF no fim');
    // O Safari termina a composição com um Enter sem isComposing, mas com keyCode 229: também só confirma a letra.
    await fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    await sleep(30);
    expect(live(a, x.id).note).toBe('esqueci o AUF no fim');

    // Sair do campo salva.
    await fireEvent.blur(input);
    await waitFor(() => expect(live(a, x.id).note).toBe('pop no R'));

    // Esc desfaz o rascunho, não salva e não fecha a folha.
    await fireEvent.input(input, { target: { value: 'outra coisa' } });
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(esc);
    await waitFor(() => expect(input.value).toBe('pop no R'));
    expect(esc.defaultPrevented).toBe(true);
    await fireEvent.blur(input);
    await sleep(30);
    expect(live(a, x.id).note).toBe('pop no R');
    expect(a.dialog).toBe('solve');

    // O botão Salvar também salva.
    await fireEvent.input(input, { target: { value: 'pelo botão' } });
    await fireEvent.click(within(d).getByRole('button', { name: T.note.save }));
    await waitFor(() => expect(live(a, x.id).note).toBe('pelo botão'));
  });

  it('Excluir pede o segundo toque e manda para a lixeira com Desfazer', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, 11_000, 12_000]);
    render(SolveDialog, { app: a });
    const x = solves[1]!;
    a.openSolve(x.id);
    const d = await screen.findByRole('dialog');

    await fireEvent.click(within(d).getByRole('button', { name: T.historico.remove }));
    const again = within(d).getByRole('button', { name: T.historico.confirmAgain });
    expect(a.solves.map((s) => s.id)).toContain(x.id);
    // O toque duplo não vale.
    await fireEvent.click(again);
    await sleep(30);
    expect(a.solves.map((s) => s.id)).toContain(x.id);

    await sleep(CONFIRM_DELAY_MS + 50);
    await fireEvent.click(again);
    await waitFor(() => expect(a.solves.map((s) => s.id)).not.toContain(x.id));
    // A folha fecha e o aviso do AppState oferece o Desfazer.
    await waitFor(() => expect(a.dialog).toBeNull());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(a.toast).toMatchObject({ text: T.toast.deleted, action: T.toast.undo });
    a.toast!.onAction!();
    await waitFor(() => expect(a.solves.map((s) => s.id)).toContain(x.id));
  });

  it('Copiar copia o texto do solve e avisa', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, [13_240, '+2']]);
    render(SolveDialog, { app: a });
    const x = solves[1]!;
    a.openSolve(x.id);
    const d = await screen.findByRole('dialog');

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    await fireEvent.click(within(d).getByRole('button', { name: T.historico.copy }));
    // A cópia sai dentro do toque: a chamada já aconteceu quando o clique volta.
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(`0:15.24+ · R U F1 · ${fullDate(x.at)} ${timeOfDay(x.at)}`);
    await waitFor(() => expect(a.toast).toMatchObject({ text: T.historico.copied }));
    expect(a.dialog).toBe('solve');

    // Sem área de transferência: o aviso diz que não deu.
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    await fireEvent.click(within(d).getByRole('button', { name: T.historico.copy }));
    await waitFor(() => expect(a.toast).toMatchObject({ text: T.historico.copyFailed }));
  });

  // Sair do campo sem mudar a nota (ou só com espaços em volta) não grava nada: nem a data de edição nem a fila do sync andam.
  it('sair da nota sem mudar nada não grava', async () => {
    const a = await app();
    const solves = await seed(a, [10_000]);
    await a.setNote(solves[0]!.id, 'cruz');
    render(SolveDialog, { app: a });
    a.openSolve(solves[0]!.id);
    const input = within(await screen.findByRole('dialog')).getByLabelText('Nota') as HTMLInputElement;
    expect(input.value).toBe('cruz');
    const setNote = vi.spyOn(a, 'setNote');
    await fireEvent.focus(input);
    await fireEvent.blur(input);
    await fireEvent.input(input, { target: { value: '  cruz ' } });
    await fireEvent.blur(input);
    await sleep(30);
    expect(setNote).not.toHaveBeenCalled();
    expect(input.value).toBe('cruz');
  });

  it('Mover abre a folha de mover com este solve', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, 11_000, 12_000]);
    render(SolveDialog, { app: a });
    const x = solves[1]!;
    a.openSolve(x.id);
    const d = await screen.findByRole('dialog', { name: /Solve #2/ });
    await fireEvent.click(within(d).getByRole('button', { name: T.historico.moveButton }));
    expect(a.dialog).toBe('move');
    expect(a.moveRequest).toMatchObject({ ids: [x.id], number: 2 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('o selo aparece no solve que faz parte do recorde de ao12', async () => {
    // 3 lentos e depois 12 cada vez mais rápidos: a melhor ao12 são os 12 últimos (termina no índice 14; num empate o recorde fica com o
    // mais antigo, por isso os tempos descem), a melhor ao5 são os 5 últimos e o melhor single é o último.
    const a = await app();
    const all = await seed(a, [...Array.from({ length: 3 }, () => 20_000), ...Array.from({ length: 12 }, (_, i) => 10_000 + (11 - i) * 50)]);
    render(SolveDialog, { app: a });
    const heading = (n: number) => within(sheet()).getByRole('heading', { name: `Solve #${n}` });

    a.openSolve(all[14]!.id);
    const d = await screen.findByRole('dialog');
    expect(heading(15)).toBeInTheDocument();
    // Está nos três recordes (ao12, ao5 e single), e o selo é um só: o da maior média.
    expect(within(d).getByText(T.historico.inRecord(12))).toBeInTheDocument();
    expect(d.querySelectorAll('.chip.pb')).toHaveLength(1);

    a.openSolve(all[3]!.id); // o 1º da janela da ao12, fora da janela da ao5
    await waitFor(() => expect(heading(4)).toBeInTheDocument());
    expect(within(sheet()).getByText(T.historico.inRecord(12))).toBeInTheDocument();
    expect(within(sheet()).queryByText(T.historico.inRecord(5))).toBeNull();
    expect(within(sheet()).queryByText(T.historico.inRecord('single'))).toBeNull();

    a.openSolve(all[2]!.id); // fora de qualquer janela de ao12
    await waitFor(() => expect(heading(3)).toBeInTheDocument());
    expect(within(sheet()).queryByText(T.historico.inRecord(12))).toBeNull();
  });

  it('o filtro da lista vale para o número e as médias: com "Todas as sessões" a conta cruza as sessões', async () => {
    const a = await app();
    const first = await seed(a, [10_000, 11_000, 12_000], Date.now() - 60 * MIN);
    await a.createSession('333', 'Treino');
    const later = await seed(a, [13_000, 14_000], Date.now() - 30 * MIN);
    render(SolveDialog, { app: a });
    // Sem filtro dado, vale a sessão do próprio solve: o 1º da sessão nova é o #1.
    a.openSolve(later[0]!.id);
    await screen.findByRole('heading', { name: 'Solve #1' });
    // Com "Todas as sessões" (a Evolução passa 'all'), ele é o #4.
    a.openSolve(later[0]!.id, 'all');
    await screen.findByRole('heading', { name: 'Solve #4' });
    expect(first).toHaveLength(3);
  });

  it('se o solve some com a folha aberta (excluído em outra aba), ela fecha sem aviso', async () => {
    const a = await app();
    const solves = await seed(a, [10_000, 11_000]);
    render(SolveDialog, { app: a });
    a.openSolve(solves[0]!.id);
    await screen.findByRole('dialog');
    await a.deleteSolves([solves[0]!.id]);
    a.toast = null; // o aviso de desfazer é do AppState; o que se confere é que a folha não soma outro
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(a.dialog).toBeNull();
    expect(a.toast).toBeNull();
  });

  it('abrir um id que não existe não abre nada', async () => {
    const a = await app();
    await seed(a, [10_000]);
    render(SolveDialog, { app: a });
    a.openSolve('nao-existe');
    expect(a.dialog).toBeNull();
  });
});

describe('copiar para a área de transferência', () => {
  it('copyText diz se copiou, sem área de transferência ou com a recusa', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyText('oi', { clipboard: { writeText } as unknown as Clipboard })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('oi');
    await expect(copyText('oi', {})).resolves.toBe('failed');
    await expect(copyText('oi', { clipboard: { writeText: () => Promise.reject(new Error('negado')) } as unknown as Clipboard })).resolves.toBe('failed');
    await expect(
      copyText('oi', {
        clipboard: {
          writeText: () => {
            throw new Error('síncrono');
          },
        } as unknown as Clipboard,
      }),
    ).resolves.toBe('failed');
  });

  it('copyLink do desafio segue funcionando, agora pelo copyText', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await expect(copyLink('https://klick.app/#d=1', { clipboard: { writeText } as unknown as Clipboard })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('https://klick.app/#d=1');
    await expect(copyLink('x', {})).resolves.toBe('failed');
  });

  it('o texto do solve: tempo com a penalidade, embaralhamento e data', () => {
    const at = new Date(2026, 9, 19, 21, 30).getTime();
    const base = { id: 'x', sessionId: 's', event: '333', ms: 13_240, at, scramble: "U' F2 B'", note: '', createdAt: at, updatedAt: at, deletedAt: null } as const;
    expect(copyTextOf({ ...base, penalty: '+2' })).toBe("0:15.24+ · U' F2 B' · 19/10/2026 21:30");
    expect(copyTextOf({ ...base, penalty: null })).toBe("0:13.24 · U' F2 B' · 19/10/2026 21:30");
    expect(copyTextOf({ ...base, penalty: 'DNF' })).toBe("DNF · U' F2 B' · 19/10/2026 21:30");
    expect(T.historico.copyText('0:15.24+', 'R U', '19/10/2026 21:30')).toBe('0:15.24+ · R U · 19/10/2026 21:30');
  });
});
