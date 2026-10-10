import { describe, expect, it } from 'vitest';
import { createWakeLock } from '../../src/ui/wakelock';

describe('tela acesa', () => {
  it('pede e solta o wake lock', async () => {
    let released = 0;
    const nav = { wakeLock: { request: async () => ({ release: async () => { released++; } }) } };
    const w = createWakeLock(nav);
    await w.want(true);
    expect(w.held()).toBe(true);
    await w.want(false);
    expect(w.held()).toBe(false);
    expect(released).toBe(1);
  });
  it('sem suporte ou com recusa, segue sem erro', async () => {
    await expect(createWakeLock({}).want(true)).resolves.toBeUndefined();
    const refuse = { wakeLock: { request: async () => { throw new Error('NotAllowed'); } } };
    const w = createWakeLock(refuse);
    await w.want(true);
    expect(w.held()).toBe(false);
  });
});
