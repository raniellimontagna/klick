import { describe, expect, it } from 'vitest';
import { pickCoachMessage } from '../../src/core/coach';
import type { Solve } from '../../src/core/types';
import { T } from '../../src/strings';

type CoachInput = Parameters<typeof pickCoachMessage>[0];

const DAY = 86400000;
const NOW = new Date(2026, 9, 8, 20, 0, 0).getTime();
let id = 0;
const sv = (ms: number, penalty: Solve['penalty'] = null, at = NOW): Solve => ({
  id: String(++id), sessionId: 's1', event: '333', ms, penalty, at, scramble: '', note: '', createdAt: at, updatedAt: at, deletedAt: null,
});
const many = (list: number[], at = NOW): Solve[] => list.map((ms, i) => sv(ms, null, at - (list.length - i) * 60000));
// Todas as chamadas levam event: '333', o evento dos casos portados do protótipo.
const pick = (over: Pick<CoachInput, 'solve'> & Partial<CoachInput>) => pickCoachMessage({ history: [], sessionSolves: [], event: '333', ...over });

// Casos portados de prototype/tests/coach.test.js.
describe('coach', () => {
  it('recorde de single tem prioridade máxima', () => {
    const msg = pick({ solve: sv(55000), history: many([59000, 61000]), newMilestones: ['sub1'], achievedCount: 6 });
    expect(msg?.id).toBe('pb-single');
    expect(msg?.text).toBe('Novo recorde — 4.00 s mais rápido. Vale lembrar o que funcionou.');
  });

  it('recorde de média sem recorde de single', () => {
    const msg = pick({ solve: sv(64000), history: many([90000, 90000, 90000, 66000, 65000, 60000]) });
    expect(msg?.id).toBe('pb-average');
    expect(msg?.text).toBe('Sua média de 5 caiu para 1:05.00. Isso é consistência, não sorte.');
  });

  it('marco conquistado', () => {
    const msg = pick({ solve: sv(59000), newMilestones: ['sub1'], achievedCount: 6 });
    expect(msg?.text).toBe('Primeiro solve abaixo de 1 minuto. Marco 6 de 9.');
  });

  it('meta do dia de 1 solve fica no singular', () => {
    expect(T.coach.dailyGoal(1)).toBe('Meta de 1 solve feita. O resto é bônus.');
    expect(T.coach.dailyGoal(20)).toBe('Meta de 20 solves feita. O resto é bônus.');
  });

  it('meta do dia exatamente na meta', () => {
    const msg = pick({ solve: sv(65000), history: many([60000, 61000]), dailyGoal: 3 });
    expect(msg?.id).toBe('daily-goal');
    expect(msg?.text).toBe('Meta de 3 solves feita. O resto é bônus.');
  });

  it('sequência estável: 5 solves dentro de 3 s', () => {
    const msg = pick({ solve: sv(72500), history: many([70000, 71000, 72000, 70500]) });
    expect(msg?.id).toBe('stable');
  });

  it('cansaço depois de 30 solves na sessão', () => {
    const session = many([...Array(12).fill(60000), ...Array(13).fill(66000), 66000, 72000, 70000, 74000]);
    const msg = pick({ solve: sv(69000), history: session, sessionSolves: session });
    expect(msg?.id).toBe('fatigue');
  });

  it('primeiro DNF da sessão', () => {
    const prev = many([60000, 61000, 62000, 63000]);
    expect(pick({ solve: sv(50000, 'DNF'), history: prev, sessionSolves: prev })?.id).toBe('first-dnf');
    const withDnf = [...prev, sv(1000, 'DNF', NOW - 1000)];
    expect(pick({ solve: sv(50000, 'DNF'), history: withDnf, sessionSolves: withDnf })?.id).not.toBe('first-dnf');
  });

  it('volta depois de 3 dias ou mais', () => {
    const msg = pick({ solve: sv(70000), history: [sv(60000, null, NOW - 4 * DAY)] });
    expect(msg?.id).toBe('back');
  });

  it('modo silencioso e solve comum não falam', () => {
    expect(pick({ solve: sv(55000), history: many([59000]), silent: true })).toBeNull();
    expect(pick({ solve: sv(69000), history: many([60000, 70000]) })).toBeNull();
  });

  it('sequência estável não se repete no solve seguinte', () => {
    const msg = pick({ solve: sv(71500), history: many([70000, 71000, 72000, 70500, 72500]) });
    expect(msg).toBeNull();
  });

  it('cansaço não se repete no solve seguinte', () => {
    const session = many([...Array(12).fill(60000), ...Array(13).fill(66000), 66000, 72000, 70000, 74000, 69000]);
    const msg = pick({ solve: sv(73000), history: session, sessionSolves: session });
    expect(msg).toBeNull();
  });
});

let n = 0;
const mk = (ms: number, event: Solve['event'] = '666'): Solve => ({
  id: String(++n), sessionId: 's', event, ms, penalty: null, at: Date.now() - 1000 + n, scramble: '', note: '', createdAt: n, updatedAt: n, deletedAt: null,
});

describe('coach com a média oficial do evento', () => {
  it('no 6×6 o recorde de média fala em média de 3', () => {
    const history = [mk(140000), mk(200000), mk(210000), mk(205000), mk(190000), mk(195000)];
    const session = history.slice();
    const solve = mk(150000);
    const msg = pickCoachMessage({ solve, history, sessionSolves: session, event: '666' });
    expect(msg?.text).toMatch(/média de 3/);
  });

  it('o Mo3 é a média simples, não a mediana aparada que o averageOf daria com n = 3', () => {
    // Mo3 do histórico: 235,00 s / 268,33 s / 300,00 s, melhor 235,00 s; o solve fecha 200,00 s. Pela mediana aparada o melhor
    // de antes seria 105,00 s (as medianas são 105 / 200 / 200 s), 200,00 s não o bateria e a mensagem não sairia.
    const history = [100000, 105000, 500000, 200000, 200000].map((ms) => mk(ms));
    const msg = pickCoachMessage({ solve: mk(200000), history, sessionSolves: history.slice(), event: '666' });
    expect(msg?.id).toBe('pb-average');
    expect(msg?.text).toMatch(/média de 3/);
  });

  it('os mesmos tempos no 3×3 falam em média de 5, não de 3', () => {
    const history = [140000, 200000, 210000, 205000, 190000, 195000].map((ms) => mk(ms, '333'));
    const msg = pickCoachMessage({ solve: mk(150000, '333'), history, sessionSolves: history.slice(), event: '333' });
    expect(msg?.id).toBe('pb-average');
    expect(msg?.text).toBe('Sua média de 5 caiu para 3:16.67. Isso é consistência, não sorte.');
  });

  it('no 3×3 o recorde da média de 12 continua valendo quando só ela bate o recorde', () => {
    // Ao12 do histórico: 72,00 s. Com o solve de 60,00 s sai o 90 s do começo e o Ao12 vira 69,00 s. O Ao5 fica em 70,00 s,
    // igual ao melhor de antes, e o single de 60,00 s não bate o de 50,00 s.
    const history = [90000, 90000, 70000, 70000, 70000, 50000, 70000, 70000, 70000, 70000, 70000, 70000].map((ms) => mk(ms, '333'));
    const msg = pickCoachMessage({ solve: mk(60000, '333'), history, sessionSolves: history.slice(), event: '333' });
    expect(msg?.id).toBe('pb-average');
    expect(msg?.text).toBe('Sua média de 12 caiu para 1:09.00. Isso é consistência, não sorte.');
  });

  it('marco que a interface não conhece é ignorado em vez de quebrar a mensagem', () => {
    expect(pick({ solve: sv(59000), newMilestones: ['nope'], achievedCount: 1 })).toBeNull();
    const msg = pick({ solve: sv(59000), newMilestones: ['sub1', 'nope'], achievedCount: 6 });
    expect(msg?.text).toBe('Primeiro solve abaixo de 1 minuto. Marco 6 de 9.');
  });
});
