import { describe, expect, it } from 'vitest';
import { EVENTS, EVENT_IDS, eventFromCsTimer, eventInfo } from '../../src/core/events';

describe('catálogo de eventos', () => {
  it('tem os 13 eventos na ordem do produto', () => {
    expect(EVENT_IDS).toEqual(['333', '222', '444', '555', '666', '777', '333oh', '333bf', 'minx', 'pyram', 'skewb', 'sq1', 'clock']);
    expect(EVENTS).toHaveLength(13);
  });

  it('3BLD não tem inspeção; os outros têm', () => {
    for (const e of EVENTS) expect(e.inspection).toBe(e.id !== '333bf');
  });

  it('6×6 e 7×7 usam Mo3; os outros, Ao5', () => {
    for (const e of EVENTS) expect(e.average).toBe(e.id === '666' || e.id === '777' ? 'mo3' : 'ao5');
  });

  it('só o 3×3 tem marcos', () => {
    expect(EVENTS.filter((e) => e.milestones).map((e) => e.id)).toEqual(['333']);
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
