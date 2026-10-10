// Fila de embaralhamentos, uma por evento. É código do núcleo: não importa Svelte nem toca em document.
import type { EventId } from '../core/types';

export interface ScrambleQueue {
  next(event: EventId): Promise<string>;  // devolve o próximo pronto (ou espera gerar) e repõe a fila
  prefetch(event: EventId): void;         // enche a fila sem consumir
  ready(event: EventId): number;          // quantos prontos
  idle(): Promise<void>;                  // aguarda as gerações em andamento (para testes)
}

interface Waiter {
  resolve: (scramble: string) => void;
  reject: (error: unknown) => void;
}

interface EventQueue {
  ready: string[];
  inflight: number;
  waiters: Waiter[];
}

export function createScrambleQueue(o: { generate: (event: EventId) => Promise<string>; size?: number }): ScrambleQueue {
  const size = o.size ?? 2;
  const porEvento = new Map<EventId, EventQueue>();
  const emAndamento = new Set<Promise<void>>();

  function filaDe(event: EventId): EventQueue {
    let fila = porEvento.get(event);
    if (!fila) {
      fila = { ready: [], inflight: 0, waiters: [] };
      porEvento.set(event, fila);
    }
    return fila;
  }

  // Gera enquanto prontos mais em andamento ficarem abaixo de size mais quem espera.
  function refill(event: EventId): void {
    const fila = filaDe(event);
    while (fila.ready.length + fila.inflight < size + fila.waiters.length) {
      fila.inflight++;
      // O new Promise transforma um throw síncrono do gerador em rejeição, e a contagem de inflight continua certa.
      const tarefa: Promise<void> = new Promise<string>((resolve) => resolve(o.generate(event)))
        .then(
          (scramble) => {
            const quemEspera = fila.waiters.shift();
            if (quemEspera) quemEspera.resolve(scramble);
            else fila.ready.push(scramble);
            fila.inflight--;
            refill(event);
          },
          (error: unknown) => {
            // Sem nova tentativa automática: a próxima chamada a next ou prefetch tenta de novo.
            fila.inflight--;
            fila.waiters.shift()?.reject(error);
          },
        )
        .finally(() => {
          emAndamento.delete(tarefa);
        });
      emAndamento.add(tarefa);
    }
  }

  return {
    next(event) {
      const fila = filaDe(event);
      const pronto = fila.ready.shift();
      if (pronto !== undefined) {
        refill(event);
        return Promise.resolve(pronto);
      }
      return new Promise<string>((resolve, reject) => {
        fila.waiters.push({ resolve, reject });
        refill(event);
      });
    },
    prefetch(event) {
      refill(event);
    },
    ready(event) {
      return porEvento.get(event)?.ready.length ?? 0;
    },
    async idle() {
      // Repete enquanto houver gerações: um sucesso pode disparar outras para repor a fila.
      while (emAndamento.size > 0) await Promise.allSettled([...emAndamento]);
    },
  };
}
