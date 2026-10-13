// A lixeira como a pessoa vê: os solves que saíram junto com a sessão (mesma marca de exclusão) ficam dentro dela, como uma contagem,
// porque restaurar a sessão os traz de volta (repositório: restoreSession). Os outros, excluídos um a um, ficam cada um na sua linha.
import type { Session, Solve } from '../core/types';

export interface TrashView {
  sessions: { session: Session; solves: number }[];
  solves: Solve[]; // os soltos, na ordem que vieram (o excluído mais recentemente primeiro)
  count: number; // itens que a pessoa vê: sessões e solves soltos
}

export function groupTrash(trash: { sessions: Session[]; solves: Solve[] }): TrashView {
  const deletedAt = new Map(trash.sessions.map((s) => [s.id, s.deletedAt]));
  const inside = new Map<string, number>();
  const solves: Solve[] = [];
  for (const s of trash.solves) {
    const mark = deletedAt.get(s.sessionId);
    if (mark !== undefined && mark !== null && s.deletedAt === mark) inside.set(s.sessionId, (inside.get(s.sessionId) ?? 0) + 1);
    else solves.push(s);
  }
  const sessions = trash.sessions.map((session) => ({ session, solves: inside.get(session.id) ?? 0 }));
  return { sessions, solves, count: sessions.length + solves.length };
}
