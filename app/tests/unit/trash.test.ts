import { describe, expect, it } from 'vitest';
import type { Session, Solve } from '../../src/core/types';
import { groupTrash } from '../../src/ui/trash';

const session = (id: string, deletedAt: number | null): Session => ({
  id, name: id, event: '333', order: 0, createdAt: 1, updatedAt: 1, deletedAt,
});
const solve = (id: string, sessionId: string, deletedAt: number | null): Solve => ({
  id, sessionId, event: '333', ms: 10_000, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1, updatedAt: 1, deletedAt,
});

describe('lixeira agrupada', () => {
  it('os solves que saíram junto com a sessão ficam dentro dela; os soltos, cada um na sua linha', () => {
    const trash = {
      sessions: [session('s1', 500)],
      solves: [
        solve('a', 's1', 500), // saiu junto com a sessão: volta com ela
        solve('b', 's1', 500),
        solve('c', 's1', 300), // excluído antes, sozinho: restaurar a sessão não o traz
        solve('d', 's2', 400), // de uma sessão ativa
      ],
    };
    const g = groupTrash(trash);
    expect(g.sessions).toEqual([{ session: trash.sessions[0], solves: 2 }]);
    expect(g.solves.map((s) => s.id)).toEqual(['c', 'd']);
    expect(g.count).toBe(3); // a sessão (com os dois dela) e os dois soltos
  });

  it('lixeira vazia', () => {
    expect(groupTrash({ sessions: [], solves: [] })).toEqual({ sessions: [], solves: [], count: 0 });
  });
});
