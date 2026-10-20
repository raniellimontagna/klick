import { describe, expect, it } from 'vitest';
import { parseTyped, previewTyped } from '../../src/core/typed';

describe('parseTyped', () => {
  it.each([
    ['1234', 12340, null],
    ['10234', 62340, null],
    ['12.34', 12340, null],
    ['12,34', 12340, null],
    ['1:02.34', 62340, null],
    ['12.34+', 12340, '+2'],
    ['1234+', 12340, '+2'],
  ] as const)('aceita %s', (text, ms, penalty) => {
    expect(parseTyped(text)).toEqual({ ok: true, ms, penalty });
  });

  it('DNF vale em qualquer caixa e fica com ms 0', () => {
    for (const t of ['dnf', 'DNF', 'DnF', '  dnf ']) expect(parseTyped(t)).toEqual({ ok: true, ms: 0, penalty: 'DNF' });
  });

  it('apara os espaços e aceita poucos dígitos', () => {
    expect(parseTyped('  12.34  ')).toEqual({ ok: true, ms: 12340, penalty: null });
    expect(parseTyped('5')).toEqual({ ok: true, ms: 50, penalty: null });
    expect(parseTyped('123')).toEqual({ ok: true, ms: 1230, penalty: null });
    expect(parseTyped('9.5')).toEqual({ ok: true, ms: 9500, penalty: null });
    expect(parseTyped('1:02')).toEqual({ ok: true, ms: 62000, penalty: null });
    expect(parseTyped('75.12')).toEqual({ ok: true, ms: 75120, penalty: null });
  });

  it.each(['', '   ', 'abc', '1:2:3', '60:00.00', '1:75.00', '1:60.00', '0', '0000', '12.', '.5', '1.234', '+', 'dnf+', '--1', '123456789012'])(
    'recusa %j',
    (text) => {
      expect(parseTyped(text)).toEqual({ ok: false });
    },
  );

  it('recusa uma hora ou mais, mesmo pelos dígitos', () => {
    expect(parseTyped('600000')).toEqual({ ok: false }); // 60:00.00
    expect(parseTyped('59:59.99')).toEqual({ ok: true, ms: 3599990, penalty: null });
    expect(parseTyped('595999')).toEqual({ ok: true, ms: 3599990, penalty: null });
  });
});

describe('previewTyped', () => {
  it('mostra o tempo como a tela mostra, com o + e o DNF', () => {
    expect(previewTyped('1234')).toBe('0:12.34');
    expect(previewTyped('10234')).toBe('1:02.34');
    expect(previewTyped('12.34+')).toBe('0:12.34+');
    expect(previewTyped('dnf')).toBe('DNF');
  });

  it('é null para vazio e para o que não vale', () => {
    expect(previewTyped('')).toBeNull();
    expect(previewTyped('  ')).toBeNull();
    expect(previewTyped('abc')).toBeNull();
    expect(previewTyped('60:00.00')).toBeNull();
  });
});
