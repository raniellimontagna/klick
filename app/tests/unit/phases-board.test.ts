import { render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';
import { AppState } from '../../src/ui/state/app.svelte';

// O cubing.js não carrega nos testes.
vi.mock('../../src/scramble/cubing-loader', () => ({ loadCubing: () => Promise.reject(new Error('sem cubing nos testes')) }));

// O quadro "Fases" da Evolução (a maquete aprovada, 7a–7b e 8d): a média de cada fase dos últimos 12 solves com fases, a parte de cada uma e
// a que mais pesa, no filtro de evento e sessão (sem o período), logo abaixo do quadro de recordes.
let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`pb-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

const MIN = 60_000;
const DAY = 86_400_000;

// Solves montados à mão, o último há 5 min, um a cada `step`; `phases[i]` (se houver) são as durações do solve i e `ms` a soma.
function make(sessionId: string, phases: (number[] | undefined)[], opts: { step?: number; last?: number; event?: Solve['event']; prefix?: string } = {}): Solve[] {
  const { step = 5 * MIN, last = Date.now() - 5 * MIN, event = '333', prefix = 's' } = opts;
  return phases.map((p, i) => {
    const at = last - (phases.length - 1 - i) * step;
    const ms = p ? p.reduce((a, b) => a + b, 0) : 12_000;
    return { id: `${prefix}${i}`, sessionId, event, ms, penalty: null, at, scramble: 'R U', note: '', createdAt: at, updatedAt: at, deletedAt: null, ...(p ? { phases: p } : {}) };
  });
}

const fases = () => screen.queryByRole('region', { name: T.fases.boardTitle });
const bar = () => within(fases()!).getByRole('list', { name: T.fases.boardBar });
const items = () => within(bar()).getAllByRole('listitem');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('o quadro Fases', () => {
  it('o quadro mostra a média de cada fase dos últimos 12 com fases, a parte de cada uma e a mais pesada', async () => {
    const a = await app();
    const session = a.profile.currentSessionId!;
    // 14 solves com 4 fases: os 12 últimos têm [2000, 6000, 2000, 4000] (14 s); os 2 mais antigos são outros e ficam de fora.
    a.solves = make(session, [[9000, 1000, 1000, 1000], [9000, 1000, 1000, 1000], ...Array.from({ length: 12 }, () => [2000, 6000, 2000, 4000])]);
    render(EvolucaoScreen, { app: a });
    const region = await waitFor(() => fases()!);
    expect(region).toBeInTheDocument();
    expect(within(region).getByRole('heading', { name: T.fases.boardTitle })).toBeInTheDocument();
    expect(within(region).getByText('as últimas 12 com 4 fases')).toBeInTheDocument();
    const li = items();
    // 3×3 com 4 fases: os nomes do CFOP, a média de cada uma e a parte (14% + 43% + 14% + 29% = 100%).
    expect(li.map((x) => x.querySelector('.n')?.textContent)).toEqual(['Cruz', 'F2L', 'OLL', 'PLL']);
    expect(li[0]).toHaveTextContent('Cruz, 2.00 s, 14% do tempo');
    expect(li[1]).toHaveTextContent('F2L, 6.00 s, 43% do tempo, a que mais pesa');
    expect(li[3]).toHaveTextContent('PLL, 4.00 s, 29% do tempo');
    expect(li.map((x) => x.hasAttribute('data-top'))).toEqual([false, true, false, false]);
    expect(within(region).getByText('A fase F2L é a que mais pesa: 43% do tempo, 6.00 s em média.')).toBeInTheDocument();
  });

  it.each([null, {}, [Number.NaN, 1], [1, 2, 3, 4, 5]])('um solve com fases tortas (%j) do sync não derruba a Evolução: o quadro sai com os bons', async (bad) => {
    const a = await app();
    const good = make(a.profile.currentSessionId!, [[2000, 6000], [4000, 6000]]);
    const broken: Solve = { ...make(a.profile.currentSessionId!, [undefined])[0]!, id: 'torto', phases: bad as unknown as number[] };
    a.solves = [...good, { ...broken, at: good[1]!.at + 1, createdAt: good[1]!.at + 1 }]; // o torto é o mais recente
    render(EvolucaoScreen, { app: a });
    const region = await waitFor(() => fases()!);
    expect(within(region).getByText('os 2 últimos com 2 fases')).toBeInTheDocument();
    expect(items().map((x) => x.querySelector('.n')?.textContent)).toEqual(['Fase 1', 'Fase 2']);
  });

  it('com menos de 12, o cabeçalho diz quantos entraram', async () => {
    const a = await app();
    a.solves = make(a.profile.currentSessionId!, [[2000, 3000], [3000, 3000], undefined, [2000, 4000]]);
    render(EvolucaoScreen, { app: a });
    const region = await waitFor(() => fases()!);
    expect(within(region).getByText('os 3 últimos com 2 fases')).toBeInTheDocument();
    // Fases sem nome do CFOP (2 fases): o número, e a nota fala da fase 2 (média 3.33 s contra 2.33 s).
    expect(items().map((x) => x.querySelector('.n')?.textContent)).toEqual(['Fase 1', 'Fase 2']);
    expect(within(region).getByText(/^A fase 2 é a que mais pesa: /)).toBeInTheDocument();
  });

  it('sem solves com fases, o quadro não aparece', async () => {
    const a = await app();
    a.solves = make(a.profile.currentSessionId!, [undefined, undefined, undefined]);
    render(EvolucaoScreen, { app: a });
    await waitFor(() => expect(screen.getByRole('region', { name: /^Recordes d/ })).toBeInTheDocument()); // a Evolução já desenhou
    expect(fases()).toBeNull();
    expect(screen.queryByText(T.fases.boardTitle)).toBeNull();
  });

  it('quem mudou de 3 para 4 fases vê as de 4', async () => {
    const a = await app();
    // Cinco solves de 3 fases e, depois, dois de 4: o formato vem do mais recente, e os de 3 ficam de fora.
    a.solves = make(a.profile.currentSessionId!, [
      ...Array.from({ length: 5 }, () => [4000, 4000, 4000]),
      [1000, 5000, 2000, 4000],
      [3000, 5000, 2000, 4000],
    ]);
    render(EvolucaoScreen, { app: a });
    const region = await waitFor(() => fases()!);
    expect(within(region).getByText('os 2 últimos com 4 fases')).toBeInTheDocument();
    const li = items();
    expect(li).toHaveLength(4);
    expect(li[0]).toHaveTextContent('Cruz, 2.00 s');
    expect(li[1]).toHaveTextContent('F2L, 5.00 s');
  });

  it('o quadro ignora o período e segue o evento e a sessão', async () => {
    const a = await app();
    await a.createSession('333', 'Treino');
    const [main, treino] = a.sessions.filter((s) => s.event === '333');
    // Principal: solves de 60 dias atrás (fora do período de 30 dias); Treino: de agora, com outras fases.
    a.solves = [
      ...make(main!.id, Array.from({ length: 6 }, () => [2000, 6000]), { step: DAY, last: Date.now() - 55 * DAY, prefix: 'p' }),
      ...make(treino!.id, Array.from({ length: 4 }, () => [7000, 1000]), { last: Date.now() - MIN, prefix: 't' }),
    ];
    render(EvolucaoScreen, { app: a });
    const select = (label: string, value: string) => {
      const el = screen.getByLabelText(label) as HTMLSelectElement;
      el.value = value;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    select(T.evolucao.sessionLabel, main!.id);
    await waitFor(() => expect(items()[1]).toHaveTextContent('6.00 s'));
    expect(screen.getByText(T.evolucao.periods['30']).closest('button')).toHaveAttribute('aria-pressed', 'true');
    select(T.evolucao.sessionLabel, treino!.id);
    await waitFor(() => expect(items()[0]).toHaveTextContent('7.00 s'));
    // Outro evento sem solves com fases: o quadro some.
    select(T.evolucao.eventLabel, '222');
    await waitFor(() => expect(fases()).toBeNull());
  });

  it('fases malformadas vindas do sync ficam de fora, sem quebrar a conta', async () => {
    const a = await app();
    const solves = make(a.profile.currentSessionId!, [[2000, 3000], [2000, 3000], [2000, 3000]]);
    solves[2] = { ...solves[2]!, phases: [2000, Number.NaN] }; // não soma o tempo e tem NaN
    a.solves = solves;
    render(EvolucaoScreen, { app: a });
    const region = await waitFor(() => fases()!);
    expect(within(region).getByText('os 2 últimos com 2 fases')).toBeInTheDocument();
    expect(items()[0]).toHaveTextContent('2.00 s');
  });
});
