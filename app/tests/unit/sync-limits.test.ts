import { describe, expect, it } from 'vitest';
import { ACCOUNT_LIMITS, isCounted, QUOTA_REASON, zeroCounts } from '../../src/core/sync/limits';
import { SYNC_PROTOCOL, SYNC_STORES } from '../../src/core/sync/types';

describe('a cota por conta e o protocolo (endurecimento 4.1)', () => {
  it('os limites por conta: 100 mil solves, dez mil sessões, 100 mil tentativas do treino', () => {
    expect(ACCOUNT_LIMITS).toEqual({ solves: 100_000, sessions: 10_000, practice: 100_000 });
    expect(Object.isFrozen(ACCOUNT_LIMITS)).toBe(true);
    expect(QUOTA_REASON).toBe('cota');
    expect(SYNC_PROTOCOL).toBe(2);
    expect(isCounted('prefs')).toBe(false);
  });

  it('contam solves, sessões e tentativas do treino; os ajustes não têm teto', () => {
    expect(SYNC_STORES.filter(isCounted)).toEqual(['solves', 'sessions', 'practice']);
    expect(Object.keys(ACCOUNT_LIMITS).sort()).toEqual(SYNC_STORES.filter(isCounted).sort());
  });

  it('zeroCounts dá um contador novo a cada chamada', () => {
    const first = zeroCounts();
    first.solves = 7;
    expect(zeroCounts()).toEqual({ solves: 0, sessions: 0, practice: 0 });
  });
});
