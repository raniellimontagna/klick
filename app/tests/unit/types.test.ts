import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, defaultSettings } from '../../src/core/types';

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
      centro: 'animado',
    });
  });

  it('são congelados, inclusive o grupo de sons, para uma cópia não alterar o padrão', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_SETTINGS.sound)).toBe(true);
  });
});

describe('defaultSettings', () => {
  it('devolve uma cópia nova com os valores padrão, que se pode alterar', () => {
    const copy = defaultSettings();
    expect(copy).toEqual(DEFAULT_SETTINGS);
    expect(Object.isFrozen(copy)).toBe(false);
    expect(Object.isFrozen(copy.sound)).toBe(false);
    expect(copy).not.toBe(DEFAULT_SETTINGS);
    expect(copy.sound).not.toBe(DEFAULT_SETTINGS.sound);
  });

  it('alterar a cópia, inclusive o grupo de sons, não toca no padrão nem nas próximas cópias', () => {
    const copy = defaultSettings();
    copy.holdMs = 500;
    copy.theme = 'dark';
    copy.sound.klick = false;
    expect([copy.holdMs, copy.theme, copy.sound.klick]).toEqual([500, 'dark', false]);
    expect([DEFAULT_SETTINGS.holdMs, DEFAULT_SETTINGS.theme, DEFAULT_SETTINGS.sound.klick]).toEqual([300, 'system', true]);
    const next = defaultSettings();
    expect(next).toEqual(DEFAULT_SETTINGS);
    expect(next.sound).not.toBe(copy.sound);
  });
});
