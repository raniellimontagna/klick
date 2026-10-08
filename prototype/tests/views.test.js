import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEvolucao } from '../scripts/ui/evolucao-view.js';
import { renderCompanion } from '../scripts/ui/companion-view.js';
import { renderAjustes } from '../scripts/ui/ajustes-view.js';
import { buildSeed } from '../scripts/data.js';
import { milestoneProgress } from '../scripts/stats.js';
import { DEFAULT_SETTINGS } from '../scripts/store.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
const seed = buildSeed(NOW);

test('Evolução: indicadores, gráfico, distribuição e histórico com os dados de exemplo', () => {
  const root = { innerHTML: '' };
  renderEvolucao({ root, solves: seed.solves, sessions: seed.sessions, sessionFilter: 'all', period: '30', now: NOW });
  assert.equal((root.innerHTML.match(/class="tile"/g) || []).length, 5);
  assert.match(root.innerHTML, /<b class="pb">0:54.10<\/b>/);
  assert.equal((root.innerHTML.match(/class="dot"/g) || []).length, 211);
  assert.equal((root.innerHTML.match(/<tr><td class="num">/g) || []).length, 30);
  assert.match(root.innerHTML, /aria-pressed="true">30 dias/);
});

test('Evolução: período vazio mostra aviso em vez de quebrar', () => {
  const root = { innerHTML: '' };
  renderEvolucao({ root, solves: [], sessions: seed.sessions, sessionFilter: 'all', period: '7', now: NOW });
  assert.match(root.innerHTML, /Sem solves neste período/);
});

test('Centro: marcos, trilha, acabamento bloqueado e modo silencioso', () => {
  const root = { innerHTML: '' };
  renderCompanion({ root, milestones: milestoneProgress(seed.solves, NOW), trail: [true, true, true, true, false, false, false, false, false], finish: 'fosco', preview: null, silent: true, theme: 'light' });
  assert.match(root.innerHTML, /Temporada 1 · 6 de 9 marcos · acabamento Fosco/);
  assert.equal((root.innerHTML.match(/<li class="done">/g) || []).length, 6 + 4);
  assert.match(root.innerHTML, /<li class="next"><i><\/i>7 dias seguidos<em>4\/7<\/em>/);
  assert.match(root.innerHTML, /class="finish locked" data-finish="gelo"/);
  assert.match(root.innerHTML, /data-silent checked/);
});

test('Ajustes: valores atuais marcados e confirmação em dois cliques', () => {
  const root = { innerHTML: '' };
  renderAjustes({ root, settings: { ...DEFAULT_SETTINGS, holdMs: 550 }, confirm: 'wipe' });
  assert.match(root.innerHTML, /data-set="holdMs" data-val="550" aria-pressed="true"/);
  assert.match(root.innerHTML, /data-set="theme" data-val="system" aria-pressed="true"/);
  assert.match(root.innerHTML, /data-data="wipe">Tem certeza\? Clique de novo/);
  assert.match(root.innerHTML, /data-toggle="inspection" checked/);
});
