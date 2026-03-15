import { describe, expect, it } from 'vitest';
import {
  deserializeEffectiveMs,
  mergeByUpdatedAtLww,
  mergeByUpdatedAtLwwByKey,
  serializeEffectiveMs,
} from './sync';

describe('mergeByUpdatedAtLww', () => {
  it('keeps newest row for the same id', () => {
    const local = [{ id: 'session-1', updated_at: '2026-03-15T12:00:00.000Z', value: 'local' }];
    const remote = [{ id: 'session-1', updated_at: '2026-03-15T12:00:01.000Z', value: 'remote' }];

    const merged = mergeByUpdatedAtLww(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0].value).toBe('remote');
  });

  it('prefers remote row when timestamps are equal', () => {
    const local = [{ id: 'solve-1', updated_at: '2026-03-15T12:00:00.000Z', source: 'local' }];
    const remote = [{ id: 'solve-1', updated_at: '2026-03-15T12:00:00.000Z', source: 'remote' }];

    const merged = mergeByUpdatedAtLww(local, remote);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('remote');
  });

  it('keeps rows that only exist on one side', () => {
    const local = [{ id: 'a', updated_at: '2026-03-15T12:00:00.000Z' }];
    const remote = [{ id: 'b', updated_at: '2026-03-15T12:00:00.000Z' }];

    const merged = mergeByUpdatedAtLww(local, remote);

    const ids = merged.map((row) => row.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });
});

describe('effective ms serialization', () => {
  it('stores DNF as null and restores as Infinity', () => {
    expect(serializeEffectiveMs(Number.POSITIVE_INFINITY)).toBeNull();
    expect(deserializeEffectiveMs(null)).toBe(Number.POSITIVE_INFINITY);
  });

  it('preserves finite values', () => {
    expect(serializeEffectiveMs(12345)).toBe(12345);
    expect(deserializeEffectiveMs(12345)).toBe(12345);
  });
});

describe('mergeByUpdatedAtLwwByKey', () => {
  it('merges rows using a computed key', () => {
    const local = [
      {
        challenge_date: '2026-03-15',
        challenge_type: 'solve_count',
        updated_at: '2026-03-15T12:00:00.000Z',
        source: 'local',
      },
    ];
    const remote = [
      {
        challenge_date: '2026-03-15',
        challenge_type: 'solve_count',
        updated_at: '2026-03-15T12:00:01.000Z',
        source: 'remote',
      },
    ];

    const merged = mergeByUpdatedAtLwwByKey(local, remote, (row) =>
      `${row.challenge_date}:${row.challenge_type}`,
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('remote');
  });
});
