// A lixeira como a pessoa vê: os solves que saíram junto com a sessão (mesma marca de exclusão) ficam dentro dela, como uma contagem,
// porque restaurar a sessão os traz de volta (repositório: restoreSession). Os outros, excluídos um a um, ficam cada um na sua linha. Os
// desafios também, cada um na sua: nenhum sai junto com uma sessão.
import type { Duel, Session, Solve } from '../core/types';

export interface TrashView {
  sessions: { session: Session; solves: number }[];
  solves: Solve[]; // os soltos, na ordem que vieram (o excluído mais recentemente primeiro)
  duels?: Duel[]; // os desafios, na ordem que vieram; só quando a lixeira lida os traz
  count: number; // itens que a pessoa vê: sessões, solves soltos e desafios
}

export function groupTrash(trash: { sessions: Session[]; solves: Solve[]; duels?: Duel[] }): TrashView {
  const deletedAt = new Map(trash.sessions.map((s) => [s.id, s.deletedAt]));
  const inside = new Map<string, number>();
  const solves: Solve[] = [];
  for (const s of trash.solves) {
    const mark = deletedAt.get(s.sessionId);
    if (mark !== undefined && mark !== null && s.deletedAt === mark) inside.set(s.sessionId, (inside.get(s.sessionId) ?? 0) + 1);
    else solves.push(s);
  }
  const sessions = trash.sessions.map((session) => ({ session, solves: inside.get(session.id) ?? 0 }));
  const duels = trash.duels;
  return { sessions, solves, duels, count: sessions.length + solves.length + (duels?.length ?? 0) };
}
