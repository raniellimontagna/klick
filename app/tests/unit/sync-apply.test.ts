import { describe, expect, it } from 'vitest';
import { defaultSeason } from '../../src/core/season';
import { applyChanges, sameChange } from '../../src/core/sync/apply';
import { sessionOfChange } from '../../src/core/sync/records';
import { syncKey, type Change } from '../../src/core/sync/types';
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
