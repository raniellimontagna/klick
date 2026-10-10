// Tela acesa (Screen Wake Lock). A tela do Timer pede o bloqueio enquanto a aba estiver visível e solta ao sair; quem chama
// decide quando (want). Sem suporte ou com recusa, nada quebra: a tela só não fica acesa.

export interface WakeSentinel {
  release(): Promise<void>;
  addEventListener?(type: string, listener: () => void): void;
}

export interface WakeNav {
  wakeLock?: { request(type: 'screen'): Promise<WakeSentinel> };
}

export interface WakeLock {
  want(on: boolean): Promise<void>;
  held(): boolean;
}

const ambientNav = (): WakeNav => (typeof navigator === 'undefined' ? {} : (navigator as WakeNav));

export function createWakeLock(nav: WakeNav = ambientNav()): WakeLock {
  let sentinel: WakeSentinel | null = null;
  let wanted = false;
  let pending: Promise<void> | null = null;

  const drop = async (s: WakeSentinel) => {
    try {
      await s.release();
    } catch {
      /* já foi solto pelo sistema */
    }
  };

  async function acquire(): Promise<void> {
    if (!nav.wakeLock) return;
    try {
      const s = await nav.wakeLock.request('screen');
      if (!wanted) {
        // pediram para soltar enquanto o pedido estava em voo
        await drop(s);
        return;
      }
      sentinel = s;
      // O sistema também solta (troca de aba, economia de energia): o held volta a falso e quem chama pede de novo.
      s.addEventListener?.('release', () => {
        if (sentinel === s) sentinel = null;
      });
    } catch {
      /* sem permissão ou sem suporte: segue sem tela acesa */
    }
  }

  return {
    async want(on) {
      wanted = on;
      if (!on) {
        const s = sentinel;
        sentinel = null;
        if (s) await drop(s);
        return;
      }
      if (sentinel) return;
      if (!pending) pending = acquire().finally(() => { pending = null; });
      return pending;
    },
    held: () => sentinel !== null,
  };
}
