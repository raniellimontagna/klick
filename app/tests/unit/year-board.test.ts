import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import type { EventId, Solve } from '../../src/core/types';
import { T } from '../../src/strings';
import YearBoard from '../../src/ui/evolucao/YearBoard.svelte';

// O ano de treino da Evolução (a maquete aprovada, 1b, 1c, 2a, 6c e 7b): 53 colunas de seg a dom, os totais e as sequências.
// Datas locais (new Date(ano, mês, dia, hora)): o fuso é o do aparelho, como no código.
const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).getTime();
const NOW = at(2026, 9, 21); // quarta, 21/10/2026: a primeira coluna começa em 20/10/2025
let id = 0;
const sv = (when: number, event: EventId = '333', sessionId = 's1'): Solve => ({
  id: String(++id), sessionId, event, ms: 12000, penalty: null, at: when, scramble: '', note: '', createdAt: when, updatedAt: when, deletedAt: null,
});
const many = (n: number, when: number, event: EventId = '333'): Solve[] => Array.from({ length: n }, () => sv(when, event));
// um solve por dia, de `from` a `to` (inclusive, pelo calendário: os dias andam pelo meio-dia, que o horário de verão não pula)
const run = (from: Date, to: Date): Solve[] => {
  const out: Solve[] = [];
  const end = at(to.getFullYear(), to.getMonth(), to.getDate());
  for (const d = new Date(at(from.getFullYear(), from.getMonth(), from.getDate())); d.getTime() <= end; d.setDate(d.getDate() + 1)) {
    out.push(sv(at(d.getFullYear(), d.getMonth(), d.getDate())));
  }
  return out;
};

const cells = () => [...document.querySelectorAll<HTMLElement>('.es-cal-g i')];
const stat = (name: string) => screen.getByText(name).closest('div')!;

// Os dados da maquete: sequência atual de 6 dias (16 a 21/10), a maior de 23 (10/08 a 01/09), um dia com 2 solves em novembro e um com 1.200 em
// dezembro de 2025 (o ponto de milhar).
const history = (): Solve[] => [
  ...run(new Date(2026, 9, 16), new Date(2026, 9, 21)),
  ...run(new Date(2026, 7, 10), new Date(2026, 8, 1)),
  ...many(2, at(2025, 10, 12)),
  ...many(1200, at(2025, 11, 3)),
];

describe('o ano de treino', () => {
  it('53 colunas, níveis e hoje com o anel', () => {
    const pool = [sv(at(2026, 9, 1)), ...many(5, at(2026, 9, 2)), ...many(15, at(2026, 9, 3)), ...many(3, NOW)];
    render(YearBoard, { solves: pool, now: NOW });
    expect(screen.getByRole('heading', { name: T.constancia.title })).toBeInTheDocument();
    expect(screen.getByText(T.constancia.scope)).toBeInTheDocument();
    // 53 × 7 quadradinhos; hoje é quarta: quinta a domingo da última coluna ainda não existem (somem sem sumir da grade)
    expect(cells()).toHaveLength(371);
    expect(document.querySelectorAll('.es-cal-g i.fut')).toHaveLength(4);
    expect(cells()[370]!.className).toBe('fut');
    // 01/10 é quinta (coluna 50, linha 4): 1 solve, 5 solves, 15 solves
    const col = (w: number) => cells().slice(w * 7, w * 7 + 7).map((c) => c.className);
    expect(col(49)).toEqual(['', '', '', 'l1', 'l2', 'l3', '']);
    // hoje (quarta) leva o anel, no tom do dia
    expect(col(52)).toEqual(['', '', 'l1 today', 'fut', 'fut', 'fut', 'fut']);
    expect(document.querySelectorAll('.es-cal-g i.today')).toHaveLength(1);
    // a grade é só desenho; os dias da semana e os meses sobre a coluna em que cada mês começa (a segunda dentro do mês)
    expect(document.querySelector('.es-cal')!.getAttribute('aria-hidden')).toBe('true');
    expect([...document.querySelectorAll('.es-cal-d span')].map((s) => s.textContent)).toEqual(['seg', '', 'qua', '', 'sex', '', '']);
    const months = [...document.querySelectorAll<HTMLElement>('.es-cal-m span')];
    expect(months.map((s) => s.textContent)).toEqual(['out', 'nov', 'dez', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out']);
    expect(months.map((s) => s.style.gridColumn)).toEqual(['1', '3', '7', '12', '16', '20', '25', '29', '33', '38', '42', '47', '51']);
    // a legenda e os números de baixo
    expect(document.querySelector('.es-legend')!.textContent).toBe('menosmais');
    expect(document.querySelectorAll('.es-legend i')).toHaveLength(4);
    expect(document.querySelector('.es-legend')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('o texto do leitor com período, totais, sequências e um item por mês', () => {
    render(YearBoard, { solves: history(), now: NOW });
    const p = document.querySelector('p.sr-only')!;
    expect(p.textContent).toBe(
      'Calendário de 20/10/2025 a 21/10/2026, todos os eventos: 31 dias com solves, 1.231 solves. Sequência atual: 6 dias. Maior sequência: 23 dias, de 10/08 a 01/09.',
    );
    const items = [...document.querySelectorAll('ul.sr-only li')].map((li) => li.textContent);
    expect(items).toHaveLength(13);
    expect(items[0]).toBe('outubro de 2025: nenhum solve');
    expect(items[1]).toBe('novembro de 2025: 1 dia, 2 solves');
    expect(items[2]).toBe('dezembro de 2025: 1 dia, 1.200 solves');
    expect(items[10]).toBe('agosto de 2026: 22 dias, 22 solves');
    expect(items[12]).toBe('outubro de 2026: 6 dias, 6 solves');
    // os números de baixo: sequência atual (desde), maior (de dia a dia) e dias treinados (de quantos)
    expect(within(stat('Sequência atual')).getByText('6 dias')).toBeInTheDocument();
    expect(stat('Sequência atual').querySelector('em')!.textContent).toBe('desde 16/10');
    expect(stat('Maior sequência').querySelector('dd')!.firstChild!.textContent).toBe('23 dias');
    expect(stat('Maior sequência').querySelector('em')!.textContent).toBe('10/08 a 01/09');
    expect(stat('Dias treinados').querySelector('dd')!.firstChild!.textContent).toBe('31 dias');
    expect(stat('Dias treinados').querySelector('em')!.textContent).toBe('de 367');
  });

  it('sequência de 1 dia no singular e sequência 0 sem a linha de baixo', () => {
    render(YearBoard, { solves: [sv(NOW), sv(at(2026, 9, 1))], now: NOW });
    expect(stat('Sequência atual').querySelector('dd')!.firstChild!.textContent).toBe('1 dia');
    expect(stat('Dias treinados').querySelector('dd')!.firstChild!.textContent).toBe('2 dias');
    expect(document.querySelector('p.sr-only')!.textContent).toContain('2 dias com solves, 2 solves. Sequência atual: 1 dia. Maior sequência: 1 dia, de 21/10 a 21/10.');
  });

  it('sequência atual 0: o valor "0 dias" e nada embaixo', () => {
    render(YearBoard, { solves: [sv(at(2026, 9, 10))], now: NOW });
    const cur = stat('Sequência atual');
    expect(cur.querySelector('dd')!.textContent).toBe('0 dias');
    expect(cur.querySelector('em')).toBeNull();
    expect(stat('Maior sequência').querySelector('em')!.textContent).toBe('10/10 a 10/10');
    expect(document.querySelector('p.sr-only')!.textContent).toContain('Sequência atual: 0 dias. Maior sequência: 1 dia, de 10/10 a 10/10.');
  });

  it('a dica mostra a data e os solves do dia e some ao sair', async () => {
    render(YearBoard, { solves: history(), now: NOW });
    expect(document.querySelector('.es-tip')).toBeNull();
    // o toque: abre no dia, toca de novo e fecha; 12/11/2025 é quarta (índice 23 da grade: 23 dias depois de 20/10)
    await fireEvent.click(cells()[23]!);
    const tip = document.querySelector('.es-tip')!;
    expect(tip.textContent).toBe('2 solves · qua, 12/11/2025');
    expect(tip.querySelector('b')!.textContent).toBe('2 solves');
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    await fireEvent.click(cells()[23]!);
    expect(document.querySelector('.es-tip')).toBeNull();
    // o mouse por cima: abre ao entrar, troca de dia e some ao sair da grade
    await fireEvent(cells()[0]!, new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    expect(document.querySelector('.es-tip')!.textContent).toBe('nenhum solve · seg, 20/10/2025');
    await fireEvent(cells()[366]!, new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    expect(document.querySelector('.es-tip')!.textContent).toBe('1 solve · qua, 21/10/2026');
    await fireEvent(document.querySelector('.es-cal-g')!, new PointerEvent('pointerleave', { pointerType: 'mouse' }));
    expect(document.querySelector('.es-tip')).toBeNull();
  });

  it('a dica some ao tocar fora, ao rolar, e o dia futuro não tem dica', async () => {
    render(YearBoard, { solves: history(), now: NOW });
    await fireEvent.click(cells()[23]!);
    expect(document.querySelector('.es-tip')).not.toBeNull();
    await fireEvent.pointerDown(document.body);
    expect(document.querySelector('.es-tip')).toBeNull();
    await fireEvent.click(cells()[24]!);
    expect(document.querySelector('.es-tip')!.textContent).toBe('nenhum solve · qui, 13/11/2025');
    await fireEvent.scroll(document.querySelector('.es-cal-s')!);
    expect(document.querySelector('.es-tip')).toBeNull();
    await fireEvent.click(cells()[370]!); // domingo, 25/10/2026: ainda não chegou
    expect(document.querySelector('.es-tip')).toBeNull();
  });

  it('maior sequência fora do período mostra o ano', () => {
    render(YearBoard, { solves: [...run(new Date(2025, 0, 10), new Date(2025, 0, 15)), sv(NOW)], now: NOW });
    expect(stat('Maior sequência').querySelector('dd')!.firstChild!.textContent).toBe('6 dias');
    expect(stat('Maior sequência').querySelector('em')!.textContent).toBe('10/01/2025 a 15/01/2025');
    expect(document.querySelector('p.sr-only')!.textContent).toContain('Maior sequência: 6 dias, de 10/01/2025 a 15/01/2025.');
  });

  it('sequência atual que começou antes do período mostra o ano, como a maior', () => {
    render(YearBoard, { solves: run(new Date(2025, 9, 1), new Date(2026, 9, 21)), now: NOW });
    expect(stat('Sequência atual').querySelector('em')!.textContent).toBe('desde 01/10/2025');
    expect(stat('Maior sequência').querySelector('em')!.textContent).toBe('01/10/2025 a 21/10/2026');
  });

  // A dica é de um dia da grade de agora: com outro dia (o relógio da Evolução virou a meia-noite) ou outro calendário, ela some.
  it('a dica some quando o dia ou o calendário mudam', async () => {
    const solves = history();
    const { rerender } = render(YearBoard, { solves, now: NOW });
    await fireEvent.click(cells()[23]!);
    expect(document.querySelector('.es-tip')).not.toBeNull();
    await rerender({ solves, now: NOW + 60_000 }); // o mesmo dia: fica
    expect(document.querySelector('.es-tip')).not.toBeNull();
    await rerender({ solves, now: at(2026, 9, 22) });
    expect(document.querySelector('.es-tip')).toBeNull();
    await fireEvent.click(cells()[23]!);
    expect(document.querySelector('.es-tip')).not.toBeNull();
    await rerender({ solves: [...solves, sv(at(2026, 9, 22))], now: at(2026, 9, 22) });
    expect(document.querySelector('.es-tip')).toBeNull();
  });

  it('conta todos os eventos, não o filtro', () => {
    const pool = [...many(3, NOW, '333'), ...many(2, NOW, '222'), sv(at(2026, 9, 20), '444', 's2')];
    render(YearBoard, { solves: pool, now: NOW });
    expect(document.querySelector('p.sr-only')!.textContent).toContain('2 dias com solves, 6 solves. Sequência atual: 2 dias.');
  });

  it('sem solve nenhum, o quadro não aparece', () => {
    render(YearBoard, { solves: [], now: NOW });
    expect(screen.queryByRole('heading', { name: T.constancia.title })).toBeNull();
  });
});
