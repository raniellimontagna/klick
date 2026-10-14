import { describe, expect, it } from 'vitest';
import { type CoachSeason, pickCoachMessage } from '../../src/core/coach';
import { type MarkStatus, seasonOne } from '../../src/core/season';
import type { SeasonMark, SeasonState, Solve } from '../../src/core/types';
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

// Os marcos de uma temporada, com os índices dados já feitos.
const statusOf = (state: SeasonState, done: number[]): MarkStatus[] =>
  state.marks.map((mark, i) => ({ mark, achieved: done.includes(i), at: done.includes(i) ? NOW : null, current: null }));
const seasonIn = (state: SeasonState, before: number[], after: number[], prior: Solve[] = []): CoachSeason => ({
  state, before: statusOf(state, before), after: statusOf(state, after), prior, end: null,
});
const t1 = (before: number[], after: number[]) => seasonIn(seasonOne(), before, after);
const t2 = (marks: SeasonMark[]): SeasonState => ({ n: 2, startedAt: 0, marks, basis: { single: null, ao5: null, ao12: null } });
// Um marco de teste na frente e 8 que nunca ficam perto.
const pending = (m: SeasonMark): SeasonMark[] => [m, ...Array.from({ length: 8 }, () => ({ kind: 'count' as const, target: 99999 }))];

// Casos portados de prototype/tests/coach.test.js.
describe('coach', () => {
  it('recorde de single tem prioridade máxima', () => {
    const msg = pick({ solve: sv(55000), history: many([59000, 61000]), season: t1([0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]) });
    expect(msg?.id).toBe('pb-single');
    expect(msg?.text).toBe('Novo recorde — 4.00 s mais rápido. Vale lembrar o que funcionou.');
  });

  it('recorde de média sem recorde de single', () => {
    const msg = pick({ solve: sv(64000), history: many([90000, 90000, 90000, 66000, 65000, 60000]) });
    expect(msg?.id).toBe('pb-average');
    expect(msg?.text).toBe('Sua média de 5 caiu para 1:05.00. Isso é consistência, não sorte.');
  });

  it('marco conquistado', () => {
    const msg = pick({ solve: sv(59000), season: t1([0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5]) });
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

  it('da T2 em diante, a mensagem do marco é o rótulo dele', () => {
    const msg = pick({ solve: sv(17000), season: seasonIn(t2(pending({ kind: 'ao5', target: 18000 })), [], [0]) });
    expect(msg?.text).toBe('Média de 5 abaixo de 18 s. Marco 1 de 9.');
  });

  it('média igual ao melhor de antes não é recorde: vale só a estritamente menor, no Mo3 e no Ao5', () => {
    // 6×6: Mo3 do histórico 106,67 / 113,33 / 106,67 s, melhor 106,67 s. O solve de 100,00 s fecha a última janela em 106,67 s de novo.
    const mo = [100000, 120000, 100000, 120000, 100000].map((ms) => mk(ms));
    expect(pickCoachMessage({ solve: mk(100000), history: mo, sessionSolves: mo.slice(), event: '666' })).toBeNull();
    // 3×3: o Ao5 do histórico é 80,00 s. Com o solve de 60,00 s os últimos cinco também dão 80,00 s, e o single só empata com o de 60,00 s.
    const ao = [60000, 70000, 80000, 90000, 100000].map((ms) => mk(ms, '333'));
    expect(pickCoachMessage({ solve: mk(60000, '333'), history: ao, sessionSolves: ao.slice(), event: '333' })).toBeNull();
  });
});

// A meta do dia e o "de volta" são da pessoa, não do evento. O histórico que a interface passa é só o do evento (os recordes
// precisam disso), então ela passa também todayCount e prevAnyAt, que olham todos os eventos.
describe('coach: a meta do dia e o "de volta" contam todos os eventos', () => {
  it('a meta do dia sai quando todayCount, de todos os eventos, chega à meta, com menos solves no evento', () => {
    // Dois solves de 3×3 hoje e este: 3 no evento. Com mais dois de outro evento, a pessoa chegou a 5.
    const base = { solve: sv(65000), history: many([60000, 61000]), dailyGoal: 5 };
    expect(pick(base)).toBeNull(); // só pelo histórico do evento seriam 3 de 5
    const msg = pick({ ...base, todayCount: 5 });
    expect(msg?.id).toBe('daily-goal');
    expect(msg?.text).toBe('Meta de 5 solves feita. O resto é bônus.');
  });

  it('a meta do dia não sai quando todayCount já passou dela, mesmo que o evento sozinho chegue lá', () => {
    // Três solves de 3×3 hoje, contando este: pelo evento seria a meta de 3. Mas a pessoa já tinha feito 5 no dia, e a meta passou antes.
    const base = { solve: sv(65000), history: many([60000, 61000]), dailyGoal: 3 };
    expect(pick(base)?.id).toBe('daily-goal');
    expect(pick({ ...base, todayCount: 5 })).toBeNull();
  });

  it('"de volta" usa o solve anterior da pessoa em qualquer evento: treinou ontem em outro', () => {
    const base = { solve: sv(70000), history: [sv(60000, null, NOW - 5 * DAY)] };
    expect(pick(base)?.id).toBe('back'); // pelo último solve do evento seriam 5 dias
    expect(pick({ ...base, prevAnyAt: NOW - DAY })).toBeNull();
  });

  it('"de volta" sai no primeiro solve de um evento quando a pessoa passou 3 dias ou mais sem solve em qualquer um', () => {
    expect(pick({ solve: sv(70000) })).toBeNull(); // sem history nem prevAnyAt não há solve anterior
    expect(pick({ solve: sv(70000), prevAnyAt: NOW - 4 * DAY })?.id).toBe('back');
    expect(pick({ solve: sv(70000), prevAnyAt: NOW - 3 * DAY })?.id).toBe('back'); // 3 dias exatos já contam
    expect(pick({ solve: sv(70000), prevAnyAt: NOW - 3 * DAY + 1 })).toBeNull();
  });
});

describe('gatilhos novos do coach (spec do sub-projeto 3, seção 7)', () => {
  it('fim de temporada vem antes de tudo, com a média e o acabamento', () => {
    const season = { ...t1([0, 1, 2, 3, 4, 5, 6, 7], [0, 1, 2, 3, 4, 5, 6, 7, 8]), end: { n: 2, solves: 412, startAo12: 18610, endAo12: 17840, finish: 'gelo' as const } };
    const msg = pick({ solve: sv(55000), history: many([59000]), season });
    expect(msg?.id).toBe('season-end');
    expect(msg?.text).toBe('Temporada 2 completa: 412 solves, melhor média de 12 de 0:18.61 para 0:17.84. Gelo liberado.');
  });

  it('o fim da T1 sai sem média; da T4 em diante, sem acabamento', () => {
    expect(T.coach.seasonEnd(1, 1204, null, null, 'Brilho')).toBe('Temporada 1 completa: 1.204 solves. Brilho liberado.');
    expect(T.coach.seasonEnd(4, 1, '0:15.00', '0:14.00', null)).toBe('Temporada 4 completa: 1 solve, melhor média de 12 de 0:15.00 para 0:14.00.');
  });

  it('quase lá na média de 5, uma vez por sessão e por dia', () => {
    const state = t2(pending({ kind: 'ao5', target: 18000 }));
    const prior = many([18300, 18400, 18200, 18500]);
    const solve = sv(18350);
    // Ao5 = 18300, 18400 e 18350 (sem 18200 e 18500) = 18350: 0,35 s acima de 18 s (1,9%).
    const msg = pick({ solve, history: prior, sessionSolves: prior, season: seasonIn(state, [], [], prior) });
    expect(msg?.id).toBe('near');
    expect(msg?.text).toBe('Faltam 0.35 s para a média de 5 abaixo de 18 s.');
    const all = [...prior, solve];
    const next = sv(18300, null, NOW + 60000);
    expect(pick({ solve: next, history: all, sessionSolves: all, season: seasonIn(state, [], [], all) })?.id).not.toBe('near');
    expect(pick({ solve: next, history: all, sessionSolves: [], season: seasonIn(state, [], [], all) })?.id).toBe('near');
    // Uma vez por dia: no dia seguinte, a mesma sessão volta a ouvir o quase lá.
    const tomorrow = sv(18300, null, NOW + DAY);
    expect(pick({ solve: tomorrow, history: all, sessionSolves: all, season: seasonIn(state, [], [], all) })?.id).toBe('near');
  });

  it('quase lá no single, no volume e na sequência de dias', () => {
    const single = t2(pending({ kind: 'single', target: 15000 }));
    expect(pick({ solve: sv(15210), history: many([14000]), season: seasonIn(single, [], []) })?.text).toBe('Esse ficou a 0.21 s do single abaixo de 15 s.');
    const count = t2(pending({ kind: 'count', target: 300 }));
    const prior = Array.from({ length: 290 }, (_, i) => sv(20000, null, NOW - DAY + i));
    expect(pick({ solve: sv(20000), history: many([10000]), season: seasonIn(count, [], [], prior) })?.text).toBe('Faltam 9 solves para os 300 da temporada.');
    const streak = t2(pending({ kind: 'streak', target: 7 }));
    const days = Array.from({ length: 5 }, (_, i) => sv(20000, null, NOW - (5 - i) * DAY));
    expect(pick({ solve: sv(20000), history: many([10000]), season: seasonIn(streak, [], [], days) })?.text).toBe('6 dias seguidos. Mais um fecha o marco.');
  });

  it('semana melhor: no primeiro solve do dia, os 7 dias anteriores contra os 7 antes deles', () => {
    const at = (daysAgo: number, k: number) => NOW - daysAgo * DAY - k * 60000;
    const older = Array.from({ length: 12 }, (_, k) => sv(21000, null, at(10, k)));
    const recent = Array.from({ length: 12 }, (_, k) => sv(20000, null, at(3, k)));
    const history = [...older, ...recent].sort((x, y) => x.at - y.at);
    const msg = pick({ solve: sv(30000), history });
    expect(msg?.id).toBe('week');
    expect(msg?.text).toBe('Sua semana no 3×3 foi 1.00 s mais rápida que a anterior.');
    expect(pick({ solve: sv(30000), history: [...history, sv(20000, null, NOW - 60000)] })?.id).not.toBe('week'); // já houve solve hoje
    expect(pick({ solve: sv(30000), history: history.slice(1) })?.id).not.toBe('week'); // só 11 solves na semana mais antiga
  });

  it('fora da curva: o primeiro solve da sessão no dia acima de 1,25 vez a média de 12, sem DNF', () => {
    const session = many(Array.from({ length: 12 }, (_, i) => 20000 + i * 100));
    // Ao12 dos 12 = 20550. 26 s passa de 1,25 × 20,55 s; com ele, a média de 12 fica em 20,65 s.
    const msg = pick({ solve: sv(26000), history: session, sessionSolves: session });
    expect(msg?.id).toBe('outlier');
    expect(msg?.text).toBe('Esse escapou. A média de 12 segue em 0:20.65.');
    const after = [...session, sv(26000)];
    expect(pick({ solve: sv(27000, null, NOW + 60000), history: after, sessionSolves: after })?.id).not.toBe('outlier');
    // Uma vez por dia: no dia seguinte, a mesma sessão volta a ouvir o fora da curva.
    expect(pick({ solve: sv(27000, null, NOW + DAY), history: after, sessionSolves: after })?.id).toBe('outlier');
    expect(pick({ solve: sv(26000, 'DNF'), history: session, sessionSolves: session })?.id).toBe('first-dnf');
  });
});
