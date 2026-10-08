import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCoachMessage } from '../scripts/coach.js';

const DAY = 86400000;
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
let id = 0;
const sv = (ms, penalty = null, at = NOW) => ({ id: ++id, ms, penalty, at, scramble: '', note: '', session: 's1' });
const many = (list, at = NOW) => list.map((ms, i) => sv(ms, null, at - (list.length - i) * 60000));
const pick = (over) => pickCoachMessage({ history: [], sessionSolves: [], ...over });

test('recorde de single tem prioridade máxima', () => {
  const msg = pick({ solve: sv(55000), history: many([59000, 61000]), newMilestones: ['sub1'], achievedCount: 6 });
  assert.equal(msg.id, 'pb-single');
  assert.equal(msg.text, 'Novo recorde — 4.00 s mais rápido. Vale lembrar o que funcionou.');
});

test('recorde de média sem recorde de single', () => {
  const msg = pick({ solve: sv(64000), history: many([90000, 90000, 90000, 66000, 65000, 60000]) });
  assert.equal(msg.id, 'pb-average');
  assert.equal(msg.text, 'Sua média de 5 caiu para 1:05.00. Isso é consistência, não sorte.');
});

test('marco conquistado', () => {
  const msg = pick({ solve: sv(59000), newMilestones: ['sub1'], achievedCount: 6 });
  assert.equal(msg.text, 'Primeiro solve abaixo de 1 minuto. Marco 6 de 9.');
});

test('meta do dia exatamente na meta', () => {
  const msg = pick({ solve: sv(65000), history: many([60000, 61000]), dailyGoal: 3 });
  assert.equal(msg.id, 'daily-goal');
  assert.equal(msg.text, 'Meta de 3 solves feita. O resto é bônus.');
});

test('sequência estável: 5 solves dentro de 3 s', () => {
  const msg = pick({ solve: sv(72500), history: many([70000, 71000, 72000, 70500]) });
  assert.equal(msg.id, 'stable');
});

test('cansaço depois de 30 solves na sessão', () => {
  const session = many([...Array(12).fill(60000), ...Array(13).fill(66000), 66000, 72000, 70000, 74000]);
  const msg = pick({ solve: sv(69000), history: session, sessionSolves: session });
  assert.equal(msg.id, 'fatigue');
});

test('primeiro DNF da sessão', () => {
  const prev = many([60000, 61000, 62000, 63000]);
  assert.equal(pick({ solve: sv(50000, 'DNF'), history: prev, sessionSolves: prev }).id, 'first-dnf');
  const withDnf = [...prev, sv(1000, 'DNF', NOW - 1000)];
  assert.notEqual(pick({ solve: sv(50000, 'DNF'), history: withDnf, sessionSolves: withDnf })?.id, 'first-dnf');
});

test('volta depois de 3 dias ou mais', () => {
  const msg = pick({ solve: sv(70000), history: [sv(60000, null, NOW - 4 * DAY)] });
  assert.equal(msg.id, 'back');
});

test('modo silencioso e solve comum não falam', () => {
  assert.equal(pick({ solve: sv(55000), history: many([59000]), silent: true }), null);
  assert.equal(pick({ solve: sv(69000), history: many([60000, 70000]) }), null);
});

test('sequência estável não se repete no solve seguinte', () => {
  const msg = pick({ solve: sv(71500), history: many([70000, 71000, 72000, 70500, 72500]) });
  assert.equal(msg, null);
});

test('cansaço não se repete no solve seguinte', () => {
  const session = many([...Array(12).fill(60000), ...Array(13).fill(66000), 66000, 72000, 70000, 74000, 69000]);
  const msg = pick({ solve: sv(73000), history: session, sessionSolves: session });
  assert.equal(msg, null);
});
