import { render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { Solve } from '../../src/core/types';
import { weekRows } from '../../src/core/weeks';
import { T } from '../../src/strings';
import WeeksBoard from '../../src/ui/evolucao/WeeksBoard.svelte';
import { weekLabel } from '../../src/ui/format';

// weekRows de verdade, com um espião: conta as contas e deixa um teste mandar a linha que quiser.
vi.mock('../../src/core/weeks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/core/weeks')>();
  return { ...actual, weekRows: vi.fn(actual.weekRows) };
});

// O quadro "Semanas" da Evolução (a maquete aprovada, 1a–1c, 6a, 6c e 7a): a tabela das 12 semanas e a linha dos últimos 28 dias.
// Datas locais (new Date(ano, mês, dia, hora)): o fuso é o do aparelho, como no código.
const at = (m: number, d: number, h = 12) => new Date(2026, m, d, h).getTime();
const NOW = at(9, 21); // quarta, 21/10/2026: a semana atual começa em 19/10
let id = 0;
const sv = (ms: number, when: number, penalty: Solve['penalty'] = null): Solve => ({
  id: String(++id), sessionId: 's1', event: '333', ms, penalty, at: when, scramble: '', note: '', createdAt: when, updatedAt: when, deletedAt: null,
});
// cinco tempos iguais (média e melhor = ms) em um dia
const five = (ms: number, when: number): Solve[] => [0, 1, 2, 3, 4].map(() => sv(ms, when));

const table = () => screen.getByRole('table', { name: T.semanas.title });
const rows = () => within(table()).getAllByRole('row').slice(1); // sem o cabeçalho
const cells = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => c.textContent);

describe('weekLabel', () => {
  it('weekLabel no mesmo mês e entre meses', () => {
    expect(weekLabel(at(9, 12, 0))).toBe('12–18 out');
    expect(weekLabel(at(8, 28, 0))).toBe('28 set–4 out');
    expect(weekLabel(at(11, 28, 0))).toBe('28 dez–3 jan');
    expect(weekLabel(at(7, 3, 0))).toBe('3–9 ago');
  });
});

describe('o quadro Semanas', () => {
  it('Esta semana primeiro, com solves, DNF, média, melhor e mudança', () => {
    const pool = [...five(14000, at(9, 13)), ...five(13000, at(9, 20)), sv(8000, at(9, 21), 'DNF'), sv(12000, at(9, 21), '+2')];
    render(WeeksBoard, { pool, now: NOW });
    expect(screen.getByRole('heading', { name: T.semanas.title })).toBeInTheDocument();
    expect(screen.getByText(T.semanas.scope)).toBeInTheDocument();
    expect(within(table()).getAllByRole('columnheader').map((c) => c.textContent)).toEqual(['Semana', 'Solves', 'Média', 'Melhor', 'Mudança']);
    const [cur, prev] = rows();
    expect(within(cur!).getByRole('rowheader').textContent).toBe('Esta semana');
    // 7 solves, um DNF; os 6 válidos (13 s × 5 e o +2 de 14 s) perdem o menor e o maior no corte de 5%: média 13.00, 1.00 s abaixo da semana anterior
    expect(cells(cur!)).toEqual(['7 solves · 1 DNF', '0:13.00', 'melhor 0:13.00', '▼ 1.00 s mais rápida']);
    expect(within(prev!).getByRole('rowheader').textContent).toBe('12–18 out');
    expect(cells(prev!)).toEqual(['5 solves', '0:14.00', 'melhor 0:14.00', '—']);
    expect(screen.getByText(T.semanas.rule)).toBeInTheDocument();
  });

  it('a mudança: ▲ mais lenta, igual e — em cinza', () => {
    const pool = [...five(14000, at(9, 6)), ...five(14000, at(9, 13)), ...five(15000, at(9, 20))];
    render(WeeksBoard, { pool, now: NOW });
    const [cur, mid, old] = rows();
    expect(cells(cur!)[3]).toBe('▲ 1.00 s mais lenta');
    expect(cur!.querySelector('.es-c')!.getAttribute('data-d')).toBe('up');
    expect(cells(mid!)[3]).toBe('igual');
    expect(mid!.querySelector('.es-c')!.getAttribute('data-d')).toBe('same');
    expect(cells(old!)[3]).toBe('—');
    expect(old!.querySelector('.es-c')!.getAttribute('data-d')).toBe('none');
  });

  // As médias saem no centésimo; uma mudança abaixo dele (que o centésimo não mostra) é "igual", não "▼ 0.00 s".
  it('a mudança abaixo de 1 centésimo é igual', () => {
    const row = (change: number) => ({ start: at(9, 19, 0), current: true, count: 5, dnf: 0, mean: 10_000, best: 10_000, change });
    const pool = five(10_000, at(9, 20));
    for (const [change, text, d] of [[9, 'igual', 'same'], [-9, 'igual', 'same'], [0, 'igual', 'same'], [-10, '▼ 0.01 s mais rápida', 'down'], [10, '▲ 0.01 s mais lenta', 'up']] as const) {
      vi.mocked(weekRows).mockReturnValueOnce([row(change)]);
      const { unmount } = render(WeeksBoard, { pool: [...pool], now: NOW });
      expect(cells(rows()[0]!)[3], String(change)).toBe(text);
      expect(rows()[0]!.querySelector('.es-c')!.getAttribute('data-d')).toBe(d);
      unmount();
    }
  });

  // O relógio da Evolução anda a cada minuto: no mesmo dia e com a mesma lista, as semanas não são refeitas.
  it('o quadro refaz as semanas só quando a lista ou o dia mudam', async () => {
    const pool = five(14000, at(9, 20));
    vi.mocked(weekRows).mockClear();
    const { rerender } = render(WeeksBoard, { pool, now: NOW });
    expect(vi.mocked(weekRows)).toHaveBeenCalledTimes(1);
    await rerender({ pool, now: NOW + 60_000 });
    await rerender({ pool, now: NOW + 5 * 3_600_000 });
    expect(vi.mocked(weekRows)).toHaveBeenCalledTimes(1);
    await rerender({ pool, now: at(9, 22) });
    expect(vi.mocked(weekRows)).toHaveBeenCalledTimes(2);
    await rerender({ pool: [...pool], now: at(9, 22) });
    expect(vi.mocked(weekRows)).toHaveBeenCalledTimes(3);
    expect(cells(rows()[0]!)).toEqual(['5 solves', '0:14.00', 'melhor 0:14.00', '—']);
  });

  it('semana vazia diz sem solves', () => {
    const pool = [...five(14000, at(9, 6)), sv(12000, at(9, 21))];
    render(WeeksBoard, { pool, now: NOW });
    const [cur, mid, old] = rows();
    // a semana de 12/10 não tem solve: a linha aparece vazia, para o ritmo ficar visível
    expect(within(mid!).getByRole('rowheader').textContent).toBe('12–18 out');
    expect(cells(mid!)).toEqual(['sem solves', '', '', '']);
    expect(mid!.hasAttribute('data-empty')).toBe(true);
    expect(cells(cur!)[0]).toBe('1 solve');
    expect(cells(cur!)[1]).toBe('—'); // com menos de 5 solves a média é "—"
    expect(cells(cur!)[2]).toBe('melhor 0:12.00');
    expect(within(old!).getByRole('rowheader').textContent).toBe('5–11 out');
  });

  it('uma semana só de DNF mostra os solves e DNF e "—" na média e no melhor; a atual vazia fica no topo', () => {
    const pool = [sv(9000, at(9, 6), 'DNF'), sv(9000, at(9, 7), 'DNF'), sv(9000, at(9, 8), 'DNF')];
    render(WeeksBoard, { pool, now: NOW });
    const list = rows();
    expect(within(list[0]!).getByRole('rowheader').textContent).toBe('Esta semana');
    expect(cells(list[0]!)[0]).toBe('sem solves');
    expect(cells(list[2]!)).toEqual(['3 solves · 3 DNF', '—', 'melhor —', '—']);
  });

  it('o losango marca o recorde', () => {
    const pool = [sv(9000, at(9, 13)), ...five(14000, at(9, 14)), ...five(14000, at(9, 20))]; // em ordem, como a Evolução a passa
    render(WeeksBoard, { pool, now: NOW });
    const [cur, prev] = rows();
    expect(within(prev!).getByRole('img', { name: T.semanas.record })).toBeInTheDocument();
    expect(within(cur!).queryByRole('img', { name: T.semanas.record })).toBeNull();
  });

  it('resumo caiu, subiu e igual; some sem dado', () => {
    // 28 dias de 24/09 a 21/10; os 28 antes: de 27/08 a 23/09
    const sum = () => document.querySelector('.es-sum');
    const fell = render(WeeksBoard, { pool: [...five(15000, at(8, 1)), ...five(14000, at(9, 10))], now: NOW });
    expect(sum()!.textContent).toBe('Nos últimos 28 dias, sua média caiu 1.00 s.');
    expect(sum()!.querySelector('b')!.textContent).toBe('1.00 s');
    fell.unmount();
    const rose = render(WeeksBoard, { pool: [...five(14000, at(8, 1)), ...five(15500, at(9, 10))], now: NOW });
    expect(sum()!.textContent).toBe('Nos últimos 28 dias, sua média subiu 1.50 s.');
    rose.unmount();
    const same = render(WeeksBoard, { pool: [...five(14000, at(8, 1)), ...five(14000, at(9, 10))], now: NOW });
    expect(sum()!.textContent).toBe('Nos últimos 28 dias, sua média ficou igual.');
    expect(sum()!.querySelector('b')).toBeNull();
    same.unmount();
    render(WeeksBoard, { pool: five(14000, at(9, 10)), now: NOW });
    expect(sum()).toBeNull();
    expect(table()).toBeInTheDocument();
  });

  it('sem solves nas 12 semanas o quadro some', () => {
    const { container } = render(WeeksBoard, { pool: five(14000, at(5, 1)), now: NOW }); // junho: mais de 12 semanas atrás
    expect(container.querySelector('section')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    render(WeeksBoard, { pool: [], now: NOW });
    expect(screen.queryByRole('table')).toBeNull();
  });
});
