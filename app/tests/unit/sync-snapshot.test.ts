import { describe, expect, it } from 'vitest';
import { applyChanges } from '../../src/core/sync/apply';
import { prefToChange, toChange } from '../../src/core/sync/records';
import { restoreChanges } from '../../src/core/sync/restore';
import { accountPrefsOf, exportFromRecords } from '../../src/core/sync/snapshot';
import { syncKey, type Change } from '../../src/core/sync/types';
import type { SeasonProgress } from '../../src/core/types';
import { MapView } from './sync-fakes';

const T0 = 1_791_500_000_000;
const solve = (id: string, o: { deletedAt?: number | null; ms?: number } = {}) =>
  toChange('solves', {
    id, sessionId: 's', event: '333', ms: o.ms ?? 1000, penalty: null, at: T0, scramble: 'R', note: '', createdAt: T0,
    updatedAt: T0, deletedAt: o.deletedAt ?? null, deletionStamp: T0,
  } as never);
const session = toChange('sessions', { id: 's', name: 'Sessão 1', event: '333', order: 0, createdAt: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 } as never);

describe('a cópia diária no formato do export (spec 8.3)', () => {
  it('leva sessões, solves com a lixeira, o treino que existe e o perfil da conta', () => {
    const records: Change[] = [
      session,
      solve('a'),
      solve('b', { deletedAt: T0 + 5 }),
      toChange('practice', { id: 'p', caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0, updatedAt: T0, deletedAt: null, deletionStamp: T0 } as never),
      toChange('practice', { id: 'q', caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0, updatedAt: T0, deletedAt: T0, deletionStamp: T0 } as never),
      prefToChange({ key: 'trail.0', value: true, updatedAt: T0 }),
    ];
    const file = exportFromRecords(records, T0 + 9);
    expect(file).toMatchObject({ format: 'klick', version: 1, exportedAt: T0 + 9 });
    expect(file.sessions).toEqual([{ id: 's', name: 'Sessão 1', event: '333', order: 0, createdAt: T0, updatedAt: T0, deletedAt: null }]);
    expect(file.solves.map((s) => [s.id, s.deletedAt])).toEqual([['a', null], ['b', T0 + 5]]);
    expect(file.solves[0]).not.toHaveProperty('deletionStamp');
    expect(file.practice).toEqual([{ id: 'p', caseId: 'oll2-h', ms: 1, ok: true, helped: false, at: T0 }]);
    expect(file.profile?.trail?.[0]).toBe(true);
  });

  it('restaurar a cópia no servidor: datas novas, o que sobra vai para a lixeira, e a temporada nunca volta', () => {
    const closed: SeasonProgress = {
      current: { n: 2, startedAt: 10, marks: Array.from({ length: 9 }, () => ({ kind: 'count' as const, target: 1 })), basis: { single: 1, ao5: null, ao12: null } },
      past: [{ n: 1, startedAt: 1, endedAt: 2, solves: 3, startAo12: null, endAo12: null }],
    };
    const season = prefToChange({ key: 'season', value: closed, updatedAt: T0 });
    const now = new Map<string, Change>([session, solve('a', { ms: 999 }), solve('extra'), season].map((c) => [syncKey(c.store, c.id), c]));
    const file = exportFromRecords([session, solve('a')], T0);
    const stamp = T0 + 1000;
    const changes = restoreChanges([...now.values()], { sessions: file.sessions, solves: file.solves, practice: file.practice ?? null }, accountPrefsOf(file.profile), stamp);
    const result = applyChanges(new MapView(now), changes, { mode: 'server' });
    const out = new Map(result.writes.map((c) => [syncKey(c.store, c.id), c]));
    expect(out.get('solves/a')).toMatchObject({ updatedAt: stamp, deletedAt: null, data: { ms: 1000 } });
    expect(out.get('solves/extra')).toMatchObject({ deletedAt: stamp, deletionStamp: stamp });
    expect(out.get('prefs/trail.0')).toMatchObject({ data: false, updatedAt: stamp });
    expect(out.get('prefs/season')).toMatchObject({ data: closed, updatedAt: stamp }); // a cópia tem a temporada do começo; a daqui fica
  });
});
