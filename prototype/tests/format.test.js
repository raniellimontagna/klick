import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateLabel, monthLabel, daysAgoLabel, relativeTime, truncate, escapeHtml } from '../scripts/ui/format.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();

test('datas em pt-BR curtas', () => {
  assert.equal(dateLabel(NOW), 'qui, 8 out');
  assert.equal(monthLabel(NOW), 'outubro');
});

test('tempo relativo', () => {
  assert.equal(relativeTime(NOW - 30000, NOW), 'agora');
  assert.equal(relativeTime(NOW - 5 * 60000, NOW), 'há 5 min');
  assert.equal(relativeTime(NOW - 3 * 3600000, NOW), 'há 3 h');
  assert.equal(relativeTime(NOW - 24 * 3600000, NOW), 'ontem');
  assert.equal(relativeTime(NOW - 3 * 86400000, NOW), 'há 3 dias');
  assert.equal(daysAgoLabel(NOW, NOW), 'hoje');
});

test('truncate e escapeHtml', () => {
  assert.equal(truncate('R U R\' U\' F2', 6), 'R U R…');
  assert.equal(truncate('R U', 6), 'R U');
  assert.equal(escapeHtml('<b>"x"</b>'), '&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
});
