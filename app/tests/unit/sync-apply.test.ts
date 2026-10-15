import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { applyChanges, sameChange, type RecordView } from '../../src/core/sync/apply';
import { sessionOfChange } from '../../src/core/sync/records';
import { syncKey, type Change, type SyncStore } from '../../src/core/sync/types';
import type { SeasonProgress, SeasonRecord } from '../../src/core/types';
import { MapView } from './sync-fakes';

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
