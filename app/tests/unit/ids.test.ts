import { describe, expect, it } from 'vitest';
import { newId } from '../../src/data/ids';

// O contador do newId é estado do módulo: dois testes que usam o mesmo `now` enxergam o contador um do outro. Os testes que
// olham o contador pedem um `now` que nenhum outro usa (o passo de 10 também deixa livre o now + 1), e assim passam em
// qualquer ordem e sozinhos, com -t.
let clock = 1_800_000_000_000;
const unusedNow = (): number => (clock += 10);

describe('newId', () => {
  it('tem 17 caracteres e só letras minúsculas e dígitos', () => {
    expect(newId(1791500000000, () => 0.5)).toMatch(/^[0-9a-z]{17}$/);
  });
  it('ordena por tempo', () => {
    const a = newId(1000, () => 0.9);
    const b = newId(2000, () => 0.1);
    expect([b, a].sort()).toEqual([a, b]);
  });
  it('no mesmo milissegundo, ordena pela ordem de criação', () => {
    const ids = Array.from({ length: 50 }, () => newId(5000, () => Math.random()));
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(50);
  });

  it('guarda o tempo nos 9 primeiros caracteres, em base 36, e o contador volta a zero a cada milissegundo novo', () => {
    const now = unusedNow();
    const a = newId(now, () => 0);
    expect(a).toBe(`${now.toString(36).padStart(9, '0')}00000000`);
    expect(newId(now, () => 0).slice(9, 11)).toBe('01');
    expect(newId(now + 1, () => 0).slice(9, 11)).toBe('00');
    expect(newId(0, () => 0)).toBe('0'.repeat(17));
  });

  it('o sufixo aleatório usa a faixa inteira e nunca muda o tamanho, mesmo com um rand fora de [0, 1)', () => {
    expect(newId(7000, () => 0).slice(11)).toBe('000000');
    expect(newId(7001, () => 0.999999999999).slice(11)).toBe('zzzzzz');
    expect(newId(7002, () => 1)).toMatch(/^[0-9a-z]{17}$/);
    expect(newId(7003, () => -1)).toMatch(/^[0-9a-z]{17}$/);
    expect(newId(7004, () => Number.NaN)).toMatch(/^[0-9a-z]{17}$/);
  });

  it('passando de 1296 ids no mesmo milissegundo, o tamanho se mantém e a ordem entre milissegundos também', () => {
    const now = unusedNow();
    const ids = Array.from({ length: 1400 }, () => newId(now, () => 0.5));
    expect(ids.every((id) => /^[0-9a-z]{17}$/.test(id))).toBe(true);
    expect(ids.slice(0, 1296)).toEqual([...ids.slice(0, 1296)].sort());
    expect(newId(now + 1, () => 0) > ids[1399]).toBe(true);
  });
});
