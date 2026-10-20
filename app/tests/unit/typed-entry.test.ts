import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { mockMedia } from './media';
import { AppState } from '../../src/ui/state/app.svelte';
import TimerScreen from '../../src/ui/timer/TimerScreen.svelte';

// O modo Digitar da tela do Timer (a maquete aprovada, estados 2a–2f e 3a): o tempo vem de um timer de fora e é digitado.

let n = 0;
async function typing() {
  const repo = createRepository(await openKlickDb(`te-${++n}`), { channel: null });
  let k = 0;
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async (ev) => `${ev} R${++k}` }), storage: null, storageManager: null });
  await a.init();
  await a.updateSettings({ entry: 'typing', inspection: false });
  render(TimerScreen, { app: a });
  await waitFor(() => expect(a.scramble).not.toBe(''));
  return a;
}

const field = (): HTMLInputElement => screen.getByLabelText(T.timer.typedLabel) as HTMLInputElement;
const message = (): HTMLElement => document.getElementById(field().getAttribute('aria-describedby')!.split(' ')[0]!)!;
const actions = (): HTMLElement => document.querySelector('[data-actions]')!;
const act = (name: string): HTMLElement => document.querySelector(`[data-act="${name}"]`)!;

function type(text: string): void {
  fireEvent.input(field(), { target: { value: text } });
}

function enter(): void {
  fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter' });
}

function key(k: string, code = `Key${k.toUpperCase()}`): void {
  field().dispatchEvent(new KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }));
}

describe('digitar o tempo no Timer', () => {
  it('Enter grava o tempo digitado e traz o próximo embaralhamento', async () => {
    const a = await typing();
    const antes = a.scramble;
    expect(field()).toHaveAttribute('inputmode', 'decimal');
    expect(document.querySelector('[data-time]')).toBeNull(); // o campo ocupa o lugar do tempo grande
    type('1234');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    expect(a.solves[0]).toMatchObject({ ms: 12_340, penalty: null, scramble: antes });
    await waitFor(() => expect(a.scramble).not.toBe(antes));
    expect(field().value).toBe(''); // pronto para o próximo
    // O resultado de sempre: o tempo do último, os chips e as ações.
    await waitFor(() => expect(actions()).not.toHaveAttribute('hidden'));
    expect(document.querySelector('.tc-last')?.textContent).toBe('0:12.34');
    expect(document.querySelector('[data-chips]')?.textContent).toContain('solve #1');
  });

  it('o botão Salvar grava igual ao Enter, e +2 e DNF depois, pelas ações', async () => {
    const a = await typing();
    type('12.34');
    await fireEvent.click(screen.getByRole('button', { name: T.timer.typedSave }));
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(actions()).not.toHaveAttribute('hidden'));
    await fireEvent.click(act('plus2'));
    await waitFor(() => expect(a.solves[0]!.penalty).toBe('+2'));
    expect(document.querySelector('.tc-last')?.textContent).toBe('0:14.34+');
  });

  it('Salvar devolve o foco ao campo no desktop e o solta no celular (o teclado fecha)', async () => {
    await typing();
    type('1234');
    await fireEvent.click(screen.getByRole('button', { name: T.timer.typedSave }));
    await waitFor(() => expect(field()).toHaveFocus());
  });

  it('no celular, Salvar solta o campo: o teclado fecha', async () => {
    const restore = mockMedia(['(pointer: coarse)']);
    try {
      const a = await typing();
      field().focus();
      type('1234');
      await fireEvent.click(screen.getByRole('button', { name: T.timer.typedSave }));
      await waitFor(() => expect(a.solves).toHaveLength(1));
      expect(field()).not.toHaveFocus();
    } finally {
      restore();
    }
  });

  it('um "+" no fim grava +2 e DNF grava DNF com ms 0', async () => {
    const a = await typing();
    type('12.34+');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    expect(a.solves[0]).toMatchObject({ ms: 12_340, penalty: '+2' });
    type('dnf');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(2));
    expect(a.solves[1]).toMatchObject({ ms: 0, penalty: 'DNF' });
  });

  it('a prévia mostra como o tempo vai ficar', async () => {
    await typing();
    expect(message().textContent).toBe(T.timer.typedHintLong); // vazio: a dica (a longa, na largura de desktop)
    type('1234');
    expect(message().textContent).toBe('Fica 0:12.34.');
    type('10234');
    expect(message().textContent).toBe('Fica 1:02.34.');
    type('12.34+');
    expect(message().textContent).toBe('Fica 0:14.34+: 0:12.34 mais 2 s de penalidade.');
    expect(message().querySelector('b')?.textContent).toBe('0:14.34+');
    type('dnf');
    expect(message().textContent).toBe('Fica DNF.');
    type('12.3.4'); // torto: a prévia some e o erro só vem ao salvar
    expect(message().textContent).toBe(T.timer.typedHintLong);
  });

  it('um tempo torto só mostra o erro ao salvar, e não grava', async () => {
    const a = await typing();
    type('12.3.4');
    expect(field()).not.toHaveAttribute('aria-invalid');
    enter();
    expect(a.solves).toHaveLength(0);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(message().textContent).toBe(T.timer.typedError);
    expect(message()).toHaveClass('err');
    expect(field().value).toBe('12.3.4'); // o texto fica para a pessoa consertar
    type('12.34'); // digitar de novo tira o erro
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(message().textContent).toBe('Fica 0:12.34.');
    // "7512" (75 segundos) também não vale.
    type('7512');
    enter();
    expect(message().textContent).toBe(T.timer.typedError);
    expect(a.solves).toHaveLength(0);
  });

  it('salvar com o campo vazio não grava nem reclama: só devolve o foco ao campo', async () => {
    const a = await typing();
    await fireEvent.click(screen.getByRole('button', { name: T.timer.typedSave }));
    expect(a.solves).toHaveLength(0);
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(field()).toHaveFocus();
  });

  it('uma hora ou mais não entra e o erro diz o limite', async () => {
    const a = await typing();
    type('1:02:03.45');
    enter();
    expect(message().textContent).toBe(T.timer.typedTooLong);
    type('60:00.00');
    enter();
    expect(message().textContent).toBe(T.timer.typedTooLong);
    type('1020345');
    enter();
    expect(message().textContent).toBe(T.timer.typedTooLong);
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(a.solves).toHaveLength(0);
  });

  it('a dica da linha de baixo é a curta no celular e a longa no desktop', async () => {
    const restore = mockMedia(['(max-width: 639px)']);
    try {
      await typing();
      expect(message().textContent).toBe(T.timer.typedHint);
    } finally {
      restore();
    }
  });

  it('com o campo em foco, p, d, n, z, espaço e números não disparam atalhos; Esc solta o campo', async () => {
    const a = await typing();
    type('1234');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(actions()).not.toHaveAttribute('hidden'));
    await a.deleteSolve(a.solves[0]!.id); // há um "Desfazer" à espera: o z o desfaria
    await waitFor(() => expect(a.solves).toHaveLength(0));
    type('1234');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(actions()).not.toHaveAttribute('hidden'));
    const scramble = a.scramble;
    field().focus();
    expect(field()).toHaveFocus();
    for (const k of ['p', 'd', 'm', 'n', 'z', '2', '3', '5']) key(k);
    key('?', 'Slash');
    key(' ', 'Space');
    key('Backspace', 'Backspace');
    await new Promise((r) => setTimeout(r, 30));
    expect(a.solves).toHaveLength(1); // nem o Backspace excluiu
    expect(a.solves[0]!.penalty).toBeNull(); // nem p nem d
    expect(a.tab).toBe('timer'); // nem os números
    expect(a.dialog).toBeNull(); // nem o ?
    expect(a.scramble).toBe(scramble); // nem o n
    expect(document.body.dataset.tstate).toBe('idle'); // nem o espaço armou
    expect(document.querySelector('[data-noteform]')).toHaveAttribute('hidden'); // nem o m abriu a nota

    // Esc solta o campo; aí os atalhos voltam.
    fireEvent.keyDown(field(), { key: 'Escape', code: 'Escape' });
    expect(field()).not.toHaveFocus();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true, cancelable: true }));
    await waitFor(() => expect(a.solves[0]!.penalty).toBe('+2'));
  });

  it('com o campo solto, o espaço não arma o cronômetro: não há o que cronometrar', async () => {
    await typing();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 380));
    expect(document.body.dataset.tstate).toBe('idle');
  });

  it('as zonas de toque somem e o coach fala do modo', async () => {
    await typing();
    expect(document.querySelector('[data-zones]')).toHaveAttribute('hidden');
    expect(await screen.findByText(T.coach.idleTyped)).toBeInTheDocument();
    expect(screen.getByText(T.timer.hintsTyped)).toBeInTheDocument();
  });

  it('DNF digitado deixa OK e +2 indisponíveis, com o motivo', async () => {
    const a = await typing();
    type('DNF');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(actions()).not.toHaveAttribute('hidden'));
    expect(document.querySelector('.tc-last')?.textContent).toBe('DNF');
    const why = document.querySelector('.tc-why') as HTMLElement;
    expect(why.textContent).toBe(T.timer.typedDnfLocked);
    for (const name of ['plus2', 'dnf']) {
      expect(act(name)).toHaveAttribute('aria-disabled', 'true');
      expect(act(name)).toHaveAttribute('aria-describedby', why.id);
      expect(act(name)).not.toBeDisabled(); // aria-disabled, não disabled: o botão fica no Tab e o motivo se lê
    }
    expect(act('dnf')).toHaveAttribute('aria-pressed', 'true');
    // Não fazem nada: nem o clique, nem a tecla.
    await fireEvent.click(act('plus2'));
    await fireEvent.click(act('dnf'));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', code: 'KeyP', bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 30));
    expect(a.solves[0]).toMatchObject({ ms: 0, penalty: 'DNF' });
    // Nota e Excluir seguem valendo.
    expect(act('note')).not.toHaveAttribute('aria-disabled');
    expect(act('delete')).not.toHaveAttribute('aria-disabled');
  });

  it('um solve de verdade (com tempo) mantém +2 e DNF ligados', async () => {
    const a = await typing();
    type('1234');
    enter();
    await waitFor(() => expect(a.solves).toHaveLength(1));
    await waitFor(() => expect(actions()).not.toHaveAttribute('hidden'));
    expect(act('plus2')).not.toHaveAttribute('aria-disabled');
    expect(document.querySelector('.tc-why')).toBeNull();
  });
});
