import { describe, expect, it } from 'vitest';
import { createWakeLock } from '../../src/ui/wakelock';

// Casos extras da tela acesa: pedido em voo, soltar antes do pedido terminar, e a liberação feita pelo sistema.
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('tela acesa, casos extras', () => {
  it('pedidos repetidos enquanto o primeiro está em voo não viram vários locks', async () => {
    let requests = 0;
    const d = deferred<{ release(): Promise<void> }>();
    const nav = { wakeLock: { request: () => { requests++; return d.promise; } } };
    const w = createWakeLock(nav);
    const first = w.want(true);
    const second = w.want(true);
    d.resolve({ release: async () => {} });
    await Promise.all([first, second]);
    expect(requests).toBe(1);
    expect(w.held()).toBe(true);
  });

  it('soltar enquanto o pedido está em voo: o lock que chegar depois é solto logo', async () => {
    let released = 0;
    const d = deferred<{ release(): Promise<void> }>();
    const nav = { wakeLock: { request: () => d.promise } };
    const w = createWakeLock(nav);
    const pending = w.want(true);
    const off = w.want(false);
    d.resolve({ release: async () => { released++; } });
    await Promise.all([pending, off]);
    expect(w.held()).toBe(false);
    expect(released).toBe(1);
  });

  it('o sistema soltar o lock (troca de aba) tira o held, e um novo want(true) pede de novo', async () => {
    let requests = 0;
    let fireRelease: () => void = () => {};
    const nav = {
      wakeLock: {
        request: async () => {
          requests++;
          return {
            release: async () => {},
            addEventListener: (_t: string, f: () => void) => {
              fireRelease = f;
            },
          };
        },
      },
    };
    const w = createWakeLock(nav);
    await w.want(true);
    expect(w.held()).toBe(true);
    fireRelease();
    expect(w.held()).toBe(false);
    await w.want(true);
    expect(requests).toBe(2);
    expect(w.held()).toBe(true);
  });

  it('falha ao soltar não quebra e deixa de estar segurando', async () => {
    const nav = { wakeLock: { request: async () => ({ release: async () => { throw new Error('gone'); } }) } };
    const w = createWakeLock(nav);
    await w.want(true);
    await expect(w.want(false)).resolves.toBeUndefined();
    expect(w.held()).toBe(false);
  });

  it('sem nenhum navigator passado, usa o do ambiente e segue sem erro', async () => {
    const w = createWakeLock();
    await expect(w.want(true)).resolves.toBeUndefined();
    expect(typeof w.held()).toBe('boolean');
  });
});
