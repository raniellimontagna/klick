import { describe, expect, it } from 'vitest';
import { EVENT_IDS } from '../../src/core/events';
import { prefsFromProfile, splitProfile } from '../../src/core/sync/prefs';
import { checkChange } from '../../src/core/sync/shape';
import { CASES } from '../../src/core/trail/cases';
import { defaultSettings, type Profile } from '../../src/core/types';
import { defaultSeason } from '../../src/core/season';
import { defaultSessionId, newId } from '../../src/data/ids';
import { csTimerToKlick, parseCsTimer, v1ToKlick } from '../../src/data/transfer';

// Todo id que o app gera (ou guardou de uma importação) tem de passar na regra de id do servidor (spec 6.6: um registro gerado pelo
// app nunca é recusado). Uma sessão mínima e válida, só para chegar na regra do id.
const sessionWith = (id: string) =>
  checkChange({ store: 'sessions', id, data: { name: 'S', event: '333', order: 0, createdAt: 1 }, updatedAt: 1, deletedAt: null, deletionStamp: 1 });

describe('os formatos de id do app passam na regra do servidor (spec 6.6)', () => {
  it('newId: 17 caracteres [0-9a-z], no início dos tempos, hoje e no fim da faixa', () => {
    for (const id of [newId(0), newId(1_791_500_000_000), newId(Number.MAX_SAFE_INTEGER), newId(Number.NaN)]) {
      expect(id).toMatch(/^[0-9a-z]{17}$/);
      expect(sessionWith(id)).toMatchObject({ ok: true });
    }
  });

  it('ids da v1, guardados como vieram: UUID v4 (crypto.randomUUID e o gerador próprio da v1)', () => {
    const v1Ids = [crypto.randomUUID(), '3f2b8c1e-9a4d-4e7f-b6a2-1c5d8e9f0a7b', 'A1B2C3D4-E5F6-4A7B-8C9D-0E1F2A3B4C5D'];
    const plan = v1ToKlick(
      [{ id: v1Ids[0], name: 'Antiga', puzzleType: '3x3', createdAt: '2025-10-27T12:00:00.000Z', solves: v1Ids.slice(1).map((id) => ({ id, timeMs: 30_000, penalty: 'NONE' as const, scramble: 'R', createdAt: '2025-10-27T12:00:00.000Z' })) }],
      { now: 1_791_500_000_000, existingSessions: [], existingSolves: [] },
    );
    const ids = [...plan.sessions.map((s) => s.id), ...plan.solves.map((s) => s.id)];
    expect(ids).toEqual(v1Ids);
    for (const id of ids) expect(sessionWith(id)).toMatchObject({ ok: true });
  });

  it('ids de uma importação do csTimer (derivados do dado, spec 5.5) e a sessão padrão de cada evento', () => {
    const file = JSON.stringify({ session1: [[[0, 30_000], 'R U', '', 1_791_500_000]], properties: { sessionData: JSON.stringify({ 1: { name: 'A', opt: { scrType: '333' } } }) } });
    const plan = csTimerToKlick(parseCsTimer(file), {}, { now: 1_791_500_000_000, existingSessions: [], existingSolves: [] });
    const ids = [...plan.sessions.map((s) => s.id), ...plan.solves.map((s) => s.id)];
    // `cs-s-` na sessão e `cs-` no solve, mais 22 caracteres [0-9a-z]; e a sessão padrão `default-<evento>`.
    expect(ids).toEqual([expect.stringMatching(/^cs-s-[0-9a-z]{22}$/), expect.stringMatching(/^cs-[0-9a-z]{22}$/)]);
    ids.push('cs-0123456789abcdefghijkl', 'cs-s-zyxwvutsrqponmlkjihgf', ...EVENT_IDS.map((e) => defaultSessionId(e)));
    for (const id of ids) expect(sessionWith(id)).toMatchObject({ ok: true });
  });

  it('as chaves da conta (prefs) de um perfil com tudo preenchido, em todos os casos do treino', () => {
    const profile: Profile = {
      settings: { ...defaultSettings(), inspection: false, dailyGoal: 50 },
      trail: Array<boolean>(9).fill(true),
      finish: 'carbono',
      onboarded: true,
      currentSessionId: null,
      season: defaultSeason(),
      lessonAt: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i, 1])),
      algChoice: Object.fromEntries(CASES.filter((c) => c.algs.length > 1).map((c) => [c.id, c.algs.length - 1])),
      trainOff: CASES.map((c) => c.id),
      duelName: 'x'.repeat(20),
      // As metas nas vagas das pontas (a primeira e a última), com os valores nos limites.
      goals: {
        '000': { kind: 'single', event: '333', targetMs: 1, startMs: null, createdAt: 0, reachedAt: null },
        zzz: { kind: 'ao12', event: 'clock', targetMs: 3_599_999, startMs: 3_600_000, createdAt: 1, reachedAt: 2 },
      },
    };
    const items = prefsFromProfile(splitProfile(profile).account, { withDefaults: true });
    expect(items.size).toBeGreaterThan(CASES.length);
    expect(items.get('goal.000')).toEqual(profile.goals['000']);
    expect(items.get('goal.zzz')).toEqual(profile.goals.zzz);
    for (const [key, value] of items) {
      expect(checkChange({ store: 'prefs', id: key, data: value, updatedAt: 1, deletedAt: null, deletionStamp: 1 }), key).toMatchObject({ ok: true });
    }
  });
});
