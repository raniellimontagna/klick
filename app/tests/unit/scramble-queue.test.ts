import { describe, expect, it } from 'vitest';
import { createScrambleQueue } from '../../src/scramble/queue';
import type { EventId } from '../../src/core/types';

function gen() {
  const calls: EventId[] = [];
  const counters: Record<string, number> = {};
  return {
    calls,
    generate: async (ev: EventId) => {
      calls.push(ev);
      counters[ev] = (counters[ev] ?? 0) + 1;
      return `${ev}-${counters[ev]}`;
    },
  };
}

describe('fila de embaralhamentos', () => {
  it('entrega em ordem e mantém 2 prontos por evento', async () => {
    const g = gen();
    const q = createScrambleQueue({ generate: g.generate, size: 2 });
    expect(await q.next('333')).toBe('333-1');
    await q.idle();
    expect(q.ready('333')).toBe(2);
    expect(await q.next('333')).toBe('333-2');
    expect(await q.next('333')).toBe('333-3');
  });

  it('eventos não se misturam', async () => {
    const g = gen();
    const q = createScrambleQueue({ generate: g.generate });
    const a = await q.next('333');
    const b = await q.next('sq1');
    expect([a, b]).toEqual(['333-1', 'sq1-1']);
    await q.idle();
    expect(q.ready('333')).toBe(2);
    expect(q.ready('sq1')).toBe(2);
  });

  it('prefetch prepara sem consumir', async () => {
    const g = gen();
    const q = createScrambleQueue({ generate: g.generate });
    q.prefetch('444');
    await q.idle();
    expect(q.ready('444')).toBe(2);
    expect(await q.next('444')).toBe('444-1');
  });

  it('se o gerador falha, next rejeita e a próxima chamada tenta de novo', async () => {
    let fail = true;
    const q = createScrambleQueue({
      generate: async (ev) => {
        if (fail) throw new Error('worker');
        return `${ev}-ok`;
      },
      size: 1,
    });
    await expect(q.next('333')).rejects.toThrow('worker');
    await q.idle();
    fail = false;
    expect(await q.next('333')).toBe('333-ok');
  });

  it('next concorrentes de eventos diferentes nunca recebem o embaralhamento do outro', async () => {
    let n = 0;
    const q = createScrambleQueue({
      generate: async (ev: EventId) => {
        n += 1;
        const id = n;
        // o sq1 demora mais, então as respostas chegam fora da ordem dos pedidos
        await new Promise((r) => setTimeout(r, ev === 'sq1' ? 4 : 1));
        return `${ev}-${id}`;
      },
    });
    const pedidos: EventId[] = ['333', 'sq1', '333', 'sq1', '333', 'sq1'];
    const entregues = await Promise.all(pedidos.map((ev) => q.next(ev)));
    expect(entregues.map((s) => s.slice(0, s.lastIndexOf('-')))).toEqual(pedidos);
    expect(new Set(entregues).size).toBe(pedidos.length);
  });
});
