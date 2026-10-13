import { openDB } from 'idb';
import { describe, expect, it, vi } from 'vitest';
import { DB_VERSION, openKlickDb } from '../../src/data/db';

let n = 0;
const fresh = (): string => `db-test-${++n}`;

// A primeira migração (DB_VERSION 2) precisa que as abas antigas larguem o banco; sem isso, a aba nova fica presa.
describe('abertura do banco e outras abas', () => {
  it('outra aba pede uma versão nova: esta fecha a conexão na hora e avisa', async () => {
    const name = fresh();
    const blocking = vi.fn();
    const old = await openKlickDb(name, { blocking });
    const next = await openKlickDb(name, {}, DB_VERSION + 1); // não fica presa: a antiga largou
    expect(blocking).toHaveBeenCalledTimes(1);
    expect(() => old.transaction('solves')).toThrow(); // a conexão antiga está fechada
    expect(next.version).toBe(DB_VERSION + 1);
    next.close();
  });

  it('uma aba antiga que não larga o banco: a nova avisa que está esperando e abre quando ela fecha', async () => {
    const name = fresh();
    const stubborn = await openDB(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('solves', { keyPath: 'id' });
      },
    }); // sem blocking: como uma versão velha do app
    const blocked = vi.fn();
    const opening = openKlickDb(name, { blocked }, DB_VERSION + 1);
    await vi.waitFor(() => expect(blocked).toHaveBeenCalled());
    stubborn.close();
    const next = await opening;
    expect(next.version).toBe(DB_VERSION + 1);
    next.close();
  });
});
