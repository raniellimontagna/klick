import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_IDS, countsForMilestones, eventFromCsTimer, eventInfo } from '../../src/core/events';
import type { EventId } from '../../src/core/types';

describe('catálogo de eventos', () => {
  it('tem os 13 eventos na ordem do produto', () => {
    expect(EVENT_IDS).toEqual(['333', '222', '444', '555', '666', '777', '333oh', '333bf', 'minx', 'pyram', 'skewb', 'sq1', 'clock']);
    expect(EVENTS).toHaveLength(13);
  });

  it('3BLD não tem inspeção; os outros têm', () => {
    for (const e of EVENTS) expect(e.inspection).toBe(e.id !== '333bf');
  });

  it('6×6, 7×7 e 3BLD usam Mo3; os outros, Ao5', () => {
    const mo3 = ['666', '777', '333bf'];
    for (const e of EVENTS) expect(e.average).toBe(mo3.includes(e.id) ? 'mo3' : 'ao5');
  });

  it('só o 3×3 tem marcos', () => {
    expect(EVENTS.filter((e) => e.milestones).map((e) => e.id)).toEqual(['333']);
  });

  it('countsForMilestones: o 3×3 conta; os outros e um id que o catálogo não conhece, não (sem lançar)', () => {
    expect(countsForMilestones('333')).toBe(true);
    expect(countsForMilestones('222')).toBe(false);
    expect(() => countsForMilestones('fto' as EventId)).not.toThrow();
    expect(countsForMilestones('fto' as EventId)).toBe(false);
  });

  it('ids do cubing.js, peças do twisty e tipos do csTimer batem', () => {
    expect(eventInfo('minx')).toMatchObject({ scrambleId: 'minx', puzzle: 'megaminx', csTimer: 'mgmp', name: 'Megaminx' });
    expect(eventInfo('sq1')).toMatchObject({ scrambleId: 'sq1', puzzle: 'square1', csTimer: 'sqrs', name: 'Square-1' });
    expect(eventInfo('333bf')).toMatchObject({ scrambleId: '333bf', puzzle: '3x3x3', csTimer: '333ni', short: '3BLD' });
    expect(eventInfo('222')).toMatchObject({ puzzle: '2x2x2', csTimer: '222so', short: '2×2' });
  });

  it('reconhece o tipo de embaralhamento do csTimer', () => {
    expect(eventFromCsTimer(undefined)).toBe('333');
    expect(eventFromCsTimer('333')).toBe('333');
    expect(eventFromCsTimer('444wca')).toBe('444');
    expect(eventFromCsTimer('clkwca')).toBe('clock');
    expect(eventFromCsTimer('333ni')).toBe('333bf');
    expect(eventFromCsTimer('zbll')).toBeNull();
  });

  it('id desconhecido lança erro', () => {
    expect(() => eventInfo('fto' as never)).toThrow();
  });
});

// A tabela do produto, escrita à mão e separada do catálogo: id, nome, rótulo curto e o que o cubing.js (scrambleId),
// o twisty-player (puzzle) e o importador do csTimer (csTimer) leem de cada evento. Um erro de digitação num desses
// campos só apareceria na tela (imagem em branco, embaralhamento que não sai, sessão importada sem evento).
const TABELA: [id: EventId, name: string, short: string, scrambleId: string, puzzle: string, csTimer: string][] = [
  ['333', '3×3', '3×3', '333', '3x3x3', '333'],
  ['222', '2×2', '2×2', '222', '2x2x2', '222so'],
  ['444', '4×4', '4×4', '444', '4x4x4', '444wca'],
  ['555', '5×5', '5×5', '555', '5x5x5', '555wca'],
  ['666', '6×6', '6×6', '666', '6x6x6', '666wca'],
  ['777', '7×7', '7×7', '777', '7x7x7', '777wca'],
  ['333oh', '3×3 com uma mão', '3×3 OH', '333oh', '3x3x3', '333oh'],
  ['333bf', '3×3 às cegas', '3BLD', '333bf', '3x3x3', '333ni'],
  ['minx', 'Megaminx', 'Megaminx', 'minx', 'megaminx', 'mgmp'],
  ['pyram', 'Pyraminx', 'Pyraminx', 'pyram', 'pyraminx', 'pyrso'],
  ['skewb', 'Skewb', 'Skewb', 'skewb', 'skewb', 'skbso'],
  ['sq1', 'Square-1', 'Square-1', 'sq1', 'square1', 'sqrs'],
  ['clock', 'Clock', 'Clock', 'clock', 'clock', 'clkwca'],
];

describe('catálogo de eventos conferido com a tabela do produto', () => {
  it('a tabela cobre os mesmos 13 eventos, na mesma ordem', () => {
    expect(TABELA.map((linha) => linha[0])).toEqual([...EVENT_IDS]);
  });

  it.each(TABELA)('%s tem nome, rótulo, ids do cubing.js e do twisty e tipo do csTimer da tabela', (id, name, short, scrambleId, puzzle, csTimer) => {
    expect(eventInfo(id)).toMatchObject({ id, name, short, scrambleId, puzzle, csTimer });
    expect(eventFromCsTimer(csTimer)).toBe(id);
  });

  it('tipo vazio do csTimer vale 3×3, como o tipo ausente', () => {
    expect(eventFromCsTimer('')).toBe('333');
  });
});
