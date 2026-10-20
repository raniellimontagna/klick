import { describe, expect, it } from 'vitest';
import { parseTyped, previewTyped, tooLong } from '../../src/core/typed';

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
  it('devolve o tempo como a tela mostra e, no +2, o tempo cru', () => {
    expect(previewTyped('1234')).toEqual({ time: '0:12.34', plus2: false, raw: '0:12.34' });
    expect(previewTyped('10234')).toEqual({ time: '1:02.34', plus2: false, raw: '1:02.34' });
    // O +2 soma os 2 s ao tempo mostrado e guarda o cru ("Fica 0:14.34+: 0:12.34 mais 2 s de penalidade").
    expect(previewTyped('12.34+')).toEqual({ time: '0:14.34+', plus2: true, raw: '0:12.34' });
    expect(previewTyped('dnf')).toEqual({ time: 'DNF', plus2: false, raw: '' });
  });

  it('é null para vazio e para o que não vale', () => {
    expect(previewTyped('')).toBeNull();
    expect(previewTyped('  ')).toBeNull();
    expect(previewTyped('abc')).toBeNull();
    expect(previewTyped('60:00.00')).toBeNull();
  });
});

describe('tooLong', () => {
  it.each(['1:02:03.45', '1:02:03', '60:00.00', '60:00', '100:00.00', '999:59.99', '600000', '1020345', '10000000', '3600.00', '99999,99', '60:00.00+'])(
    'diz que %s passa de uma hora',
    (text) => {
      expect(parseTyped(text)).toEqual({ ok: false });
      expect(tooLong(text)).toBe(true);
    },
  );

  it.each(['', 'abc', '12.3.4', '7512', '6000', '1:75.00', '0', '0000', '000000000', '12.', '59:59.99', '595999', '75.12', '1234', 'dnf'])(
    'não diz isso de %j',
    (text) => {
      expect(tooLong(text)).toBe(false);
    },
  );
});
