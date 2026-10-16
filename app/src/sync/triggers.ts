// Quando sincronizar (spec 6.2): ao abrir, ao voltar a ficar online ou visível, 5 s depois da última gravação, a cada 5 min com o app
// aberto e em "Sincronizar agora". Só na aba que pegou o lock 'klick-sync' (Web Locks); as outras recebem as mudanças pelo canal de sempre
// entre as abas. O motor já espera o timer parar.

export const WRITE_DELAY_MS = 5_000;
export const EVERY_MS = 300_000;
export const LOCK_NAME = 'klick-sync';

// O que os gatilhos (e o motor, nas esperas e novas tentativas) usam do navegador. Os testes passam um falso.
export interface TriggerEnv {
  onOnline(fn: () => void): () => void;
  onVisible(fn: () => void): () => void;
  schedule(fn: () => void, ms: number): () => void;
  every(fn: () => void, ms: number): () => void;
}

export interface Triggers {
  wrote(): void; // uma gravação desta aba ou de outra: o sync sai 5 s depois da última
  stop(): void;
}

export function startTriggers(run: () => void, env: TriggerEnv): Triggers {
  let pending: (() => void) | null = null;
  const stops = [env.onOnline(run), env.onVisible(run), env.every(run, EVERY_MS)];
  run(); // ao abrir
  return {
    wrote() {
      pending?.();
      pending = env.schedule(() => {
        pending = null;
        run();
      }, WRITE_DELAY_MS);
    },
    stop() {
      pending?.();
      pending = null;
      for (const s of stops) s();
    },
  };
}

// O ambiente de verdade: window, document e os timers.
export function browserTriggerEnv(): TriggerEnv {
  return {
    onOnline(fn) {
      addEventListener('online', fn);
      return () => removeEventListener('online', fn);
    },
    onVisible(fn) {
      const handler = (): void => {
        if (document.visibilityState === 'visible') fn();
      };
      document.addEventListener('visibilitychange', handler);
      return () => document.removeEventListener('visibilitychange', handler);
    },
    schedule(fn, ms) {
      const h = setTimeout(fn, ms);
      return () => clearTimeout(h);
    },
    every(fn, ms) {
      const h = setInterval(fn, ms);
      return () => clearInterval(h);
    },
  };
}

// O que a liderança usa da Web Locks API.
export interface LocksLike {
  request(name: string, callback: () => Promise<void>): Promise<unknown>;
}

// Pede o lock e o segura enquanto a aba vive: `onLeader` roda quando esta aba vira a que sincroniza. Sem a API (navegador antigo, testes),
// a aba lidera sozinha. Devolve a função que solta o lock; soltar antes de liderar (a aba fechou ainda na fila) tira a aba da fila.
export function acquireLeadership(locks: LocksLike | null, onLeader: () => void): () => void {
  if (!locks) {
    onLeader();
    return () => undefined;
  }
  let released = false;
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks
    .request(LOCK_NAME, () => {
      if (released) return Promise.resolve();
      onLeader();
      return held;
    })
    .catch(() => undefined);
  return () => {
    released = true;
    release();
  };
}
