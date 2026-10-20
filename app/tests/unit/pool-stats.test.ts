// As contas do filtro divididas pelas telas (a revisão final do histórico, I2): a Evolução, o quadro de recordes, o detalhe do solve e a
// folha do recorde leem as mesmas séries e os mesmos recordes, uma conta por mudança de app.solves. Uma nota editada não refaz nada (as
// médias e os recordes só dependem dos ids e dos tempos), e abrir o detalhe com a conta pronta também não.
import { render, screen, within } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import * as stats from '../../src/core/stats';
import type { Penalty, Solve } from '../../src/core/types';
import { openKlickDb } from '../../src/data/db';
import { createRepository } from '../../src/data/repository';
import { createScrambleQueue } from '../../src/scramble/queue';
import { T } from '../../src/strings';
import RecordDialog from '../../src/ui/dialogs/RecordDialog.svelte';
import SolveDialog from '../../src/ui/dialogs/SolveDialog.svelte';
import EvolucaoScreen from '../../src/ui/evolucao/EvolucaoScreen.svelte';
import { poolStats } from '../../src/ui/evolucao/pool-stats';
import { AppState } from '../../src/ui/state/app.svelte';

// A conta dos recordes, contada: cada chamada é uma conta inteira do filtro (as cinco médias móveis).
vi.mock('../../src/core/stats', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../src/core/stats')>();
  return { ...mod, records: vi.fn(mod.records) };
});
// O cubing.js não carrega nos testes: a imagem do embaralhamento do detalhe fica vazia.
vi.mock('../../src/scramble/cubing-loader', () => ({ loadCubing: () => Promise.reject(new Error('sem cubing nos testes')) }));

const runs = () => vi.mocked(stats.records).mock.calls.length;

let n = 0;
async function app() {
  const repo = createRepository(await openKlickDb(`ps-${++n}`), { channel: null });
  const a = new AppState({ repo, queue: createScrambleQueue({ generate: async () => 'R U' }), storage: null, storageManager: null });
  await a.init();
  return a;
}

// `count` solves de 3×3 na sessão dada, um por minuto até 5 min atrás, montados à mão (sem passar pelo banco).
function many(sessionId: string, count: number): Solve[] {
  const last = Date.now() - 5 * 60_000;
  return Array.from({ length: count }, (_, i) => {
    const at = last - (count - 1 - i) * 60_000;
    const ms = 9_000 + ((i * 7919) % 6_000);
    return { id: `p${i}`, sessionId, event: '333', ms, penalty: null, at, scramble: 'R U', note: '', createdAt: at, updatedAt: at, deletedAt: null };
  });
}

const edited = (list: readonly Solve[], id: string, patch: { note?: string; penalty?: Penalty }): Solve[] =>
  list.map((s) => (s.id === id ? { ...s, ...patch } : s));

describe('poolStats', () => {
  it('o mesmo array devolve a mesma conta; uma nota devolve as mesmas séries com o pool novo; um tempo refaz', () => {
    const list = many('s1', 40);
    const before = runs();
    const first = poolStats(list, '333', 'all');
    expect(runs() - before).toBe(1);
    expect(poolStats(list, '333', 'all')).toBe(first);
    expect(runs() - before).toBe(1);

    const noted = edited(list, 'p3', { note: 'nova' });
    const again = poolStats(noted, '333', 'all');
    expect(runs() - before).toBe(1);
    expect(again.series).toBe(first.series);
    expect(again.records).toBe(first.records);
    expect(again.pool[3]!.note).toBe('nova');

    const plus2 = poolStats(edited(noted, 'p3', { penalty: '+2' }), '333', 'all');
    expect(runs() - before).toBe(2);
    expect(plus2.series).not.toBe(first.series);
    expect(plus2.series.ao5).toEqual(stats.rollingAverages(plus2.pool, 5));
    expect(plus2.series.ao12).toEqual(stats.rollingAverages(plus2.pool, 12));
    expect(plus2.series.pb).toEqual(stats.pbFlags(plus2.pool));
    expect(plus2.records).toEqual(vi.mocked(stats.records).getMockImplementation()!(plus2.pool));
  });

  it('o filtro é o evento e a sessão; cada filtro tem a sua conta', () => {
    const list = [...many('s1', 10), ...many('s2', 10).map((s) => ({ ...s, id: `q${s.id}` }))].sort((x, y) => x.at - y.at);
    expect(poolStats(list, '333', 's2').pool.map((s) => s.id)).toEqual(list.filter((s) => s.sessionId === 's2').map((s) => s.id));
    expect(poolStats(list, '333', 'all').pool).toHaveLength(20);
    expect(poolStats(list, '222', 'all').pool).toEqual([]);
  });
});

describe('as quatro telas com 100 mil solves', () => {
  it('uma conta por mudança, dividida pela Evolução, o quadro, o detalhe e a folha do recorde; a nota e abrir o detalhe não refazem', async () => {
    const a = await app();
    const session = a.sessions[0]!.id;
    a.solves = many(session, 100_000);
    const before = runs();
    render(EvolucaoScreen, { app: a });
    render(SolveDialog, { app: a });
    render(RecordDialog, { app: a });
    await tick();
    expect(runs() - before).toBe(1); // a Evolução e o quadro

    a.openSolve('p99990', 'all'); // como a lista abre: com o filtro dela
    await tick();
    expect(within(screen.getByRole('dialog')).getByRole('heading', { name: T.historico.solveTitle(99_991) })).toBeInTheDocument();
    expect(runs() - before).toBe(1); // a conta já estava pronta

    a.solves = edited(a.solves, 'p99990', { note: 'cruz' }); // editar a nota não mexe em médias nem recordes
    await tick();
    expect(runs() - before).toBe(1);

    a.openRecord(5, 'all', '333');
    await tick();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(runs() - before).toBe(1);

    a.solves = edited(a.solves, 'p99990', { penalty: '+2' }); // o tempo muda: uma conta só, para todas
    await tick();
    expect(runs() - before).toBe(2);
    a.openSolve('p99990', 'all');
    await tick();
    expect(runs() - before).toBe(2);
  }, 60_000);
});
