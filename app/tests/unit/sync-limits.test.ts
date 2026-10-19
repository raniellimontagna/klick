import { describe, expect, it } from 'vitest';
import { applyChanges } from '../../src/core/sync/apply';
import { ACCOUNT_LIMITS, isCounted, QUOTA_REASON, TOMBSTONE_KEEP_MS, zeroCounts } from '../../src/core/sync/limits';
import { COPIES_PAUSED, isCopiesPaused, SYNC_BATCH, SYNC_PROTOCOL, SYNC_STORES, syncKey, type Change } from '../../src/core/sync/types';
import { TRASH_MS } from '../../src/data/safety';
import { MapView } from './sync-fakes';

describe('a cota por conta e o protocolo (endurecimento 4.1)', () => {
  it('os limites por conta: 100 mil solves, dez mil sessões, 100 mil tentativas do treino, dez mil desafios', () => {
    expect(ACCOUNT_LIMITS).toEqual({ solves: 100_000, sessions: 10_000, practice: 100_000, duels: 10_000 });
    expect(Object.isFrozen(ACCOUNT_LIMITS)).toBe(true);
    expect(QUOTA_REASON).toBe('cota');
    expect(SYNC_PROTOCOL).toBe(3);
    expect(isCounted('prefs')).toBe(false);
  });

  it('contam solves, sessões, tentativas do treino e desafios; os ajustes não têm teto', () => {
    expect(SYNC_STORES.filter(isCounted)).toEqual(['solves', 'sessions', 'practice', 'duels']);
    expect(Object.keys(ACCOUNT_LIMITS).sort()).toEqual(SYNC_STORES.filter(isCounted).sort());
  });

  it('a marca compactada: o servidor guarda o conteúdo de um solve apagado por 30 dias, o mesmo prazo da lixeira do aparelho', () => {
    expect(TOMBSTONE_KEEP_MS).toBe(30 * 86_400_000);
    expect(TOMBSTONE_KEEP_MS).toBe(TRASH_MS);
  });

  // Task 12: o servidor lê no máximo 250 mudanças por pedido (MAX_WRITES_PER_REQUEST, worker/limits.ts); o app manda o mesmo, e não 500
  // para ter metade adiada.
  it('o lote do app: 250 mudanças por pedido', () => {
    expect(SYNC_BATCH).toBe(250);
  });

  it('as cópias pausadas: o espaço, as operações do mês e o tamanho da conta', () => {
    expect(COPIES_PAUSED).toEqual(['space', 'ops', 'size']);
    expect(Object.isFrozen(COPIES_PAUSED)).toBe(true);
    expect(['space', 'ops', 'size', 'cheio', '', null, undefined, 1].map(isCopiesPaused)).toEqual([true, true, true, false, false, false, false, false]);
  });

  it('zeroCounts dá um contador novo a cada chamada', () => {
    const first = zeroCounts();
    first.solves = 7;
    expect(zeroCounts()).toEqual({ solves: 0, sessions: 0, practice: 0, duels: 0 });
  });

  // Os desafios (spec do desafio, seção 7): folgado para uso real (um desafio por dia leva uns 27 anos até o teto) e apertado para lixo, com a
  // cota de sempre: o novo além do teto volta com o motivo da cota; editar e apagar passam.
  it('ACCOUNT_LIMITS.duels é 10 mil e conta na cota', () => {
    expect(ACCOUNT_LIMITS.duels).toBe(10_000);
    expect(isCounted('duels')).toBe(true);
    expect(SYNC_STORES).toContain('duels');
    const duel = (linkId: string, o: Partial<Change> = {}): Change => ({
      store: 'duels',
      id: `${linkId}-a`,
      data: {
        linkId, side: 'a', event: '333', scrambles: Array.from({ length: 7 }, () => 'R U'), mine: [], theirs: null, myName: '', theirName: '',
        status: 'playing', createdAt: 1,
      },
      updatedAt: 10, deletedAt: null, deletionStamp: 10, ...o,
    });
    const old = duel('abcdefgh00000001');
    const view = new MapView(new Map([[syncKey(old.store, old.id), old]]));
    const quota = { active: { ...zeroCounts(), duels: ACCOUNT_LIMITS.duels } };
    const full = applyChanges(view, [duel('abcdefgh00000002'), duel('abcdefgh00000001', { updatedAt: 20, data: { ...(old.data as object), status: 'waiting' } })], { mode: 'server', quota });
    expect(full.rejected).toEqual([{ store: 'duels', id: 'abcdefgh00000002-a', reason: QUOTA_REASON }]);
    expect(full.writes.map((c) => c.id)).toEqual(['abcdefgh00000001-a']);
    const freed = applyChanges(view, [duel('abcdefgh00000001', { updatedAt: 20, deletedAt: 20, deletionStamp: 20 }), duel('abcdefgh00000002')], { mode: 'server', quota });
    expect(freed.rejected).toEqual([]);
    expect(freed.activeDelta).toEqual({ ...zeroCounts(), duels: 0 });
  });
});
