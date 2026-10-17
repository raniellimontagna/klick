import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { applyChanges, sameChange, type RecordView } from '../../src/core/sync/apply';
import { ACCOUNT_LIMITS, QUOTA_REASON, type ActiveCounts } from '../../src/core/sync/limits';
import { compacted, sessionOfChange } from '../../src/core/sync/records';
import { checkChange } from '../../src/core/sync/shape';
import { syncKey, type Change, type SyncStore } from '../../src/core/sync/types';
import type { SeasonProgress, SeasonRecord } from '../../src/core/types';
import { MapView } from './sync-fakes';
import { seeded } from './sync-random';

const solve = (id: string, o: Partial<Change> & { sessionId?: string } = {}): Change => {
  const { sessionId = 's1', ...rest } = o;
  return {
    store: 'solves', id, data: { sessionId, event: '333', ms: 1000, penalty: null, at: 1, scramble: 'R', note: '', createdAt: 1 },
    updatedAt: 10, deletedAt: null, deletionStamp: 10, ...rest,
  };
};
const session = (id: string, o: Partial<Change> = {}): Change => ({
  store: 'sessions', id, data: { name: 'S', event: '333', order: 0, createdAt: 1 }, updatedAt: 10, deletedAt: null, deletionStamp: 10, ...o,
});
const viewOf = (...list: Change[]): MapView => new MapView(new Map(list.map((c) => [syncKey(c.store, c.id), c])));
const keys = (list: readonly Change[]): string[] => list.map((c) => syncKey(c.store, c.id)).sort();

const rec = (n: number, endedAt: number): SeasonRecord => ({ n, startedAt: 0, endedAt, solves: 1000, startAo12: null, endAo12: null });
const season = (past: SeasonRecord[]): SeasonProgress => ({ ...defaultSeason(), past, current: { ...defaultSeason().current, n: past.length + 1 } });
const seasonPref = (data: SeasonProgress, updatedAt: number): Change => ({ store: 'prefs', id: 'season', data, updatedAt, deletedAt: null, deletionStamp: updatedAt });

describe('sessionOfChange', () => {
  it('é a sessão de um solve; null para outra store ou para um sessionId que não é texto', () => {
    expect(sessionOfChange(solve('a', { sessionId: 'ses9' }))).toBe('ses9');
    expect(sessionOfChange(session('ses9'))).toBeNull();
    expect(sessionOfChange({ ...solve('a'), data: { sessionId: 7 } })).toBeNull();
    expect(sessionOfChange({ ...solve('a'), data: null })).toBeNull();
  });
});

describe('applyChanges: um lote (spec 6.1 e 6.3)', () => {
  it('ids como __proto__ e constructor valem: nada indexa um objeto pelo id', () => {
    const view = viewOf(session('__proto__'), solve('constructor', { sessionId: '__proto__' }), solve('__proto__', { sessionId: '__proto__' }));
    const out = applyChanges(view, [session('__proto__', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 })], { mode: 'client' });
    expect(out.rejected).toEqual([]);
    expect(keys(out.writes)).toEqual(['sessions/__proto__', 'solves/__proto__', 'solves/constructor']);
    expect(out.writes.every((c) => c.deletedAt === 50 && c.deletionStamp === 50)).toBe(true);
    expect(out.derived.slice().sort()).toEqual(['solves/__proto__', 'solves/constructor']);
    expect(out.deletedSolves).toBe(2);
  });

  it('o que não é uma mudança válida volta em rejected, com o motivo, e o resto do lote entra', () => {
    const out = applyChanges(viewOf(), [null, { store: 'solves', id: 'x' }, session('ok')], { mode: 'server' });
    expect(out.rejected.map((r) => r.reason)).toEqual(['mudança não é objeto', 'datas inválidas']);
    expect(out.rejected[1]).toMatchObject({ store: 'solves', id: 'x' });
    expect(keys(out.writes)).toEqual(['sessions/ok']);
  });

  it('o eco do que foi recusado é curto (store e id com até 96 caracteres) e nada vindo do JSON quebra a conversão em texto', () => {
    const long = 'a'.repeat(5000);
    const out = applyChanges(viewOf(), [{ store: long, id: long }, { store: 'solves', id: { toString: 1 } }, { store: ['x'.repeat(200)], id: 7 }], { mode: 'server' });
    expect(out.rejected).toEqual([
      { store: 'a'.repeat(96), id: 'a'.repeat(96), reason: 'store desconhecida' },
      { store: 'solves', id: '[object Object]', reason: 'id inválido' },
      { store: '[object Array]', id: '7', reason: 'store desconhecida' },
    ]);
  });

  it('no servidor, uma versão velha volta em writes com a vencedora; no aparelho não há o que gravar', () => {
    const stored = solve('a', { updatedAt: 30, data: { ...(solve('a').data as object), note: 'nova' } });
    const old = solve('a', { updatedAt: 20 });
    const view = viewOf(session('s1'), stored);
    const atServer = applyChanges(view, [old], { mode: 'server' });
    expect(atServer.writes).toHaveLength(1);
    expect(sameChange(atServer.writes[0], stored)).toBe(true);
    expect(applyChanges(view, [old], { mode: 'client' }).writes).toEqual([]);
  });

  it('o que chega igual ao que já está não vira escrita, em nenhum dos modos', () => {
    const view = viewOf(session('s1'), solve('a'));
    expect(applyChanges(view, [solve('a')], { mode: 'server' }).writes).toEqual([]);
    expect(applyChanges(view, [solve('a')], { mode: 'client' }).writes).toEqual([]);
  });

  it('a cascata de uma sessão apagada atinge os solves ativos que o lote não trouxe, e só esses', () => {
    const view = viewOf(session('s1'), solve('a'), solve('b', { deletedAt: 5, deletionStamp: 5 }));
    const out = applyChanges(view, [session('s1', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 })], { mode: 'client' });
    expect(keys(out.writes)).toEqual(['sessions/s1', 'solves/a']);
    expect(out.derived).toEqual(['solves/a']);
    expect(out.deletedSolves).toBe(1); // b já estava excluído
  });

  it('um solve gravado depois da exclusão devolve a sessão, com o deletionStamp dele, e a sessão vai para a fila', () => {
    const view = viewOf(session('s1', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 }));
    const out = applyChanges(view, [solve('n', { deletionStamp: 80, updatedAt: 80 })], { mode: 'client' });
    expect(out.derived).toEqual(['sessions/s1']);
    const back = out.writes.find((c) => c.store === 'sessions')!;
    expect(back).toMatchObject({ deletedAt: null, deletionStamp: 80 });
    expect(out.deletedSolves).toBe(0);
  });

  it('a temporada: o servidor usa mergeSeason; o aparelho adota a do servidor, a não ser que a daqui espere na fila', () => {
    const mine = seasonPref(season([rec(1, 100), rec(2, 200)]), 5);
    const theirs = seasonPref(season([rec(1, 100)]), 9);
    const view = viewOf(mine);
    // Servidor: nunca regride; o registro muda (updatedAt sobe) e volta em writes.
    const atServer = applyChanges(view, [theirs], { mode: 'server' });
    expect((atServer.writes[0].data as SeasonProgress).past).toHaveLength(2);
    expect(atServer.writes[0].updatedAt).toBe(9);
    // Aparelho: o valor do servidor é adotado, mesmo sendo o que tem menos fechadas...
    const adopted = applyChanges(view, [theirs], { mode: 'client', pending: () => false });
    expect((adopted.writes[0].data as SeasonProgress).past).toHaveLength(1);
    // ...e o daqui que espera na fila fica, para subir e o servidor decidir.
    const kept = applyChanges(view, [theirs], { mode: 'client', pending: (s, id) => s === 'prefs' && id === 'season' });
    expect(kept.writes).toEqual([]);
  });
});

// A marca compactada (endurecimento, decisão 5): de um solve apagado há mais de 30 dias, o servidor guarda só as datas, com `data: {}`.
describe('a marca compactada', () => {
  const gone = { updatedAt: 40, deletedAt: 40, deletionStamp: 40 };
  const mark = compacted(solve('a', gone));

  it('uma marca compactada passa por checkChange', () => {
    expect(mark).toEqual({ store: 'solves', id: 'a', data: {}, ...gone });
    expect(checkChange(mark)).toEqual({ ok: true, change: mark });
    // Só a de um solve apagado: ativo, de outra store, ou com parte do conteúdo, continua torto.
    expect(checkChange({ ...mark, deletedAt: null })).toEqual({ ok: false, reason: 'solve inválido' });
    expect(checkChange({ ...mark, data: { sessionId: 's1' } })).toEqual({ ok: false, reason: 'solve inválido' });
    expect(checkChange({ ...mark, data: [] })).toEqual({ ok: false, reason: 'data não é objeto' });
    expect(checkChange({ ...session('s1', gone), data: {} })).toEqual({ ok: false, reason: 'sessão inválida' });
  });

  it('uma marca compactada de um registro que não existe não é gravada, nos dois modos', () => {
    for (const mode of ['server', 'client'] as const) {
      const out = applyChanges(viewOf(session('s1')), [mark], { mode });
      expect(out.writes, mode).toEqual([]);
      expect(out.rejected, mode).toEqual([]);
      expect(out.derived, mode).toEqual([]);
      expect(out.activeDelta, mode).toEqual({ solves: 0, sessions: 0, practice: 0 });
    }
  });

  it('a marca de um registro que existe apaga o solve e deixa o conteúdo daqui; o mesmo registro, antes no lote, também conta', () => {
    for (const mode of ['server', 'client'] as const) {
      const out = applyChanges(viewOf(session('s1'), solve('a')), [mark], { mode });
      expect(out.writes, mode).toEqual([{ ...solve('a'), deletedAt: 40, deletionStamp: 40 }]);
      expect(out.deletedSolves, mode).toBe(1);
      const inBatch = applyChanges(viewOf(session('s1')), [solve('a'), mark], { mode });
      expect(inBatch.writes, mode).toEqual([{ ...solve('a'), deletedAt: 40, deletionStamp: 40 }]);
    }
    // No aparelho que já tem o solve apagado com as mesmas datas (o empate exato), nada muda.
    expect(applyChanges(viewOf(session('s1'), solve('a', gone)), [mark], { mode: 'client' }).writes).toEqual([]);
  });
});

describe('applyChanges: um solve que muda de sessão no lote (decisão 13: o mesmo id sob outra sessão)', () => {
  const stamp = { updatedAt: 50, deletedAt: 50, deletionStamp: 50 };

  // Um solve de X chega apontando para Y, que está ativa. A cascata de X não pode contá-lo (X só vale para o que ainda é de X): nem
  // apagá-lo, nem devolver X por causa dele.
  it.each(['server', 'client'] as const)('a exclusão de X não pega o solve que chega em Y, e um solve novo em Y não revive X (modo %s)', (mode) => {
    for (const newer of [false, true]) {
      const moved = solve('a', { sessionId: 'Y', updatedAt: 20, deletionStamp: newer ? 80 : 10 });
      // Lote com a exclusão de X e o solve já em Y, sobre um aparelho que ainda tem o solve em X.
      const view = viewOf(session('X'), session('Y'), solve('a', { sessionId: 'X' }));
      const out = applyChanges(view, [session('X', stamp), moved], { mode });
      const written = new Map(out.writes.map((c) => [syncKey(c.store, c.id), c]));
      expect(written.get('sessions/X'), `X, solve mais novo: ${newer}`).toMatchObject({ deletedAt: 50, deletionStamp: 50 });
      expect(written.get('solves/a')?.deletedAt ?? null, `a, solve mais novo: ${newer}`).toBeNull();
      expect(out.derived, `derived, solve mais novo: ${newer}`).toEqual([]);
      expect(out.deletedSolves).toBe(0);

      // Já guardado: X excluída, o solve ainda lá com X, e só o solve em Y no lote.
      const stored = viewOf(session('X', stamp), session('Y'), solve('a', { sessionId: 'X' }));
      const only = applyChanges(stored, [moved], { mode });
      const after = new Map(only.writes.map((c) => [syncKey(c.store, c.id), c]));
      expect(after.get('solves/a')?.deletedAt ?? null, `a sozinho, solve mais novo: ${newer}`).toBeNull();
      expect(after.has('sessions/X'), `X sozinha, solve mais novo: ${newer}`).toBe(false);
      expect(only.derived).toEqual([]);
    }
  });

  it('o solve que continua em X ainda recebe a cascata de X, ao lado do que saiu para Y', () => {
    const view = viewOf(session('X'), session('Y'), solve('a', { sessionId: 'X' }), solve('b', { sessionId: 'X' }));
    const out = applyChanges(view, [session('X', stamp), solve('a', { sessionId: 'Y', updatedAt: 20 })], { mode: 'client' });
    const written = new Map(out.writes.map((c) => [syncKey(c.store, c.id), c]));
    expect(written.get('solves/b')).toMatchObject({ deletedAt: 50, deletionStamp: 50 });
    expect(written.get('solves/a')?.deletedAt ?? null).toBeNull();
    expect(out.derived).toEqual(['solves/b']);
  });
});

describe('applyChanges: só lê os solves de uma sessão excluída (o 1º sync de 50 mil solves)', () => {
  // Uma vista que conta as leituras de solvesOf.
  const spied = (...list: Change[]): { view: RecordView; calls: string[] } => {
    const inner = viewOf(...list);
    const calls: string[] = [];
    return {
      calls,
      view: {
        get: (store: SyncStore, id: string) => inner.get(store, id),
        solvesOf: (sid: string) => (calls.push(sid), inner.solvesOf(sid)),
      },
    };
  };

  it('sessão ativa, ou que nem existe: solvesOf não é chamada', () => {
    const { view, calls } = spied(session('act'), solve('a', { sessionId: 'act' }));
    const batch = [solve('n', { sessionId: 'act' }), solve('o', { sessionId: 'sumida' }), session('nova')];
    applyChanges(view, batch, { mode: 'server' });
    applyChanges(view, batch, { mode: 'client' });
    expect(calls).toEqual([]);
  });

  it('sessão excluída: solvesOf é chamada, uma vez, e a cascata continua valendo', () => {
    const { view, calls } = spied(session('act'), solve('a', { sessionId: 'act' }));
    const out = applyChanges(view, [session('act', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 })], { mode: 'server' });
    expect(calls).toEqual(['act']);
    expect(keys(out.writes)).toEqual(['sessions/act', 'solves/a']);
  });
});

describe('a cota (endurecimento 4.1)', () => {
  // A conta cheia de solves: dois ativos (a e b) e um na lixeira (velho), no teto de 2.
  const quota = { active: { solves: 2, sessions: 1, practice: 0 }, limits: { solves: 2, sessions: 5, practice: 5 } };
  const full = (): MapView => viewOf(session('s1'), solve('a'), solve('b'), solve('velho', { deletedAt: 5, deletionStamp: 5 }));
  const gone = { updatedAt: 20, deletedAt: 20, deletionStamp: 20 };
  const practice = (id: string): Change => ({
    store: 'practice', id, data: { caseId: 'T', ms: 1000, ok: true, helped: false, at: 1 }, updatedAt: 10, deletedAt: null, deletionStamp: 10,
  });

  it('um solve novo além do limite volta com o motivo da cota e não é gravado', () => {
    const out = applyChanges(full(), [solve('novo')], { mode: 'server', quota });
    expect(out.rejected).toEqual([{ store: 'solves', id: 'novo', reason: QUOTA_REASON }]);
    expect(out.writes).toEqual([]);
    expect(out.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
  });

  it('editar e apagar um solve ativo passam com a conta cheia', () => {
    const edited = applyChanges(full(), [solve('a', { updatedAt: 20, data: { ...(solve('a').data as object), note: 'editado' } })], { mode: 'server', quota });
    expect(edited.rejected).toEqual([]);
    expect(keys(edited.writes)).toEqual(['solves/a']);
    expect(edited.activeDelta.solves).toBe(0);
    const deleted = applyChanges(full(), [solve('a', gone)], { mode: 'server', quota });
    expect(deleted.rejected).toEqual([]);
    expect(keys(deleted.writes)).toEqual(['solves/a']);
    expect(deleted.activeDelta.solves).toBe(-1);
  });

  it('restaurar da lixeira com a conta cheia conta como novo', () => {
    const out = applyChanges(full(), [solve('velho', { deletionStamp: 20 })], { mode: 'server', quota });
    expect(out.rejected).toEqual([{ store: 'solves', id: 'velho', reason: QUOTA_REASON }]);
    expect(out.writes).toEqual([]);
  });

  it('o resultado do merge decide, não o que chegou: uma versão ativa velha de um solve na lixeira continua apagada e não é recusada', () => {
    const out = applyChanges(full(), [solve('velho', { deletionStamp: 3 })], { mode: 'server', quota });
    expect(out.rejected).toEqual([]);
    expect(out.writes.map((c) => c.deletedAt)).toEqual([5]); // a vencedora volta para quem mandou a velha
    expect(out.activeDelta.solves).toBe(0);
  });

  it('uma exclusão antes, no mesmo lote, abre a vaga do solve que vem depois', () => {
    const out = applyChanges(full(), [solve('a', gone), solve('novo')], { mode: 'server', quota });
    expect(out.rejected).toEqual([]);
    expect(keys(out.writes)).toEqual(['solves/a', 'solves/novo']);
    expect(out.activeDelta.solves).toBe(0);
    // Na ordem inversa, a vaga ainda não existe quando o novo chega.
    const late = applyChanges(full(), [solve('novo'), solve('a', gone)], { mode: 'server', quota });
    expect(late.rejected).toEqual([{ store: 'solves', id: 'novo', reason: QUOTA_REASON }]);
    expect(keys(late.writes)).toEqual(['solves/a']);
    expect(late.activeDelta.solves).toBe(-1);
  });

  it('o mesmo solve criado e apagado no lote ocupa a vaga só enquanto está ativo', () => {
    const room = { ...quota, active: { ...quota.active, solves: 1 } };
    const out = applyChanges(full(), [solve('novo'), solve('novo', gone), solve('outro')], { mode: 'server', quota: room });
    expect(out.rejected).toEqual([]);
    expect(keys(out.writes)).toEqual(['solves/novo', 'solves/outro']);
    expect(out.activeDelta.solves).toBe(1);
  });

  it('activeDelta conta a cascata da sessão apagada', () => {
    const view = viewOf(session('s1'), solve('a'), solve('b'), solve('c'), solve('d', { deletedAt: 5, deletionStamp: 5 }));
    const batch = [session('s1', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 })];
    for (const opts of [{ mode: 'server', quota }, { mode: 'server' }, { mode: 'client' }] as const) {
      const out = applyChanges(view, batch, opts);
      expect(out.rejected).toEqual([]);
      expect(out.activeDelta).toEqual({ solves: -3, sessions: -1, practice: 0 });
      expect(out.deletedSolves).toBe(3);
    }
  });

  it('activeDelta conta a sessão que a cascata devolve', () => {
    const view = viewOf(session('s1', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 }));
    const out = applyChanges(view, [solve('n', { updatedAt: 80, deletionStamp: 80 })], { mode: 'server', quota: { ...quota, active: { ...quota.active, solves: 0 } } });
    expect(out.rejected).toEqual([]);
    expect(out.activeDelta).toEqual({ solves: 1, sessions: 1, practice: 0 });
  });

  it('um solve recusado pela cota não mexe na sessão dele: a cascata não a devolve', () => {
    const view = viewOf(session('X', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 }), solve('a'), solve('b'));
    const out = applyChanges(view, [solve('n', { sessionId: 'X', updatedAt: 80, deletionStamp: 80 })], { mode: 'server', quota });
    expect(out.rejected).toEqual([{ store: 'solves', id: 'n', reason: QUOTA_REASON }]);
    expect(out.writes).toEqual([]);
    expect(out.derived).toEqual([]);
  });

  it('sessões e tentativas do treino também têm teto; os ajustes não', () => {
    const atLimit = { active: { solves: 0, sessions: 5, practice: 5 }, limits: quota.limits };
    const view = viewOf(session('s1'));
    const out = applyChanges(view, [session('nova'), practice('p1'), seasonPref(season([]), 5), session('s1', { updatedAt: 20 })], { mode: 'server', quota: atLimit });
    expect(out.rejected).toEqual([
      { store: 'sessions', id: 'nova', reason: QUOTA_REASON },
      { store: 'practice', id: 'p1', reason: QUOTA_REASON },
    ]);
    expect(keys(out.writes)).toEqual(['prefs/season', 'sessions/s1']);
    expect(out.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
  });

  it('sem limits, o teto é ACCOUNT_LIMITS', () => {
    const out = applyChanges(viewOf(session('s1')), [solve('n1'), solve('n2')], { mode: 'server', quota: { active: { solves: 99_999, sessions: 1, practice: 0 } } });
    expect(out.rejected).toEqual([{ store: 'solves', id: 'n2', reason: QUOTA_REASON }]);
    expect(keys(out.writes)).toEqual(['solves/n1']);
    expect(out.activeDelta.solves).toBe(1);
  });

  it('sem quota (o aparelho, a restauração), nada é recusado pela cota', () => {
    for (const mode of ['server', 'client'] as const) {
      const out = applyChanges(full(), [solve('novo'), solve('velho', { deletionStamp: 20 }), session('nova'), practice('p1')], { mode });
      expect(out.rejected).toEqual([]);
      expect(keys(out.writes)).toEqual(['practice/p1', 'sessions/nova', 'solves/novo', 'solves/velho']);
      expect(out.activeDelta).toEqual({ solves: 2, sessions: 1, practice: 1 });
    }
  });
});

// A vaga de sessão que um solve pede (revisão da Task 1): um solve que passa a ativo numa sessão que não está ativa (ausente, ou na lixeira
// com uma exclusão anterior à dele, que a cascata devolveria) ocupa a vaga dela; sem vaga, ele também volta com o motivo da cota. Nada
// recusado é gravado, e nenhum solve ativo gravado fica sem a sessão ativa.
describe('a cota: a sessão que um solve pede', () => {
  const sessionsFull = { active: { solves: 0, sessions: 1, practice: 0 }, limits: { solves: 10, sessions: 1, practice: 10 } };
  const cota = (store: string, id: string) => ({ store, id, reason: QUOTA_REASON });

  it('com as sessões cheias, a sessão nova e os solves dela são recusados, nas duas ordens, e nada é gravado', () => {
    const view = viewOf(session('s1'));
    const first = applyChanges(view, [session('N'), solve('n', { sessionId: 'N' })], { mode: 'server', quota: sessionsFull });
    expect(first.rejected).toEqual([cota('sessions', 'N'), cota('solves', 'n')]);
    expect(first.writes).toEqual([]);
    expect(first.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
    const after = applyChanges(view, [solve('n', { sessionId: 'N' }), session('N')], { mode: 'server', quota: sessionsFull });
    expect(after.rejected).toEqual([cota('solves', 'n'), cota('sessions', 'N')]);
    expect(after.writes).toEqual([]);
  });

  it('restaurar uma sessão com o solve dela, com as sessões cheias: os dois são recusados, e rejected bate com writes', () => {
    const view = viewOf(session('s1'), session('X', { deletedAt: 5, deletionStamp: 5 }), solve('a', { sessionId: 'X', deletedAt: 5, deletionStamp: 5 }));
    const back = { updatedAt: 20, deletionStamp: 20 };
    const out = applyChanges(view, [session('X', back), solve('a', { sessionId: 'X', ...back })], { mode: 'server', quota: sessionsFull });
    expect(out.rejected).toEqual([cota('sessions', 'X'), cota('solves', 'a')]);
    expect(out.writes).toEqual([]);
    expect(out.derived).toEqual([]);
    expect(out.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
  });

  it('a sessão que um solve devolve ocupa a última vaga: a sessão nova que vem depois no lote é recusada', () => {
    const view = viewOf(session('X', { deletedAt: 5, deletionStamp: 5 }));
    const quota = { active: { solves: 0, sessions: 0, practice: 0 }, limits: { solves: 10, sessions: 1, practice: 10 } };
    const out = applyChanges(view, [solve('a', { sessionId: 'X', updatedAt: 20, deletionStamp: 20 }), session('N')], { mode: 'server', quota });
    expect(out.rejected).toEqual([cota('sessions', 'N')]);
    expect(keys(out.writes)).toEqual(['sessions/X', 'solves/a']);
    expect(out.activeDelta).toEqual({ solves: 1, sessions: 1, practice: 0 });
  });

  it('a vaga da sessão é pedida uma vez por lote: a restauração dela depois do solve não conta de novo', () => {
    const view = viewOf(session('X', { deletedAt: 5, deletionStamp: 5 }));
    const quota = { active: { solves: 0, sessions: 0, practice: 0 }, limits: { solves: 10, sessions: 1, practice: 10 } };
    const back = { updatedAt: 20, deletionStamp: 20 };
    const out = applyChanges(view, [solve('a', { sessionId: 'X', ...back }), session('X', back), solve('b', { sessionId: 'X', ...back })], { mode: 'server', quota });
    expect(out.rejected).toEqual([]);
    expect(keys(out.writes)).toEqual(['sessions/X', 'solves/a', 'solves/b']);
    expect(out.activeDelta).toEqual({ solves: 2, sessions: 1, practice: 0 });
  });

  it('um solve que a cascata vai apagar (mais velho que a exclusão da sessão) não pede vaga', () => {
    const view = viewOf(session('s1'), session('X', { deletedAt: 50, deletionStamp: 50 }));
    const out = applyChanges(view, [solve('a', { sessionId: 'X', updatedAt: 20, deletionStamp: 20 })], { mode: 'server', quota: sessionsFull });
    expect(out.rejected).toEqual([]);
    expect(out.writes.map((c) => [c.store, c.id, c.deletedAt])).toEqual([['solves', 'a', 50]]);
    expect(out.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
  });

  it('uma sessão apagada no lote não abre vaga antes do fim do lote: a cascata ainda pode devolvê-la', () => {
    // O solve gravado é mais novo que a exclusão que chega: a cascata devolve X, e a sessão nova não pode ter ocupado a vaga dela.
    const view = viewOf(session('X'), solve('a', { sessionId: 'X', updatedAt: 80, deletionStamp: 80 }));
    const out = applyChanges(view, [session('X', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 }), session('N')], { mode: 'server', quota: sessionsFull });
    expect(out.rejected).toEqual([cota('sessions', 'N')]);
    expect(out.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
  });

  it('com as sessões cheias, editar um solve ativo passa; levá-lo para uma sessão que não está ativa pede vaga', () => {
    const view = viewOf(session('s1'), session('X', { deletedAt: 5, deletionStamp: 5 }), solve('a'));
    const note = applyChanges(view, [solve('a', { updatedAt: 20, data: { ...(solve('a').data as object), note: 'editado' } })], { mode: 'server', quota: sessionsFull });
    expect(note.rejected).toEqual([]);
    const moved = applyChanges(view, [solve('a', { sessionId: 'X', updatedAt: 20 })], { mode: 'server', quota: sessionsFull });
    expect(moved.rejected).toEqual([cota('solves', 'a')]);
    expect(moved.writes).toEqual([]);
  });
});

// Uma recusa a mais, do servidor (o teto de bytes da conta, worker/account-store.ts): `admit` vê o que cada mudança deixa gravado e recusa
// com o motivo da cota, do mesmo jeito que a cota.
describe('applyChanges: admit, a recusa a mais do servidor', () => {
  const note = (id: string, text: string, o: Partial<Change> = {}): Change => solve(id, { updatedAt: 20, ...o, data: { ...(solve(id).data as object), note: text } });

  it('false recusa com o motivo da cota e não grava nada; a vaga da cota que ele não usou fica para o próximo', () => {
    const quota = { active: { solves: 1, sessions: 1, practice: 0 }, limits: { solves: 2, sessions: 5, practice: 5 } };
    const out = applyChanges(viewOf(session('s1'), solve('a')), [note('grande', 'x'.repeat(100)), solve('n')], {
      mode: 'server',
      quota,
      admit: (_before, next) => next.id !== 'grande',
    });
    expect(out.rejected).toEqual([{ store: 'solves', id: 'grande', reason: QUOTA_REASON }]);
    expect(keys(out.writes)).toEqual(['solves/n']);
    expect(out.activeDelta).toEqual({ solves: 1, sessions: 0, practice: 0 });
  });

  it('vê o resultado do merge e o que estava antes, a versão do lote se o mesmo registro veio antes; o que a cota recusa nem chega a ele', () => {
    const seen: [string | null, string | null][] = [];
    const text = (c: Change | undefined): string | null => (c ? (c.data as { note: string }).note : null);
    const quota = { active: { solves: 2, sessions: 1, practice: 0 }, limits: { solves: 2, sessions: 5, practice: 5 } };
    const view = viewOf(session('s1'), note('a', 'gravada', { updatedAt: 30 }), solve('b'));
    const batch = [note('a', 'velha'), note('b', 'primeira'), note('b', 'segunda', { updatedAt: 40 }), solve('novo'), compacted(solve('sumido', { deletedAt: 5, deletionStamp: 5 }))];
    const out = applyChanges(view, batch, {
      mode: 'server',
      quota,
      admit: (before, next) => {
        seen.push([text(before), text(next)]);
        return true;
      },
    });
    expect(seen).toEqual([
      ['gravada', 'gravada'], // a velha perde: fica a gravada
      ['', 'primeira'],
      ['primeira', 'segunda'],
    ]);
    expect(out.rejected).toEqual([{ store: 'solves', id: 'novo', reason: QUOTA_REASON }]);
  });

  it('uma sessão recusada não volta pela cascata, e o solve recusado não mexe na sessão dele', () => {
    const view = viewOf(session('X', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 }), solve('a', { sessionId: 'X', deletedAt: 50, deletionStamp: 50 }));
    const back = { updatedAt: 80, deletionStamp: 80 };
    const out = applyChanges(view, [session('X', back), solve('n', { sessionId: 'X', ...back })], { mode: 'server', admit: () => false });
    expect(out.rejected).toEqual([
      { store: 'sessions', id: 'X', reason: QUOTA_REASON },
      { store: 'solves', id: 'n', reason: QUOTA_REASON },
    ]);
    expect(out.writes).toEqual([]);
    expect(out.derived).toEqual([]);
  });
});

// O teto de bytes no limite (revisão da Task 4): o admit recusa só parte do lote. Uma sessão que ele recusa leva junto os solves que pediriam
// a vaga dela; a sessão que um solve do lote já pediu passa (required), mesmo sem caber. Nenhum solve ativo gravado fica sem a sessão.
describe('applyChanges: admit parcial, como o teto de bytes', () => {
  // Um teto como o do servidor: a folga corre pelo lote, e o que cresce além dela volta, a não ser que seja obrigatório.
  const byteCap = (room: number, calls: [string, boolean][] = []) => {
    const size = (c: Change): number => JSON.stringify(c.data).length;
    const sizes = new Map<string, number>();
    let left = room;
    return (before: Change | undefined, next: Change, required: boolean): boolean => {
      calls.push([syncKey(next.store, next.id), required]);
      const key = syncKey(next.store, next.id);
      const growth = size(next) - (sizes.get(key) ?? (before ? size(before) : 0));
      if (!required && growth > 0 && growth > left) return false;
      left -= growth;
      sizes.set(key, size(next));
      return true;
    };
  };
  const quota = { active: { solves: 10, sessions: 1, practice: 0 } };
  const big = (id: string, o: Partial<Change> = {}): Change => session(id, { ...o, data: { name: 'N'.repeat(400), event: '333', order: 0, createdAt: 1 } });
  const cota = (store: string, id: string) => ({ store, id, reason: QUOTA_REASON });

  it('C1: a sessão nova que não cabe e o solve dela voltam juntos, com ou sem a cota; nada fica órfão', () => {
    for (const opts of [{ quota }, {}]) {
      const out = applyChanges(viewOf(session('s1')), [big('X'), solve('n', { sessionId: 'X' })], { mode: 'server', ...opts, admit: byteCap(300) });
      expect(out.rejected).toEqual([cota('sessions', 'X'), cota('solves', 'n')]);
      expect(out.writes).toEqual([]);
      expect(out.activeDelta).toEqual({ solves: 0, sessions: 0, practice: 0 });
    }
  });

  it('C1 ao contrário: o solve que pediu a vaga vem antes, e a sessão dele passa mesmo sem caber', () => {
    const calls: [string, boolean][] = [];
    const out = applyChanges(viewOf(session('s1')), [solve('n', { sessionId: 'X' }), big('X')], { mode: 'server', quota, admit: byteCap(300, calls) });
    expect(out.rejected).toEqual([]);
    expect(keys(out.writes)).toEqual(['sessions/X', 'solves/n']);
    expect(out.activeDelta).toEqual({ solves: 1, sessions: 1, practice: 0 });
    expect(calls).toEqual([['solves/n', false], ['sessions/X', true]]); // o teto vê o que passou, para a conta dele continuar certa
  });

  it('C2: restaurar a sessão que não cabe e o solve dela: os dois voltam, e a cascata não a devolve', () => {
    const view = viewOf(session('s1'), session('X', { updatedAt: 50, deletedAt: 50, deletionStamp: 50 }), solve('a', { sessionId: 'X', deletedAt: 50, deletionStamp: 50 }));
    const back = { updatedAt: 80, deletionStamp: 80 };
    const out = applyChanges(view, [big('X', back), solve('a', { sessionId: 'X', ...back })], { mode: 'server', quota, admit: byteCap(50) });
    expect(out.rejected).toEqual([cota('sessions', 'X'), cota('solves', 'a')]);
    expect(out.writes).toEqual([]);
    expect(out.derived).toEqual([]);
    // Na ordem inversa, o solve pede a vaga primeiro, e a sessão volta com ele.
    const reverse = applyChanges(view, [solve('a', { sessionId: 'X', ...back }), big('X', back)], { mode: 'server', quota, admit: byteCap(50) });
    expect(reverse.rejected).toEqual([]);
    expect(reverse.writes.map((c) => [c.store, c.id, c.deletedAt])).toEqual([['solves', 'a', null], ['sessions', 'X', null]]);
  });
});

// Sorteios com semente (sync-random.ts): uma vista coerente (solve ativo só em sessão ativa) e um lote ao acaso de criar, apagar, restaurar,
// editar e mover, com datas mais novas e mais velhas que as gravadas e tetos pequenos.
describe('a cota: propriedades sobre lotes sorteados', () => {
  const STORES = ['solves', 'sessions', 'practice'] as const;
  const activeIn = (records: Iterable<Change>): ActiveCounts => {
    const n = { solves: 0, sessions: 0, practice: 0 };
    for (const c of records) if (c.store !== 'prefs' && c.deletedAt === null) n[c.store]++;
    return n;
  };

  function draw(rnd: () => number): { view: MapView; batch: Change[] } {
    const int = (n: number): number => Math.floor(rnd() * n);
    const stamp = (): number => 1 + int(100);
    const stored: Change[] = [];
    for (const id of ['S0', 'S1', 'S2', 'S3']) {
      const t = stamp();
      const kind = int(3);
      if (kind === 1) stored.push(session(id, { updatedAt: t, deletionStamp: t }));
      if (kind === 2) stored.push(session(id, { updatedAt: t, deletedAt: t, deletionStamp: t }));
    }
    const sessions = stored.slice();
    const fresh = ['N0', 'N1'].filter(() => rnd() < 0.5);
    const homes = [...sessions.map((c) => c.id), ...fresh];
    for (let i = 0; i < 8; i++) {
      const home = sessions[int(sessions.length + 1)];
      if (!home) continue;
      const t = stamp();
      const alive = home.deletedAt === null && rnd() < 0.7;
      stored.push(solve(`a${i}`, { sessionId: home.id, updatedAt: t, deletionStamp: t, deletedAt: alive ? null : t }));
    }
    const batch: Change[] = [];
    for (let i = 0, n = int(9); i < n && homes.length > 0; i++) {
      const t = stamp();
      const op = int(9);
      const known = stored[int(stored.length)] as Change | undefined;
      if (op === 0) batch.push(solve(`b${i}`, { sessionId: homes[int(homes.length)], updatedAt: t, deletionStamp: t }));
      else if (!known) continue;
      else if (op <= 2) batch.push({ ...known, updatedAt: t, deletedAt: t, deletionStamp: t });
      else if (op <= 4) batch.push({ ...known, updatedAt: t, deletedAt: null, deletionStamp: t });
      else if (op <= 6 && known.store === 'solves') batch.push({ ...known, updatedAt: t, data: { ...(known.data as object), note: `n${t}` } });
      else if (known.store === 'solves') batch.push({ ...known, updatedAt: t, data: { ...(known.data as object), sessionId: homes[int(homes.length)] } });
    }
    for (const id of fresh) {
      const t = stamp();
      batch.splice(int(batch.length + 1), 0, session(id, { updatedAt: t, deletionStamp: t }));
    }
    return { view: viewOf(...stored), batch };
  }

  it('nada recusado é gravado, todo solve ativo tem a sessão ativa, nenhuma store passa do teto e activeDelta bate com a conta', () => {
    const rnd = seeded(20261017);
    const coin = seeded(4); // as decisões do admit, sem mexer no sorteio dos lotes
    let refused = 0;
    let refusedSolves = 0;
    let cascaded = 0;
    let admitRefused = 0;
    let forced = 0;
    for (let round = 0; round < 3000; round++) {
      const { view, batch } = draw(rnd);
      const start = activeIn(view.records.values());
      const limits = { solves: Math.floor(rnd() * 10), sessions: Math.floor(rnd() * 5), practice: 5 };
      const out = applyChanges(view, batch, { mode: 'server', quota: { active: start, limits } });
      const at = `rodada ${round}`;
      cascaded += check(view, batch, start, limits, out, at);
      refused += out.rejected.length;
      refusedSolves += out.rejected.filter((r) => r.store === 'solves').length;

      // Um teto a mais (admit, como o de bytes) que recusa parte do lote ao acaso: as mesmas garantias.
      const withAdmit = applyChanges(view, batch, {
        mode: 'server',
        quota: { active: start, limits },
        admit: (_before, _next, required) => {
          if (required) forced++;
          return coin() < 0.7;
        },
      });
      check(view, batch, start, limits, withAdmit, `${at} (admit)`);
      admitRefused += withAdmit.rejected.length - out.rejected.length;

      // Com folga (os tetos da conta), a cota não muda nada.
      const roomy = applyChanges(view, batch, { mode: 'server', quota: { active: start, limits: ACCOUNT_LIMITS } });
      const free = applyChanges(view, batch, { mode: 'server' });
      expect(roomy.rejected, at).toEqual([]);
      expect(roomy.writes, at).toEqual(free.writes);
      expect(roomy.activeDelta, at).toEqual(free.activeDelta);
    }
    expect(refused).toBeGreaterThan(100); // o sorteio chega na cota
    expect(refusedSolves).toBeGreaterThan(50);
    expect(cascaded).toBeLessThan(refused / 20); // a exceção da cascata é rara
    expect(admitRefused).toBeGreaterThan(500);
    expect(forced).toBeGreaterThan(10); // a sessão que um solve já pediu aparece no sorteio
  });

  // As garantias de um lote juntado com a cota; devolve quantas vezes a exceção da cascata apareceu.
  function check(view: MapView, batch: Change[], start: ActiveCounts, limits: ActiveCounts, out: ReturnType<typeof applyChanges>, at: string): number {
    // O recusado nunca é gravado como chegou. A única escrita dele é a da cascata (derived), e apagada: o lote apaga a sessão gravada de um
    // solve cuja mudança para outra sessão foi recusada, e a cascata apaga a versão gravada, que ainda está nela. A fila de saída manda
    // uma mudança por chave; uma chave que o lote traz duas vezes pode ter uma versão recusada e outra gravada.
    let cascaded = 0;
    const written = new Map(out.writes.map((c) => [syncKey(c.store, c.id), c]));
    const twice = new Set(keys(batch).filter((k, i, all) => all.indexOf(k) !== i));
    for (const r of out.rejected) {
      expect(r.reason, at).toBe(QUOTA_REASON);
      const k = syncKey(r.store, r.id);
      if (twice.has(k) || !written.has(k)) continue;
      expect(out.derived, `${at}: ${k} recusado e gravado fora da cascata`).toContain(k);
      expect(written.get(k)!.deletedAt, `${at}: ${k} recusado e gravado ativo`).not.toBeNull();
      cascaded++;
    }
    const final = new Map(view.records);
    for (const w of out.writes) final.set(syncKey(w.store, w.id), w);
    for (const c of final.values()) {
      if (c.store !== 'solves' || c.deletedAt !== null) continue;
      expect(final.get(syncKey('sessions', sessionOfChange(c)!))?.deletedAt, `${at}: solve ativo ${c.id} sem sessão ativa`).toBeNull();
    }
    const end = activeIn(final.values());
    for (const store of STORES) {
      expect(end[store], `${at}: ${store} passou do teto`).toBeLessThanOrEqual(Math.max(start[store], limits[store]));
      expect(out.activeDelta[store], `${at}: activeDelta de ${store}`).toBe(end[store] - start[store]);
    }
    return cascaded;
  }
});
