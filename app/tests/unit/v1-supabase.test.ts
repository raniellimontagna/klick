import { describe, expect, it } from 'vitest';
import { parseKlickJson } from '../../src/data/transfer';
import { fingerprint } from '../../src/data/repository';
import { mark, missingFromV1 } from '../../scripts/v1-supabase-map.mjs';

const session = { id: 'sess-1', name: 'Principal', puzzle_type: '3x3', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-03-01T10:00:00Z' };
const solve = (id: string, minute: number, o: Partial<{ time_ms: number; penalty: 'NONE' | '+2' | 'DNF' }> = {}) => ({
  id, session_id: 'sess-1', time_ms: o.time_ms ?? 12_345, penalty: o.penalty ?? 'NONE', scramble: "R U R'",
  created_at: `2026-03-01T10:${String(minute).padStart(2, '0')}:00Z`, updated_at: `2026-03-01T10:${String(minute).padStart(2, '0')}:00Z`,
});

describe('o script do Supabase da v1 (spec D10)', () => {
  it('converte para o arquivo do Klick com os ids da v1, e o arquivo passa no import do app', () => {
    const file = missingFromV1([session], [solve('v1-a', 1, { penalty: '+2' })], { sessions: [], solves: [] }, 1);
    const parsed = parseKlickJson(JSON.stringify(file));
    expect(parsed.sessions).toMatchObject([{ id: 'sess-1', name: 'Principal', event: '333' }]);
    expect(parsed.solves).toMatchObject([{ id: 'v1-a', sessionId: 'sess-1', event: '333', ms: 12_345, penalty: '+2', at: Date.parse('2026-03-01T10:01:00Z') }]);
  });

  it('o que já está no Klick, pelo id ou pela marca do solve, fica de fora; a sessão que já existe não vem de novo', () => {
    const existing = {
      sessions: [{ id: 'sess-1' }],
      solves: [
        { id: 'v1-a', event: '333', at: 0, ms: 1, penalty: null, scramble: '' },
        { id: 'cs-outro', event: '333', at: Date.parse('2026-03-01T10:02:00Z'), ms: 12_345, penalty: null, scramble: "R U R'" },
      ],
    };
    const file = missingFromV1([session], [solve('v1-a', 1), solve('v1-b', 2), solve('v1-c', 3)], existing, 1);
    expect(file.solves.map((s) => s.id)).toEqual(['v1-c']);
    expect(file.sessions).toEqual([]);
  });

  // O script não importa o núcleo em TS, então a marca existe nos dois lados: os dois têm de dar a mesma para o mesmo solve.
  it('a marca do solve é a mesma da deduplicação do primeiro login', () => {
    const rows = [solve('v1-a', 1), solve('v1-b', 2, { penalty: '+2' }), solve('v1-c', 3, { penalty: 'DNF', time_ms: 0 })];
    const parsed = parseKlickJson(JSON.stringify(missingFromV1([session], rows, { sessions: [], solves: [] }, 1)));
    expect(parsed.solves).toHaveLength(3);
    for (const s of parsed.solves) expect(mark(s)).toBe(fingerprint(s));
  });
});
