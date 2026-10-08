import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSeed, mulberry32, scrambleAt } from '../scripts/data.js';
import { SCRAMBLES } from '../scripts/scrambles.js';
import { bestSingle, bestAverage, currentStreak, achievedIds, solvesOnDay } from '../scripts/stats.js';

const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();

test('mulberry32 é determinístico', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
});

test('scrambleAt percorre a lista em ciclo', () => {
  assert.equal(SCRAMBLES.length, 40);
  assert.equal(scrambleAt(0), SCRAMBLES[0]);
  assert.equal(scrambleAt(40), SCRAMBLES[0]);
  assert.equal(scrambleAt(-1), SCRAMBLES[39]);
});

test('a base fictícia bate com o que a spec promete', () => {
  const { sessions, solves } = buildSeed(NOW);
  assert.equal(sessions[0].name, 'Sessão 12');
  assert.equal(solves.length, 212);
  assert.ok(solves.every((x, i) => i === 0 || x.at > solves[i - 1].at), 'ordem cronológica');
  assert.ok(solves.every((x) => x.at <= NOW), 'nada no futuro');
  assert.equal(bestSingle(solves), 54100);
  assert.ok(bestAverage(solves, 12) >= 60000, 'média de 12 ainda não é sub-1:00');
  assert.equal(currentStreak(solves, NOW), 4);
  assert.equal(solvesOnDay(solves, NOW).length, 12);
  assert.deepEqual(achievedIds(solves, NOW), ['first', 'sub2', 'n100', 'sub130', 'ao5sub130', 'sub1']);
  assert.ok(solves.some((x) => x.penalty === '+2'));
  assert.ok(solves.some((x) => x.penalty === 'DNF'));
});

test('a base fictícia é igual para o mesmo "agora"', () => {
  assert.deepEqual(buildSeed(NOW), buildSeed(NOW));
});

test('perto da meia-noite os 12 solves de hoje continuam hoje', () => {
  const nearMidnight = new Date(2026, 9, 8, 0, 15, 0).getTime();
  const { solves } = buildSeed(nearMidnight);
  assert.equal(solvesOnDay(solves, nearMidnight).length, 12);
  assert.ok(solves.every((x, i) => i === 0 || x.at > solves[i - 1].at), 'ordem cronológica');
  assert.equal(currentStreak(solves, nearMidnight), 4);
});
