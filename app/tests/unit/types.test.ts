import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/core/types';

describe('ajustes padrão', () => {
  it('trazem os valores do produto', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      inspection: true,
      holdMs: 300,
      mobileArm: 'two',
      theme: 'system',
      sound: { klick: true, insp: true, pb: true },
      silent: false,
      reducedMotion: 'system',
      dailyGoal: 20,
      scrambleImage: true,
    });
  });

  it('são congelados, inclusive o grupo de sons, para uma cópia não alterar o padrão', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.sound)).toBe(true);
  });
});
