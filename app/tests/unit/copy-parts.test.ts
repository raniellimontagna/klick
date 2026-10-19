import { describe, expect, it } from 'vitest';
import { gunzipJson, gzipJson } from '../../src/core/gzip';
import { assembleCopy, type CopyManifest, type CopyPart, isCopyPart, isManifest, sliceOf } from '../../src/core/sync/copy-parts';
import type { Duel, Practice, Session, Solve } from '../../src/core/types';

const session = (id: string): Session => ({ id, name: id, event: '333', order: 0, createdAt: 1, updatedAt: 1, deletedAt: null });
const solve = (id: string): Solve => ({ id, sessionId: 's1', event: '333', ms: 9000, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1, updatedAt: 1, deletedAt: null });
const practice = (id: string): Practice => ({ id, caseId: 'oll-1', ms: 3000, ok: true, helped: false, at: 1 });
const duel = (id: string): Duel => ({
  id, linkId: 'l1', side: 'a', event: '333', scrambles: ['R'], mine: [], theirs: null, myName: 'a', theirName: 'b', status: 'playing', createdAt: 1, updatedAt: 1, deletedAt: null,
});

const manifest = (): CopyManifest => ({
  format: 'klick-parts', version: 1, exportedAt: 1_700_000_000_000, day: '2026-10-20', profile: null, solves: 7,
  parts: [{ last: ['solves', 'c'], records: 10 }, { last: ['solves', 'm'], records: 12 }, { last: ['solves', 'z'], records: 5 }],
});
const part = (): CopyPart => ({ sessions: [session('s1')], solves: [solve('a')], practice: [practice('p1')], duels: [duel('d1')] });

describe('o gzip das cópias', () => {
  it('ida e volta: gzipJson e gunzipJson', async () => {
    const data = { a: 1, b: ['x', null, { c: 'ação' }] };
    const gz = await gzipJson(data);
    expect(new Uint8Array(gz)[0]).toBe(0x1f); // o cabeçalho do gzip
    expect(new Uint8Array(gz)[1]).toBe(0x8b);
    expect(await gunzipJson(gz)).toEqual(data);
  });
});

describe('o formato das partes', () => {
  it('isManifest e isCopyPart recusam formas tortas', () => {
    expect(isManifest(manifest())).toBe(true);
    expect(isManifest({ ...manifest(), profile: { settings: {} } })).toBe(true);
    const bad = (patch: Record<string, unknown>) => isManifest({ ...manifest(), ...patch });
    expect(isManifest(null)).toBe(false);
    expect(isManifest('klick-parts')).toBe(false);
    expect(bad({ format: 'klick' })).toBe(false);
    expect(bad({ version: 2 })).toBe(false);
    expect(bad({ exportedAt: '1' })).toBe(false);
    expect(bad({ exportedAt: Number.NaN })).toBe(false);
    expect(bad({ day: 20261020 })).toBe(false);
    expect(bad({ profile: undefined })).toBe(false);
    expect(bad({ profile: 'x' })).toBe(false);
    expect(bad({ solves: -1 })).toBe(false);
    expect(bad({ solves: 1.5 })).toBe(false);
    expect(bad({ parts: 'x' })).toBe(false);
    expect(bad({ parts: [] })).toBe(false);
    expect(bad({ parts: Array.from({ length: 1000 }, () => ({ last: ['solves', 'a'], records: 1 })) })).toBe(false);
    expect(isManifest({ ...manifest(), parts: Array.from({ length: 999 }, () => ({ last: ['solves', 'a'], records: 1 })) })).toBe(true);
    expect(bad({ parts: [{ last: ['solves'], records: 1 }] })).toBe(false);
    expect(bad({ parts: [{ last: ['solves', 2], records: 1 }] })).toBe(false);
    expect(bad({ parts: [{ last: 'solves/a', records: 1 }] })).toBe(false);
    expect(bad({ parts: [{ last: ['solves', 'a'], records: '1' }] })).toBe(false);
    expect(bad({ parts: [{ last: ['solves', 'a'], records: 1.5 }] })).toBe(false);
    expect(bad({ parts: [{ last: ['solves', 'a'], records: -1 }] })).toBe(false);
    expect(bad({ parts: [null] })).toBe(false);

    expect(isCopyPart(part())).toBe(true);
    expect(isCopyPart({ sessions: [], solves: [], practice: [], duels: [] })).toBe(true);
    expect(isCopyPart(null)).toBe(false);
    for (const key of ['sessions', 'solves', 'practice', 'duels'] as const) {
      expect(isCopyPart({ ...part(), [key]: undefined })).toBe(false);
      expect(isCopyPart({ ...part(), [key]: {} })).toBe(false);
      expect(isCopyPart({ ...part(), [key]: [null] })).toBe(false);
      expect(isCopyPart({ ...part(), [key]: [{ id: 3 }] })).toBe(false);
    }
  });

  it('sliceOf: a primeira sem lo, a última sem hi, as do meio emendadas', () => {
    const m = manifest();
    expect(sliceOf(m, 0)).toEqual({ lo: null, hi: ['solves', 'c'] });
    expect(sliceOf(m, 1)).toEqual({ lo: ['solves', 'c'], hi: ['solves', 'm'] });
    expect(sliceOf(m, 2)).toEqual({ lo: ['solves', 'm'], hi: null });
    const one: CopyManifest = { ...m, parts: [{ last: ['solves', 'x'], records: 1 }] };
    expect(sliceOf(one, 0)).toEqual({ lo: null, hi: null });
    expect(() => sliceOf(m, 3)).toThrow(RangeError);
    expect(() => sliceOf(m, -1)).toThrow(RangeError);
  });

  it('assembleCopy junta as partes com o perfil do manifesto', () => {
    const profile = { settings: { theme: 'dark' as const } };
    const m: CopyManifest = { ...manifest(), profile };
    const a: CopyPart = { sessions: [session('s1')], solves: [solve('a'), solve('b')], practice: [], duels: [] };
    const b: CopyPart = { sessions: [session('s2')], solves: [solve('c')], practice: [practice('p1')], duels: [duel('d1')] };
    const out = assembleCopy(m, [a, b]);
    expect(out).toEqual({
      format: 'klick', version: 1, exportedAt: m.exportedAt, profile,
      sessions: [session('s1'), session('s2')], solves: [solve('a'), solve('b'), solve('c')], practice: [practice('p1')], duels: [duel('d1')],
    });
    const empty = assembleCopy({ ...m, profile: null }, []);
    expect(empty.profile).toBeNull();
    expect(empty.practice).toEqual([]);
    expect(empty.duels).toEqual([]);
  });
});
