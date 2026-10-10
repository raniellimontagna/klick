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
