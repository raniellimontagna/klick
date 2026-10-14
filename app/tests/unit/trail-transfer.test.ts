import { describe, expect, it } from 'vitest';
import type { Practice } from '../../src/core/types';
import { parseKlickJson } from '../../src/data/transfer';

const base = { format: 'klick', version: 1, exportedAt: 1, sessions: [], solves: [], profile: null };
const good: Practice = { id: 'p1', caseId: 'oll2-sune', ms: 2400, ok: true, helped: false, at: 1_791_500_000_000 };
const withPractice = (practice: unknown) => JSON.stringify({ ...base, practice });
const withProfile = (profile: unknown) => JSON.stringify({ ...base, profile });

describe('treino no arquivo do Klick: o que não vale fica de fora, o arquivo entra (spec 9.3)', () => {
  it('a tentativa válida passa intacta, inclusive campos que o Klick ainda não conhece', () => {
    const extra = { ...good, device: 'x' };
    expect(parseKlickJson(withPractice([good, extra])).practice).toEqual([good]); // o id repetido: fica a primeira
    expect(parseKlickJson(withPractice([extra])).practice).toEqual([extra]);
  });

  it('caso desconhecido, tempo inválido ou campo faltando: a tentativa sai, as outras ficam', () => {
    const bad = [
      { ...good, id: 'a', caseId: 'oll2-nada' },
      { ...good, id: 'b', ms: -1 },
      { ...good, id: 'c', ms: '2400' },
      { ...good, id: 'd', ok: 'sim' },
      { ...good, id: 'e', helped: undefined },
      { ...good, id: 'f', at: null },
      { ...good, id: '' },
      'texto',
      null,
    ];
    expect(parseKlickJson(withPractice([...bad, { ...good, id: 'ok' }])).practice).toEqual([{ ...good, id: 'ok' }]);
  });

  it('um arquivo de antes do treino não ganha a lista; uma lista que não é lista é ignorada', () => {
    expect('practice' in parseKlickJson(JSON.stringify(base))).toBe(false);
    expect('practice' in parseKlickJson(withPractice({ id: 'p1' }))).toBe(false);
    expect(parseKlickJson(withPractice([])).practice).toEqual([]);
  });
});

describe('trilha e treino no perfil do arquivo', () => {
  it('a escolha de algoritmo fora do intervalo, de caso desconhecido ou não inteira vira o padrão (sai)', () => {
    const algChoice = { 'oll2-h': 1, 'oll2-sune': 1, 'f2l-03': 2, 'f2l-04': -1, 'pll2-t': 0.5, 'oll2-nada': 0 };
    expect(parseKlickJson(withProfile({ algChoice })).profile).toEqual({ algChoice: { 'oll2-h': 1, 'f2l-03': 2 } });
    expect(parseKlickJson(withProfile({ algChoice: [1] })).profile).toEqual({});
  });

  it('ids desconhecidos em trainOff são ignorados, e nada repete', () => {
    const trainOff = ['pll2-z', 'nada', 3, 'pll2-z', 'f2l-41'];
    expect(parseKlickJson(withProfile({ trainOff })).profile).toEqual({ trainOff: ['pll2-z', 'f2l-41'] });
    expect(parseKlickJson(withProfile({ trainOff: 'pll2-z' })).profile).toEqual({});
  });

  it('o passo das aulas: etapas de 0 a 8 e passos inteiros a partir de 0', () => {
    const lessonAt = { 0: 3, 8: 0, 9: 1, 2: -1, 3: 1.5, x: 2 };
    expect(parseKlickJson(withProfile({ lessonAt })).profile).toEqual({ lessonAt: { 0: 3, 8: 0 } });
  });
});
