import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { type Goal, GOAL_MAX } from '../../src/core/goals';
import { rollingAverages } from '../../src/core/stats';
import type { EventId, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import GoalsBoard from '../../src/ui/evolucao/GoalsBoard.svelte';
import { AppState } from '../../src/ui/state/app.svelte';

// As médias das metas passam por rollingAverages: um espião que deixa a conta de verdade e conta as passadas.
vi.mock('../../src/core/stats', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/stats')>();
  return { ...actual, rollingAverages: vi.fn(actual.rollingAverages) };
});

// O quadro "Metas" da Evolução (a maquete aprovada, 1b, 1c, 3c, 6b, 7b e 7e): uma linha por meta, que abre a folha; "Nova meta" embaixo.
// Datas locais (new Date(ano, mês, dia, hora)): o fuso é o do aparelho, como no código.
let n = 0;
async function app(goals: Record<string, Goal> = {}, solves: Solve[] = []): Promise<AppState> {
  const repo = createRepository(await openKlickDb(`gb-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  a.profile.goals = goals;
  a.solves = solves;
  return a;
}

const day = (m: number, d: number) => new Date(2026, m, d, 12).getTime();
let id = 0;
const sv = (event: EventId, ms: number, at: number): Solve => ({
  id: `s${++id}`, sessionId: 'x', event, ms, penalty: null, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});
// `count` tempos iguais, um por minuto a partir de `at`: a média de 5 e a de 12 deles é o próprio tempo.
const run = (event: EventId, ms: number, at: number, count: number): Solve[] => Array.from({ length: count }, (_, i) => sv(event, ms, at + i * 60_000));
const goal = (o: Partial<Goal> = {}): Goal => ({ kind: 'single', event: '333', targetMs: 11_000, startMs: null, createdAt: 1, reachedAt: null, ...o });

const region = () => screen.getByRole('region', { name: T.metas.title });
const rows = () => within(region()).getAllByRole('button').filter((b) => b.classList.contains('es-goal'));
const bar = (row: HTMLElement) => (row.querySelector('.es-bar') as HTMLElement).style.getPropertyValue('--p');

describe('o quadro Metas', () => {
  it('linha em andamento com faltam, melhor, barra a 59% e o aria-label', async () => {
    // A média de 12 do 3×3 está em 13.58; a meta nasceu com 14.41 e busca 13: (14.41 - 13.58) / (14.41 - 13) = 59% do caminho.
    const a = await app({ ab1: goal({ kind: 'ao12', targetMs: 13_000, startMs: 14_410 }) }, run('333', 13_580, day(9, 1), 12));
    render(GoalsBoard, { app: a, event: '222' });
    expect(within(region()).getByRole('heading', { name: T.metas.title })).toBeInTheDocument();
    expect(within(region()).getByText(T.metas.scope)).toBeInTheDocument();
    const [row] = rows();
    expect(row).toHaveAccessibleName('Média de 12 abaixo de 13 s, 3×3: melhor 0:13.58, faltam 0.58 s, 59% do caminho desde 0:14.41. Editar a meta');
    expect(row!.querySelector('.es-goal-n')!.textContent).toBe('Média de 12 abaixo de 13 s3×3');
    expect(row!.querySelector('.es-goal-n .tag')!.textContent).toBe('3×3');
    expect(row!.querySelector('.es-goal-v')!.textContent).toBe('faltam 0.58 s · melhor 0:13.58');
    expect(row!.querySelector('.es-goal-v b')!.textContent).toBe('faltam 0.58 s');
    expect(bar(row!)).toBe('59%');
    expect(row!.hasAttribute('data-done')).toBe(false);
    // A linha abre a folha da meta; o evento do pedido é o do filtro da Evolução (a folha de editar lê o da própria meta).
    await fireEvent.click(row!);
    expect(a.dialog).toBe('goal');
    expect(a.goalRequest).toEqual({ id: 'ab1', event: '222' });
  });

  it('alcançada no fim com a data e a barra cheia', async () => {
    const solves = [sv('333', 12_400, day(9, 2)), sv('333', 10_840, day(9, 14)), sv('333', 11_200, day(9, 15))];
    const a = await app(
      {
        // Alcançada aqui, com a data gravada; a mais antiga das três.
        aa: goal({ targetMs: 11_000, startMs: 12_400, createdAt: 10, reachedAt: day(9, 14) }),
        // Em andamento, criada depois da de baixo: a ordem é a de criação.
        bb: goal({ targetMs: 10_000, startMs: 12_400, createdAt: 30 }),
        cc: goal({ targetMs: 10_500, startMs: 12_400, createdAt: 20 }),
        // Alcançada fora deste aparelho (sem reachedAt): vale a data do primeiro solve que chegou.
        dd: goal({ targetMs: 12_000, startMs: null, createdAt: 5 }),
      },
      solves,
    );
    render(GoalsBoard, { app: a, event: '333' });
    const names = rows().map((r) => r.querySelector('.es-goal-n')!.firstChild!.textContent);
    expect(names).toEqual(['Single abaixo de 10.5 s', 'Single abaixo de 10 s', 'Single abaixo de 12 s', 'Single abaixo de 11 s']);
    const done = rows()[3]!;
    expect(done.hasAttribute('data-done')).toBe(true);
    expect(done.querySelector('.es-goal-v')!.textContent).toBe('✓ alcançada em 14/10/2026 · melhor 0:10.84');
    expect(done).toHaveAccessibleName('Single abaixo de 11 s, 3×3: alcançada em 14/10/2026, melhor 0:10.84. Editar a meta');
    expect(bar(done)).toBe('100%');
    const outside = rows()[2]!;
    expect(outside.hasAttribute('data-done')).toBe(true);
    expect(outside.querySelector('.es-goal-v')!.textContent).toBe('✓ alcançada em 14/10/2026 · melhor 0:10.84');
  });

  // O quanto falta arredonda para cima ao centésimo: 5 ms é "faltam 0.01 s", não "0.00"; no alvo exato (igual não vale) também falta 0.01.
  it('faltam arredonda para cima ao centésimo e nunca diz 0.00', async () => {
    for (const [best, text] of [[13_005, 'faltam 0.01 s'], [13_000, 'faltam 0.01 s'], [13_011, 'faltam 0.02 s'], [13_580, 'faltam 0.58 s']] as const) {
      const a = await app({ ab1: goal({ targetMs: 13_000, startMs: 14_000 }) }, [sv('333', best, day(9, 1))]);
      const { unmount } = render(GoalsBoard, { app: a, event: '333' });
      expect(rows()[0]!.querySelector('.es-goal-v b')!.textContent, String(best)).toBe(text);
      expect(rows()[0]!.getAttribute('aria-label')).toContain(`, ${text},`);
      unmount();
    }
  });

  it('sem tempo: ainda sem média de 12, barra vazia', async () => {
    const a = await app(
      {
        ab1: goal({ kind: 'ao12', event: '444', targetMs: 60_000, createdAt: 1 }),
        cd1: goal({ kind: 'ao5', event: '444', targetMs: 60_000, createdAt: 2 }),
        ef1: goal({ kind: 'single', event: '444', targetMs: 60_000, createdAt: 3 }),
      },
      // Quatro solves de 4×4 não fazem uma média de 5; nenhum solve faz um single.
      run('444', 65_000, day(9, 1), 4).map((s) => ({ ...s, penalty: 'DNF' as const })),
    );
    render(GoalsBoard, { app: a, event: '333' });
    const [ao12, ao5, single] = rows();
    expect(ao12).toHaveAccessibleName('Média de 12 abaixo de 1:00, 4×4: ainda sem média de 12. Editar a meta');
    expect(ao12!.querySelector('.es-goal-v')!.textContent).toBe('ainda sem média de 12');
    expect(bar(ao12!)).toBe('0%');
    expect(ao5!.querySelector('.es-goal-v')!.textContent).toBe('ainda sem média de 5');
    expect(single!.querySelector('.es-goal-v')!.textContent).toBe('ainda sem tempo');
    expect(single).toHaveAccessibleName('Single abaixo de 1:00, 4×4: ainda sem tempo. Editar a meta');
  });

  it('sete metas do sync aparecem todas e Nova meta fica aria-disabled com o motivo', async () => {
    const seven = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`a0${i}`, goal({ targetMs: 10_000 + i * 100, createdAt: i })]));
    const a = await app(seven);
    render(GoalsBoard, { app: a, event: '333' });
    expect(rows()).toHaveLength(7);
    const button = within(region()).getByRole('button', { name: T.metas.new });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled(); // continua no Tab
    expect(button).toHaveAccessibleDescription(T.metas.full(GOAL_MAX));
    expect(T.metas.full(GOAL_MAX)).toBe('São 6 metas, o máximo. Exclua uma para criar outra.');
    await fireEvent.click(button);
    expect(a.dialog).toBeNull();
    expect(a.goalRequest).toBeNull();
  });

  it('com 6 Nova meta já fica desligado; com 5, abre a folha nova no evento do filtro', async () => {
    const goals = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`a0${i}`, goal({ createdAt: i })]));
    const six = await app(goals(6));
    const { unmount } = render(GoalsBoard, { app: six, event: '333' });
    expect(within(region()).getByRole('button', { name: T.metas.new })).toHaveAttribute('aria-disabled', 'true');
    unmount();
    const five = await app(goals(5));
    render(GoalsBoard, { app: five, event: '444' });
    const button = within(region()).getByRole('button', { name: T.metas.new });
    expect(button).not.toHaveAttribute('aria-disabled');
    expect(within(region()).queryByText(T.metas.full(GOAL_MAX))).toBeNull();
    await fireEvent.click(button);
    expect(five.dialog).toBe('goal');
    expect(five.goalRequest).toEqual({ id: null, event: '444' });
  });

  // Com 100 mil solves, cada passada pela série custa: as metas do mesmo evento e tipo dividem uma (antes, até três por meta).
  it('seis metas do mesmo evento fazem uma passada por tipo de média', async () => {
    const six = Object.fromEntries(
      (['single', 'ao5', 'ao12'] as const).flatMap((kind, k) => [12_000, 13_000].map((targetMs, j) => [`m${k}${j}`, goal({ kind, targetMs, createdAt: k * 2 + j })])),
    );
    const a = await app(six, run('333', 13_580, day(9, 1), 30));
    vi.mocked(rollingAverages).mockClear();
    render(GoalsBoard, { app: a, event: '333' });
    expect(rows()).toHaveLength(6);
    expect(vi.mocked(rollingAverages)).toHaveBeenCalledTimes(2);
  });

  it('sem metas, o convite e Criar uma meta', async () => {
    const a = await app();
    render(GoalsBoard, { app: a, event: '222' });
    expect(within(region()).getByText(T.metas.empty)).toHaveClass('es-empty');
    expect(T.metas.empty).toBe(
      'Escolha um tempo para buscar: um single, uma média de 5 ou de 12, em qualquer evento. O Klick mostra quanto falta e guarda o dia em que você chegar.',
    );
    expect(rows()).toHaveLength(0);
    expect(within(region()).queryByRole('button', { name: T.metas.new })).toBeNull();
    const create = within(region()).getByRole('button', { name: T.metas.create });
    expect(create).toHaveClass('primary');
    await fireEvent.click(create);
    expect(a.dialog).toBe('goal');
    expect(a.goalRequest).toEqual({ id: null, event: '222' });
  });
});
