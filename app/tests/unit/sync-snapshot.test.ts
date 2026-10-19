import { describe, expect, it } from 'vitest';
import { applyChanges } from '../../src/core/sync/apply';
import { compacted, fromChange, prefToChange, toChange, type StampedRecord } from '../../src/core/sync/records';
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

  // A marca compactada (records.ts) não tem os campos de um solve: sem `at` quebraria a ordem, e o import do arquivo a recusaria.
  it('a cópia não leva solves compactados', () => {
    const records = [session, solve('a'), solve('b', { deletedAt: T0 + 5 }), compacted(solve('c', { deletedAt: T0 + 6 }))];
    expect(exportFromRecords(records, T0 + 9).solves.map((s) => s.id)).toEqual(['a', 'b']);
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
    const changes = restoreChanges(
      [...now.values()],
      { sessions: file.sessions, solves: file.solves, practice: file.practice ?? null, duels: file.duels ?? null },
      accountPrefsOf(file.profile, [...now.values()]),
      stamp,
    );
    const result = applyChanges(new MapView(now), changes, { mode: 'server' });
    const out = new Map(result.writes.map((c) => [syncKey(c.store, c.id), c]));
    expect(out.get('solves/a')).toMatchObject({ updatedAt: stamp, deletedAt: null, data: { ms: 1000 } });
    expect(out.get('solves/extra')).toMatchObject({ deletedAt: stamp, deletionStamp: stamp });
    expect(out.get('prefs/trail.0')).toMatchObject({ data: false, updatedAt: stamp });
    expect(out.get('prefs/season')).toMatchObject({ data: closed, updatedAt: stamp }); // a cópia tem a temporada do começo; a daqui fica
  });

  // Os desafios (spec do desafio, seção 7): a cópia os leva com a lixeira, como os solves, e restaurá-la os troca pela regra de
  // restoreChanges; uma cópia de antes deles (duels null) não mexe nos de agora.
  it('a cópia na nuvem leva os desafios', () => {
    const duel = (linkId: string, o: { createdAt: number; deletedAt?: number | null; status?: string }) =>
      toChange('duels', {
        id: `${linkId}-a`, linkId, side: 'a', event: '333', scrambles: Array.from({ length: 7 }, () => 'R U'), mine: [{ ms: 9000, penalty: null }],
        theirs: null, myName: 'Ana', theirName: '', status: o.status ?? 'playing', createdAt: o.createdAt, updatedAt: T0 + 7,
        deletedAt: o.deletedAt ?? null, deletionStamp: T0 + 7,
      } as never);
    const newer = duel('bbbbbbbb', { createdAt: T0 + 2 });
    const trashed = duel('aaaaaaaa', { createdAt: T0 + 1, deletedAt: T0 + 5 });
    const file = exportFromRecords([session, solve('a'), newer, trashed], T0 + 9);
    const { deletionStamp: _a, ...bareTrashed } = fromChange<StampedRecord>(trashed);
    const { deletionStamp: _b, ...bareNewer } = fromChange<StampedRecord>(newer);
    expect(file.duels).toEqual([bareTrashed, bareNewer]); // a ordem da criação, a lixeira inclusa, sem as datas do sync
    expect(file.duels?.[0]).toMatchObject({ id: 'aaaaaaaa-a', linkId: 'aaaaaaaa', deletedAt: T0 + 5, updatedAt: T0 + 7 });
    expect(exportFromRecords([session], T0).duels).toEqual([]);

    // Restaurar: o desafio da cópia volta como estava, com a data da restauração; o que não está nela vai para a lixeira.
    const later = duel('cccccccc', { createdAt: T0 + 50 });
    const edited = duel('bbbbbbbb', { createdAt: T0 + 2, status: 'done' });
    const now = new Map<string, Change>([session, solve('a'), edited, trashed, later].map((c) => [syncKey(c.store, c.id), c]));
    const stamp = T0 + 1000;
    const copy = { sessions: file.sessions, solves: file.solves, practice: file.practice ?? null, duels: file.duels ?? null };
    const out = new Map(applyChanges(new MapView(now), restoreChanges([...now.values()], copy, null, stamp), { mode: 'server' }).writes.map((c) => [syncKey(c.store, c.id), c]));
    expect(out.get('duels/bbbbbbbb-a')).toMatchObject({ updatedAt: stamp, deletedAt: null, data: { status: 'playing' } });
    expect(out.get('duels/aaaaaaaa-a')).toMatchObject({ updatedAt: stamp, deletedAt: T0 + 5 });
    expect(out.get('duels/cccccccc-a')).toMatchObject({ updatedAt: stamp, deletedAt: stamp, deletionStamp: stamp });

    // Uma cópia de antes dos desafios não mexe nos daqui.
    const old = restoreChanges([...now.values()], { ...copy, duels: null }, null, stamp);
    expect(old.filter((c) => c.store === 'duels')).toEqual([]);
    expect(old.filter((c) => c.store === 'solves').map((c) => c.id)).toEqual(['a']);
  });
});
