import { describe, expect, it } from 'vitest';
import { dateLabel, daysAgoLabel, escapeHtml, monthLabel, relativeTime, truncate } from '../../src/ui/format';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();

// Casos portados de prototype/tests/format.test.js.
describe('formatação', () => {
  it('datas em pt-BR curtas', () => {
    expect(dateLabel(NOW)).toBe('qui, 8 out');
    expect(monthLabel(NOW)).toBe('outubro');
  });

  it('tempo relativo', () => {
    expect(relativeTime(NOW - 30000, NOW)).toBe('agora');
    expect(relativeTime(NOW - 5 * 60000, NOW)).toBe('há 5 min');
    expect(relativeTime(NOW - 3 * 3600000, NOW)).toBe('há 3 h');
    expect(relativeTime(NOW - 24 * 3600000, NOW)).toBe('ontem');
    expect(relativeTime(NOW - 3 * 86400000, NOW)).toBe('há 3 dias');
    expect(daysAgoLabel(NOW, NOW)).toBe('hoje');
  });

  it('truncate e escapeHtml', () => {
    expect(truncate("R U R' U' F2", 6)).toBe('R U R…');
    expect(truncate('R U', 6)).toBe('R U');
    expect(escapeHtml('<b>"x"</b>')).toBe('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
  });
});

// As palavras vêm de T.date (strings.ts). Os casos portados só tocam em "qui", "out", "outubro" e em poucas frases; estes
// fixam todas, para mover os textos de lugar não trocar nenhuma letra.
describe('formatação: todas as palavras', () => {
  it('os sete dias da semana, abreviados', () => {
    const week = Array.from({ length: 7 }, (_, i) => dateLabel(new Date(2026, 9, 4 + i, 12).getTime()));
    expect(week).toEqual(['dom, 4 out', 'seg, 5 out', 'ter, 6 out', 'qua, 7 out', 'qui, 8 out', 'sex, 9 out', 'sáb, 10 out']);
  });

  it('os doze meses, abreviados e por extenso', () => {
    const at = (month: number) => new Date(2026, month, 15, 12).getTime();
    expect(Array.from({ length: 12 }, (_, m) => dateLabel(at(m)).split(' ')[2])).toEqual(
      ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
    );
    expect(Array.from({ length: 12 }, (_, m) => monthLabel(at(m)))).toEqual(
      ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
    );
  });

  it('tempo relativo no limite de cada faixa', () => {
    expect(relativeTime(NOW - 59999, NOW)).toBe('agora');
    expect(relativeTime(NOW - 60000, NOW)).toBe('há 1 min');
    expect(relativeTime(NOW - 3600000, NOW)).toBe('há 1 h');
    expect(daysAgoLabel(NOW - 2 * 86400000, NOW)).toBe('há 2 dias');
    expect(daysAgoLabel(NOW - 86400000, NOW)).toBe('ontem');
  });
});
