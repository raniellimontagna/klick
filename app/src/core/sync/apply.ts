// Juntar um lote (spec 6.1 e 6.3), o mesmo código no servidor, no aparelho e na simulação. Quem chama dá uma vista dos registros
// (RecordView) e grava o que voltar em `writes`. Puro: a vista do aparelho é um mapa lido do IndexedDB antes; a do servidor, o SQLite do
// Durable Object.
import { ACCOUNT_LIMITS, isCounted, QUOTA_REASON, zeroCounts, type ActiveCounts, type CountedStore } from './limits';
import { canonicalJson, cascade, merge, mergeSeason } from './merge';
import { isCompacted, sessionOfChange } from './records';
import { checkChange } from './shape';
import { syncKey, type Change, type Rejected, type SyncStore } from './types';

export interface RecordView {
  get(store: SyncStore, id: string): Change | undefined;
  solvesOf(sessionId: string): Change[]; // todos os solves gravados da sessão, ativos e excluídos
}

export interface ApplyOptions {
  mode: 'server' | 'client';
  pending?: (store: SyncStore, id: string) => boolean; // no aparelho: o registro espera na fila de saída
  // A cota da conta (endurecimento 4.1), no sync do servidor: os ativos de cada store antes do lote e o teto (ACCOUNT_LIMITS, se faltar).
  // Sem ela (o aparelho, a restauração de uma cópia), nada é recusado pela cota.
  quota?: { active: ActiveCounts; limits?: Readonly<ActiveCounts> };
  // Uma recusa a mais, do servidor: o teto de bytes da conta (worker/account-store.ts). Vê o que a mudança deixa gravado (o resultado do
  // merge) e o que estava antes (a versão do lote, se o registro já veio antes nele), depois da cota; false recusa com QUOTA_REASON, como a
  // cota: nada muda, nem a cascata, e a vaga da cota fica para o que vem depois. `required`: a mudança passa de qualquer jeito (a sessão que
  // um solve do lote já pediu), e o teto só a conta. `asks`: a sessão cuja vaga este solve pede, na primeira vez no lote (a sessão que vier
  // depois dele vai passar como obrigatória: o teto a paga adiantado aqui); null nos outros casos.
  admit?: (before: Change | undefined, next: Change, required: boolean, asks: string | null) => boolean;
  // O piso da restauração, no servidor (worker/account-store.ts, restoreFloor: a data da última restauração no servidor). A restauração por
  // diferenças não regrava o que a cópia já tem, e uma mudança de antes dela (uma edição offline, a fila de uma restauração pelo aparelho)
  // venceria o registro que ela deixou como estava. Com as duas datas abaixo do piso, uma mudança que mudaria um registro que a conta já tem
  // perde: a versão da conta fica, com as datas subidas ao piso, e volta para quem mandou e para os outros aparelhos (o merge de cada um vê
  // a data do piso acima da dele, e todos convergem). A que não mudaria nada (igual, ou já perdendo pelo merge) segue como sempre: o
  // primeiro login de um aparelho que já tinha a conta manda tudo de novo, e nada vira escrita. O registro que a conta não tem passa (criado
  // offline), e a temporada fica com mergeSeason.
  floor?: number;
}

export interface ApplyResult {
  writes: Change[]; // o resultado de cada registro que muda (um por chave)
  derived: string[]; // chaves que mudaram pela cascata, não pelo lote: no aparelho, vão para a fila de saída
  rejected: Rejected[];
  deletedSolves: number; // solves ativos na vista que terminam excluídos (a proteção da spec 6.6)
  activeDelta: ActiveCounts; // ativos depois menos ativos antes, por store contada, dos registros em `writes` (a cascata inclusive)
}

// O eco de uma mudança recusada (store e id em `rejected`) vem do pedido: texto de até 96 caracteres, o tamanho de um id válido. Um objeto
// vira o nome do tipo: o String() de um objeto do JSON com um `toString` próprio que não é função lança erro.
const ECHO_CHARS = 96;
const echo = (v: unknown): string => (typeof v === 'object' && v !== null ? Object.prototype.toString.call(v) : String(v)).slice(0, ECHO_CHARS);

const activeOf = (c: Change | undefined): number => (c !== undefined && c.deletedAt === null ? 1 : 0);

export function sameChange(a: Change | undefined, b: Change | undefined): boolean {
  if (!a || !b) return a === b;
  return (
    a.updatedAt === b.updatedAt && a.deletedAt === b.deletedAt && a.deletionStamp === b.deletionStamp && canonicalJson(a.data) === canonicalJson(b.data)
  );
}

// No servidor, a temporada é decidida por mergeSeason; no aparelho, o valor do servidor é adotado, a não ser que o daqui ainda espere na
// fila (ele sobe, o servidor decide e o resultado volta). O resto segue merge. No servidor, um registro cujo resultado difere do que
// chegou também volta em `writes` (ganha revisão): o aparelho que mandou uma versão velha recebe a vencedora.
//
// A cota (quota): um contador corrente parte dos ativos de antes do lote. Uma mudança que deixa ativo um registro contado que não estava
// (ausente ou na lixeira) só entra com o contador da store abaixo do teto; senão volta em `rejected` com QUOTA_REASON e não muda nada (nem
// a cascata da sessão dela). Decide o resultado do merge, não o que chegou: uma versão ativa velha de um registro apagado continua apagada
// e não conta. Um solve ou tentativa que passa a excluído abre a vaga para o que vem depois no lote.
//
// As sessões contam vagas, que só abrem no lote seguinte: a cascata, que vem depois do lote, devolve a sessão de um solve ativo mais novo
// que a exclusão dela, então uma sessão que o lote apaga pode terminar ativa. Por isso, um solve que passa a ativo (ou muda de sessão) numa
// sessão que não está ativa e que a cascata devolveria (ausente, ou na lixeira com uma exclusão anterior à dele) ocupa a vaga dela, uma vez
// por sessão no lote; sem vaga, ele volta com o motivo da cota também. Assim nenhum recusado é gravado como chegou, nenhum solve ativo
// gravado fica sem a sessão, e nenhuma store termina acima do teto (ou do que já tinha). A única escrita de um recusado é a da cascata, e
// apagada: o lote apaga a sessão de um solve cuja mudança para outra sessão foi recusada, e a versão gravada, que continua nela, vai junto.
// Editar um solve ativo sem mudar a sessão passa sempre. activeDelta conta tudo, a cascata inclusive.
//
// O teto do servidor (admit) segue a mesma regra das vagas: uma sessão que ele recusa leva junto, com o mesmo motivo, cada solve do lote que
// pediria a vaga dela (o solve ficaria órfão nos outros aparelhos, ou a cascata devolveria a sessão recusada). E a sessão que um solve do lote
// já pediu antes dela não pode mais ser recusada (o solve já entrou): ela passa como obrigatória. Para o teto continuar sendo teto, o admit
// sabe qual sessão o solve pede (asks) e a paga adiantado nele, que pode não crescer nada (movido, ou restaurado numa sessão da lixeira).
//
// A marca compactada (records.ts) de um registro que a vista não tem (nem antes no lote) não é gravada, nos dois modos, nem recusada: um
// aparelho que nunca teve o solve (ou já o tirou da lixeira) não ganha um registro sem campos, e o servidor não guarda uma marca que nenhum
// aparelho mandaria. Uma recusa marcaria refusedBuild no aparelho, e cada versão nova do app baixaria a conta inteira de novo por ela.
export function applyChanges(view: RecordView, incoming: readonly unknown[], opts: ApplyOptions): ApplyResult {
  const overlay = new Map<string, Change>();
  const rejected: Rejected[] = [];
  const sessions = new Set<string>();
  // O que a vista tem de cada chave, lido uma vez: no servidor, cada leitura é uma consulta ao SQLite, e o fim do lote compara cada escrita
  // com a versão gravada (activeDelta, deletedSolves) sem ler de novo.
  const seen = new Map<string, Change | undefined>();
  const stored = (store: SyncStore, id: string): Change | undefined => {
    const key = syncKey(store, id);
    if (!seen.has(key)) seen.set(key, view.get(store, id));
    return seen.get(key);
  };
  const current = (store: SyncStore, id: string): Change | undefined => overlay.get(syncKey(store, id)) ?? stored(store, id);
  const count = opts.quota ? { ...opts.quota.active } : null;
  const limits = opts.quota?.limits ?? ACCOUNT_LIMITS;
  // As sessões que já têm vaga neste lote: as que entraram, as que um solve pediu e as ativas que o lote apagou.
  const seated = new Set<string>();
  // O teto do servidor (admit): as sessões que ele recusou neste lote, e as que um solve do lote já pediu (essas ele não recusa mais).
  const blocked = new Set<string>();
  const asked = new Set<string>();
  // A sessão que precisa de vaga para `next` ficar como está: a própria, quando volta a ativa; a de um solve que passa a ativo ou muda de
  // sessão, quando ela não está ativa e a cascata a devolveria (com uma exclusão igual ou mais nova, a cascata apaga o solve).
  const seatFor = (before: Change | undefined, next: Change): string | null => {
    if (next.store === 'sessions') return activeOf(next) > activeOf(before) ? next.id : null;
    if (next.store !== 'solves' || next.deletedAt !== null) return null;
    const sid = sessionOfChange(next);
    if (sid === null || (before?.deletedAt === null && sessionOfChange(before) === sid)) return null;
    const session = current('sessions', sid);
    if (session && (session.deletedAt === null || session.deletionStamp >= next.deletionStamp)) return null;
    return sid;
  };

  for (const raw of incoming) {
    const checked = checkChange(raw);
    if (!checked.ok) {
      const r = raw as { store?: unknown; id?: unknown } | null;
      rejected.push({ store: echo(r?.store), id: echo(r?.id), reason: checked.reason });
      continue;
    }
    const change = checked.change;
    const before = current(change.store, change.id);
    if (before === undefined && isCompacted(change)) continue;
    let next: Change;
    if (change.store === 'prefs' && change.id === 'season') {
      if (opts.mode === 'server') next = before ? mergeSeason(before, change) : change;
      else next = before && opts.pending?.('prefs', 'season') ? before : change;
    } else {
      next = before ? merge(before, change) : change;
      const floor = opts.floor ?? 0;
      if (before && change.updatedAt < floor && change.deletionStamp < floor && !sameChange(before, next)) {
        next = { ...before, updatedAt: Math.max(before.updatedAt, floor), deletionStamp: Math.max(before.deletionStamp, floor) };
      }
    }
    const store = next.store;
    const seat = count || opts.admit ? seatFor(before, next) : null;
    if (store === 'solves' && seat !== null && blocked.has(seat)) {
      rejected.push({ store, id: next.id, reason: QUOTA_REASON });
      continue;
    }
    let claim: { store: CountedStore; step: number; newSeat: boolean } | null = null;
    if (count && isCounted(store)) {
      const step = activeOf(next) - activeOf(before);
      const newSeat = seat !== null && !seated.has(seat);
      const own = store !== 'sessions' && step > 0 && count[store] >= limits[store];
      if (own || (newSeat && count.sessions >= limits.sessions)) {
        rejected.push({ store, id: next.id, reason: QUOTA_REASON });
        continue;
      }
      claim = { store, step, newSeat };
    }
    if (opts.admit) {
      const required = store === 'sessions' && asked.has(next.id);
      const asks = store === 'solves' && seat !== null && !asked.has(seat) ? seat : null;
      if (!opts.admit(before, next, required, asks) && !required) {
        if (store === 'sessions') blocked.add(next.id);
        rejected.push({ store, id: next.id, reason: QUOTA_REASON });
        continue;
      }
    }
    if (count && claim) {
      if (claim.store !== 'sessions') count[claim.store] += claim.step;
      if (claim.newSeat) count.sessions++;
      if (seat !== null) seated.add(seat);
      if (claim.store === 'sessions' && claim.step < 0) seated.add(next.id); // a vaga dela só abre no lote seguinte
    }
    if (store === 'solves' && seat !== null) asked.add(seat);
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
      const key = syncKey('solves', s.id);
      if (!seen.has(key)) seen.set(key, s);
      const latest = overlay.get(key) ?? s;
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
  const activeDelta = zeroCounts();
  for (const c of overlay.values()) {
    const was = stored(c.store, c.id);
    if (c.store === 'solves' && c.deletedAt !== null && was?.deletedAt === null) deletedSolves++;
    if (isCounted(c.store)) activeDelta[c.store] += activeOf(c) - activeOf(was);
  }
  return { writes: [...overlay.values()], derived: [...derived], rejected, deletedSolves, activeDelta };
}
