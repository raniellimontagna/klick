// Juntar um lote (spec 6.1 e 6.3), o mesmo código no servidor, no aparelho e na simulação. Quem chama dá uma vista dos registros
// (RecordView) e grava o que voltar em `writes`. Puro: a vista do aparelho é um mapa lido do IndexedDB antes; a do servidor, o SQLite do
// Durable Object.
import { canonicalJson, cascade, merge, mergeSeason } from './merge';
import { sessionOfChange } from './records';
import { checkChange } from './shape';
import { syncKey, type Change, type Rejected, type SyncStore } from './types';

export interface RecordView {
  get(store: SyncStore, id: string): Change | undefined;
  solvesOf(sessionId: string): Change[]; // todos os solves gravados da sessão, ativos e excluídos
}

export interface ApplyOptions {
  mode: 'server' | 'client';
  pending?: (store: SyncStore, id: string) => boolean; // no aparelho: o registro espera na fila de saída
}

export interface ApplyResult {
  writes: Change[]; // o resultado de cada registro que muda (um por chave)
  derived: string[]; // chaves que mudaram pela cascata, não pelo lote: no aparelho, vão para a fila de saída
  rejected: Rejected[];
  deletedSolves: number; // solves ativos na vista que terminam excluídos (a proteção da spec 6.6)
}

export function sameChange(a: Change | undefined, b: Change | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.updatedAt === b.updatedAt && a.deletedAt === b.deletedAt && a.deletionStamp === b.deletionStamp && canonicalJson(a.data) === canonicalJson(b.data)
  );
}

// No servidor, a temporada é decidida por mergeSeason; no aparelho, o valor do servidor é adotado, a não ser que o daqui ainda espere na
// fila (ele sobe, o servidor decide e o resultado volta). O resto segue merge. No servidor, um registro cujo resultado difere do que
// chegou também volta em `writes` (ganha revisão): o aparelho que mandou uma versão velha recebe a vencedora.
export function applyChanges(view: RecordView, incoming: readonly unknown[], opts: ApplyOptions): ApplyResult {
  const overlay = new Map<string, Change>();
  const rejected: Rejected[] = [];
  const sessions = new Set<string>();
  const current = (store: SyncStore, id: string): Change | undefined => overlay.get(syncKey(store, id)) ?? view.get(store, id);

  for (const raw of incoming) {
    const checked = checkChange(raw);
    if (!checked.ok) {
      const r = raw as { store?: unknown; id?: unknown } | null;
      rejected.push({ store: String(r?.store), id: String(r?.id), reason: checked.reason });
      continue;
    }
    const change = checked.change;
    const before = current(change.store, change.id);
    let next: Change;
    if (change.store === 'prefs' && change.id === 'season') {
      if (opts.mode === 'server') next = before ? mergeSeason(before, change) : change;
      else next = before && opts.pending?.('prefs', 'season') ? before : change;
    } else {
      next = before ? merge(before, change) : change;
    }
    const stale = opts.mode === 'server' && !sameChange(change, next);
    if (!sameChange(before, next) || stale) overlay.set(syncKey(next.store, next.id), next);
    if (change.store === 'sessions') sessions.add(change.id);
    const sid = sessionOfChange(next);
    if (sid) sessions.add(sid);
  }

  // A cascata só age numa sessão excluída (cascade devolve tudo como está numa ativa): numa ativa ou ausente, nem se leem os solves, que no
  // primeiro sync de uma conta grande seriam todos. Os solves de `sid` são a última versão de cada um (a do lote, senão a gravada) que
  // ainda aponta para `sid`: o mesmo id pode chegar sob outra sessão (decisão 13, ou um arquivo do Klick mais recente), e esse solve já
  // é da outra, que a cascata de `sid` não pode apagar nem devolver.
  const derived = new Set<string>();
  for (const sid of sessions) {
    const session = current('sessions', sid);
    if (!session || session.deletedAt === null) continue;
    const solves = new Map<string, Change>();
    for (const s of view.solvesOf(sid)) {
      const latest = overlay.get(syncKey('solves', s.id)) ?? s;
      if (sessionOfChange(latest) === sid) solves.set(s.id, latest);
    }
    for (const c of overlay.values()) if (sessionOfChange(c) === sid) solves.set(c.id, c);
    const out = cascade(session, [...solves.values()]);
    for (const s of out.solves) {
      overlay.set(syncKey('solves', s.id), s);
      derived.add(syncKey('solves', s.id));
    }
    if (!sameChange(session, out.session)) {
      overlay.set(syncKey('sessions', sid), out.session);
      derived.add(syncKey('sessions', sid));
    }
  }

  let deletedSolves = 0;
  for (const c of overlay.values()) if (c.store === 'solves' && c.deletedAt !== null && view.get('solves', c.id)?.deletedAt === null) deletedSolves++;
  return { writes: [...overlay.values()], derived: [...derived], rejected, deletedSolves };
}
