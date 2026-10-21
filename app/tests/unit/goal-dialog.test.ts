import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Goal } from '../../src/core/goals';
import { rollingAverages } from '../../src/core/stats';
import type { EventId, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import { CONFIRM_DELAY_MS } from '../../src/ui/confirm';
import GoalDialog from '../../src/ui/dialogs/GoalDialog.svelte';
import { AppState } from '../../src/ui/state/app.svelte';

// As médias passam por rollingAverages: um espião que deixa a conta de verdade e conta as passadas pela série.
vi.mock('../../src/core/stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/stats')>();
  return { ...actual, rollingAverages: vi.fn(actual.rollingAverages) };
});

// A folha da meta (a maquete aprovada, 3a, 3b, 3d, 3e e 7c, 7d, 7f): tipo, evento e o tempo; embaixo, como a meta fica e o seu melhor agora.
// Datas locais (new Date(ano, mês, dia, hora)): o fuso é o do aparelho, como no código.
let n = 0;
async function app(goals: Record<string, Goal> = {}, solves: Solve[] = []) {
  const repo = createRepository(await openKlickDb(`gd-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  // As metas gravadas (as operações partem do perfil gravado); os solves, só na memória.
  await repo.saveProfile({ goals });
  await a.reload();
  a.solves = solves;
  return { a, repo };
}

const day = (m: number, d: number) => new Date(2026, m, d, 12).getTime();
let id = 0;
const sv = (event: EventId, ms: number, at: number): Solve => ({
  id: `s${++id}`, sessionId: 'x', event, ms, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});
// `count` tempos iguais, um por minuto a partir de `at`: a média de 5 e a de 12 deles é o próprio tempo.
const run = (event: EventId, ms: number, at: number, count: number): Solve[] => Array.from({ length: count }, (_, i) => sv(event, ms, at + i * 60_000));
const goal = (o: Partial<Goal> = {}): Goal => ({ kind: 'single', event: '333', targetMs: 11_000, startMs: null, createdAt: 1, reachedAt: null, ...o });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sheet = () => screen.getByRole('dialog');
const field = () => within(sheet()).getByLabelText(T.metas.targetLabel) as HTMLInputElement;
const eventSelect = () => within(sheet()).getByLabelText(T.metas.eventLabel) as HTMLSelectElement;
const kindButton = (name: string) => within(within(sheet()).getByRole('group', { name: T.metas.kindLabel })).getByRole('button', { name });
// As duas linhas embaixo do campo, na ordem (as descrições dele).
const lines = () => field().getAttribute('aria-describedby')!.split(' ').map((i) => document.getElementById(i)!);
const type = (text: string) => fireEvent.input(field(), { target: { value: text } });
const save = () => fireEvent.click(within(sheet()).getByRole('button', { name: T.metas.save }));

async function openNew(a: AppState, event: EventId = '333'): Promise<void> {
  a.openGoal(null, event);
  render(GoalDialog, { app: a, open: true });
  await screen.findByRole('dialog', { name: T.metas.newTitle });
}

describe('a folha da meta', () => {
  it('a prévia segue o que se digita e o erro só aparece ao salvar', async () => {
    const { a } = await app({}, run('333', 12_970, day(9, 1), 5));
    await openNew(a);
    expect(within(sheet()).getByText(T.metas.newIntro)).toBeInTheDocument();
    // A nova começa em Single, no evento do filtro.
    expect(kindButton('Single')).toHaveAttribute('aria-pressed', 'true');
    expect(kindButton('Média de 5')).toHaveAttribute('aria-pressed', 'false');
    expect(eventSelect().value).toBe('333');
    expect([...eventSelect().options].map((o) => o.textContent)).toContain('3×3 com uma mão');
    expect(field()).toHaveAttribute('inputmode', 'decimal');
    expect(field()).toHaveAttribute('placeholder', '15');
    expect(field().value).toBe('');
    expect(lines().map((l) => l.textContent)).toEqual(['Em segundos: 15 é sub-15, e 90 é 1:30.', 'Seu melhor agora: 0:12.97.']);

    await fireEvent.click(kindButton('Média de 5'));
    expect(kindButton('Média de 5')).toHaveAttribute('aria-pressed', 'true');
    await type('12,5');
    expect(lines().map((l) => l.textContent)).toEqual(['Fica média de 5 abaixo de 12.5 s.', 'Seu melhor agora: 0:12.97. Faltam 0.47 s.']);
    expect(lines()[0]!.querySelector('b')!.textContent).toBe('média de 5 abaixo de 12.5 s');
    expect(lines()[1]!.querySelector('b')!.textContent).toBe('0:12.97');

    // Torto enquanto digita: só a dica, sem erro.
    await type('12..5');
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(lines().map((l) => l.textContent)).toEqual(['Em segundos: 15 é sub-15, e 90 é 1:30.', 'Seu melhor agora: 0:12.97.']);
    // Ao salvar, o erro no próprio campo; nada gravado, a folha fica.
    await save();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(lines()[0]!.textContent).toBe('Esse tempo não parece certo. Tente 15, 14.5 ou 90.');
    expect(lines()[0]).toHaveClass('err');
    expect(a.profile.goals).toEqual({});
    expect(a.dialog).toBe('goal');
    // Mexer no campo tira o erro.
    await type('12.9');
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(lines()[0]).not.toHaveClass('err');
    expect(lines().map((l) => l.textContent)).toEqual(['Fica média de 5 abaixo de 12.9 s.', 'Seu melhor agora: 0:12.97. Faltam 0.07 s.']);

    // Outro evento, sem tempo nele.
    await fireEvent.change(eventSelect(), { target: { value: '444' } });
    expect(lines()[1]!.textContent).toBe('Você ainda não tem média de 5 no 4×4.');
    await fireEvent.click(kindButton('Single'));
    expect(lines()[1]!.textContent).toBe('Você ainda não tem tempo no 4×4.');

    // Vazio, Salvar não acusa erro: o campo volta a ter o foco.
    await type('');
    await save();
    expect(field()).not.toHaveAttribute('aria-invalid');
    expect(document.activeElement).toBe(field());
    expect(a.profile.goals).toEqual({});
  });

  // Com 100 mil solves, a série custa: digitar o alvo não a refaz, e voltar a um tipo já visto com a folha aberta também não.
  it('a prévia calcula a série uma vez por evento e tipo enquanto a folha está aberta', async () => {
    const { a } = await app({}, run('333', 12_970, day(9, 1), 12));
    await openNew(a);
    vi.mocked(rollingAverages).mockClear();
    await fireEvent.click(kindButton('Média de 5'));
    for (const t of ['13', '14', '15', '12.5', '16']) await type(t);
    expect(lines()[1]!.textContent).toBe('Seu melhor já está abaixo: ela nasce alcançada, com a data de 01/10/2026.');
    expect(vi.mocked(rollingAverages)).toHaveBeenCalledTimes(1);
    await fireEvent.click(kindButton('Média de 12'));
    await fireEvent.click(kindButton('Média de 5'));
    await type('17');
    expect(vi.mocked(rollingAverages)).toHaveBeenCalledTimes(2);
  });

  it('3600 diz Até 59:59.99.', async () => {
    const { a } = await app();
    await openNew(a);
    await type('3600');
    expect(field()).not.toHaveAttribute('aria-invalid');
    await save();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(lines()[0]!.textContent).toBe('Até 59:59.99.');
    expect(lines()[1]!.textContent).toBe('Você ainda não tem tempo no 3×3.');
    expect(a.profile.goals).toEqual({});
  });

  it('Salvar cria e fecha', async () => {
    const { a, repo } = await app({}, run('333', 12_970, day(9, 1), 5));
    await openNew(a);
    await fireEvent.click(kindButton('Média de 5'));
    await type('12.5');
    await save();
    await waitFor(() => expect(a.dialog).toBeNull());
    expect(sheet).toThrow(); // fechada
    const saved = Object.values(a.profile.goals);
    expect(saved).toEqual([expect.objectContaining({ kind: 'ao5', event: '333', targetMs: 12_500, startMs: 12_970, reachedAt: null })]);
    expect(Object.values((await repo.getProfile()).goals)).toEqual(saved);
  });

  it('Enter no campo salva; Cancelar fecha sem gravar', async () => {
    const { a } = await app();
    await openNew(a, '222');
    expect(eventSelect().value).toBe('222');
    await type('5');
    await fireEvent.click(within(sheet()).getByRole('button', { name: T.metas.cancel }));
    await waitFor(() => expect(a.dialog).toBeNull());
    expect(a.profile.goals).toEqual({});

    a.openGoal(null, '222');
    await screen.findByRole('dialog', { name: T.metas.newTitle });
    // A folha abre limpa de novo.
    expect(field().value).toBe('');
    await type('5');
    await fireEvent.keyDown(field(), { key: 'Enter' });
    await waitFor(() => expect(a.dialog).toBeNull());
    expect(Object.values(a.profile.goals)).toEqual([expect.objectContaining({ kind: 'single', event: '222', targetMs: 5_000 })]);
  });

  it('se saveGoal recusa (seis metas vieram do sync com a folha aberta), a folha fica aberta', async () => {
    const { a, repo } = await app();
    await openNew(a);
    // O lote do sync grava as seis antes de a memória se refazer.
    await repo.saveProfile({ goals: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`a0${i}`, goal({ createdAt: i })])) });
    await type('10');
    await save();
    await sleep(50);
    expect(a.dialog).toBe('goal');
    expect(sheet()).toBeInTheDocument();
    expect(Object.keys(a.profile.goals)).toHaveLength(6);
  });

  it('nasce alcançada avisa a data', async () => {
    const { a } = await app({}, [sv('333', 14_000, day(8, 28)), sv('333', 11_900, day(9, 2)), sv('333', 11_500, day(9, 10))]);
    await openNew(a);
    await type('12');
    expect(lines().map((l) => l.textContent)).toEqual([
      'Fica single abaixo de 12 s.',
      'Seu melhor já está abaixo: ela nasce alcançada, com a data de 02/10/2026.',
    ]);
    await save();
    await waitFor(() => expect(a.dialog).toBeNull());
    expect(Object.values(a.profile.goals)).toEqual([expect.objectContaining({ targetMs: 12_000, startMs: 11_500, reachedAt: day(9, 2) })]);
  });

  it('editar mostra Excluir e pede o segundo toque', async () => {
    const { a } = await app({ ab1: goal({ kind: 'ao12', targetMs: 13_000, startMs: 14_410, createdAt: 7 }) }, run('333', 13_580, day(9, 1), 12));
    a.openGoal('ab1', '222');
    render(GoalDialog, { app: a, open: true });
    await screen.findByRole('dialog', { name: T.metas.editTitle });
    expect(within(sheet()).getByText(T.metas.editIntro)).toBeInTheDocument();
    // A folha de editar abre com a própria meta (o evento dela, não o do filtro).
    expect(kindButton('Média de 12')).toHaveAttribute('aria-pressed', 'true');
    expect(eventSelect().value).toBe('333');
    expect(field().value).toBe('13');
    expect(lines().map((l) => l.textContent)).toEqual(['Fica média de 12 abaixo de 13 s.', 'Seu melhor agora: 0:13.58. Faltam 0.58 s.']);

    const remove = within(sheet()).getByRole('button', { name: T.metas.remove });
    expect(remove).toHaveClass('danger');
    await fireEvent.click(remove);
    const again = within(sheet()).getByRole('button', { name: T.metas.confirmAgain });
    expect(again).toBe(remove);
    // O toque duplo não vale.
    await fireEvent.click(again);
    await sleep(30);
    expect(a.profile.goals.ab1).toBeDefined();
    await sleep(CONFIRM_DELAY_MS + 50);
    await fireEvent.click(again);
    await waitFor(() => expect(a.profile.goals.ab1).toBeUndefined());
    await waitFor(() => expect(a.dialog).toBeNull());
  });

  it('a folha nova não tem Excluir; editar salva a mesma meta e mostra o alvo como se digita', async () => {
    const { a } = await app({ ab1: goal({ kind: 'ao5', event: '444', targetMs: 90_000, createdAt: 7 }), cd1: goal({ targetMs: 12_500 }) });
    await openNew(a);
    expect(within(sheet()).queryByRole('button', { name: T.metas.remove })).toBeNull();
    await fireEvent.click(within(sheet()).getByRole('button', { name: T.metas.cancel }));
    await waitFor(() => expect(a.dialog).toBeNull());

    a.openGoal('cd1', '333');
    await screen.findByRole('dialog', { name: T.metas.editTitle });
    expect(field().value).toBe('12.5');
    a.openGoal('ab1', '333');
    await waitFor(() => expect(field().value).toBe('1:30'));
    expect(eventSelect().value).toBe('444');
    await type('1:25');
    await save();
    await waitFor(() => expect(a.dialog).toBeNull());
    expect(a.profile.goals.ab1).toMatchObject({ kind: 'ao5', event: '444', targetMs: 85_000, createdAt: 7 });
    expect(Object.keys(a.profile.goals)).toHaveLength(2);
  });

  it('a meta que some com a folha aberta (excluída em outro aparelho) fecha a folha', async () => {
    const { a } = await app({ ab1: goal() });
    a.openGoal('ab1', '333');
    render(GoalDialog, { app: a, open: true });
    await screen.findByRole('dialog', { name: T.metas.editTitle });
    a.profile.goals = {};
    await waitFor(() => expect(a.dialog).toBeNull());
  });
});
