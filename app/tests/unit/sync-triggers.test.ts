import { describe, expect, it } from 'vitest';
import { acquireLeadership, EVERY_MS, startTriggers, WRITE_DELAY_MS, type LocksLike, type TriggerEnv } from '../../src/sync/triggers';

// Um ambiente falso: guarda os ouvintes e os timers, e o teste os dispara.
function fakeEnv() {
  const timers: { fn: () => void; ms: number; live: boolean }[] = [];
  let online: (() => void) | null = null;
  let visible: (() => void) | null = null;
  const env: TriggerEnv = {
    onOnline: (fn) => ((online = fn), () => (online = null)),
    onVisible: (fn) => ((visible = fn), () => (visible = null)),
    schedule: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
    every: (fn, ms) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => (t.live = false);
    },
  };
  return { env, timers, fire: { online: () => online?.(), visible: () => visible?.() } };
}

describe('quando sincronizar (spec 6.2)', () => {
  it('ao abrir, ao voltar online, ao ficar visível e a cada 5 min', () => {
    const { env, timers, fire } = fakeEnv();
    let runs = 0;
    startTriggers(() => runs++, env);
    expect(runs).toBe(1);
    fire.online();
    fire.visible();
    expect(runs).toBe(3);
    const every = timers.find((t) => t.ms === EVERY_MS)!;
    every.fn();
    expect(runs).toBe(4);
  });

  it('5 s depois da ÚLTIMA gravação: gravações seguidas adiam a ida', () => {
    const { env, timers } = fakeEnv();
    let runs = 0;
    const triggers = startTriggers(() => runs++, env);
    triggers.wrote();
    triggers.wrote();
    const delays = timers.filter((t) => t.ms === WRITE_DELAY_MS);
    expect(delays.map((t) => t.live)).toEqual([false, true]);
    delays[1].fn();
    expect(runs).toBe(2);
  });

  it('parar desliga tudo', () => {
    const { env, timers, fire } = fakeEnv();
    let runs = 0;
    const triggers = startTriggers(() => runs++, env);
    triggers.wrote();
    triggers.stop();
    fire.online();
    expect(timers.every((t) => !t.live)).toBe(true);
    expect(runs).toBe(1);
  });
});

describe('uma aba só (spec 6.2): o lock klick-sync', () => {
  // Um gerenciador de locks falso, com fila, como o do navegador.
  function fakeLocks(): LocksLike {
    let held: Promise<unknown> = Promise.resolve();
    return {
      request(_name, callback) {
        const turn = held.then(() => callback());
        held = turn.catch(() => undefined);
        return turn;
      },
    };
  }

  it('a primeira aba lidera; a segunda espera e assume quando a primeira solta', async () => {
    const locks = fakeLocks();
    const leaders: string[] = [];
    const releaseA = acquireLeadership(locks, () => leaders.push('A'));
    acquireLeadership(locks, () => leaders.push('B'));
    await Promise.resolve();
    await Promise.resolve();
    expect(leaders).toEqual(['A']);
    releaseA();
    await new Promise((r) => setTimeout(r, 0));
    expect(leaders).toEqual(['A', 'B']);
  });

  it('sem a Web Locks API, a aba lidera sozinha', () => {
    const leaders: string[] = [];
    acquireLeadership(null, () => leaders.push('só'));
    expect(leaders).toEqual(['só']);
  });

  it('a aba que solta o lock antes de liderar não lidera depois', async () => {
    const locks = fakeLocks();
    const leaders: string[] = [];
    const releaseA = acquireLeadership(locks, () => leaders.push('A'));
    const releaseB = acquireLeadership(locks, () => leaders.push('B'));
    await Promise.resolve();
    releaseB(); // a aba B fechou ainda na fila
    releaseA();
    await new Promise((r) => setTimeout(r, 0));
    expect(leaders).toEqual(['A']);
  });
});
