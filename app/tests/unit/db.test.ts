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

describe('versão 2 do banco', () => {
  it('a store do treino tem os índices por caso e por tempo', async () => {
    const db = await openKlickDb(fresh());
    const store = db.transaction('practice').objectStore('practice');
    expect([...store.indexNames].sort()).toEqual(['byAt', 'byCase']);
    expect(store.keyPath).toBe('id');
    db.close();
  });

  it('abrir a versão 1 (como fazem os testes de migração) não cria a store do treino', async () => {
    const db = await openKlickDb(fresh(), {}, 1);
    expect(db.objectStoreNames.contains('practice')).toBe(false);
    expect(db.objectStoreNames.contains('solves')).toBe(true);
    db.close();
  });
});

describe('versão 3 do banco (spec 5.1)', () => {
  it('as stores da conta e da fila de saída, com o índice da fila pela data', async () => {
    const db = await openKlickDb(fresh());
    expect(db.transaction('prefs').objectStore('prefs').keyPath).toBe('key');
    const outbox = db.transaction('outbox').objectStore('outbox');
    expect(outbox.keyPath).toBeNull(); // a chave é `${store}/${id}`, fora do registro
    expect([...outbox.indexNames]).toEqual(['byQueued']);
    db.close();
  });

  it('abrir a versão 2 (como fazem os testes de migração) não cria as stores da 3', async () => {
    const db = await openKlickDb(fresh(), {}, 2);
    expect(db.objectStoreNames.contains('prefs')).toBe(false);
    expect(db.objectStoreNames.contains('outbox')).toBe(false);
    expect(db.objectStoreNames.contains('practice')).toBe(true);
    db.close();
  });
});

describe('o aviso de atualização dos dados (upgrading)', () => {
  it('sai só numa atualização de verdade, de um banco da versão 1 ou 2; não numa instalação nova nem numa abertura normal', async () => {
    const fromV1 = fresh();
    (await openKlickDb(fromV1, {}, 1)).close();
    const fromV2 = fresh();
    (await openKlickDb(fromV2, {}, 2)).close();
    for (const name of [fromV1, fromV2]) {
      const upgrading = vi.fn();
      (await openKlickDb(name, { upgrading })).close();
      expect(upgrading).toHaveBeenCalledTimes(1);
      const again = vi.fn();
      (await openKlickDb(name, { upgrading: again })).close(); // já na versão atual: abertura normal
      expect(again).not.toHaveBeenCalled();
    }
    const installed = vi.fn();
    (await openKlickDb(fresh(), { upgrading: installed })).close(); // banco novo
    expect(installed).not.toHaveBeenCalled();
  });
});
