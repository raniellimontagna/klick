import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CubingModule } from '../../src/scramble/cubing-loader';

// Cada teste carrega o módulo do zero: o cache e o contador de tentativas não passam de um teste para o outro.
async function carregarModulo() {
  vi.resetModules();
  return import('../../src/scramble/cubing-loader');
}

// Módulo falso do cubing.js. O twisty, o animador e os puzzles não são usados aqui, então basta um construtor qualquer.
function falso(sorteio: (evento: string) => Promise<{ toString(): string }> = async () => ({ toString: () => "R U R' U'" })): CubingModule {
  return { TwistyPlayer: HTMLElement, ExperimentalSVGAnimator: HTMLElement, puzzles: {}, randomScrambleForEvent: sorteio } as unknown as CubingModule;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('carregador do cubing.js', () => {
  it('falha de carga não fica presa no cache: a chamada seguinte tenta de novo com outra URL', async () => {
    const { loadCubing } = await carregarModulo();
    const modulo = falso();
    const urls: string[] = [];
    const importador = async (url: string) => {
      urls.push(url);
      if (urls.length === 1) throw new Error('rede');
      return modulo;
    };
    await expect(loadCubing(importador)).rejects.toThrow('rede');
    await expect(loadCubing(importador)).resolves.toBe(modulo);
    expect(urls).toHaveLength(2);
    expect(urls[1]).toContain('?r=1');
    expect(urls[1]).not.toBe(urls[0]);
  });

  it('depois de um carregamento bem-sucedido, as chamadas seguintes não importam de novo', async () => {
    const { loadCubing } = await carregarModulo();
    const modulo = falso();
    let importacoes = 0;
    const importador = async () => {
      importacoes += 1;
      return modulo;
    };
    await loadCubing(importador);
    await loadCubing(importador);
    await loadCubing(importador);
    expect(importacoes).toBe(1);
  });

  it('uma geração que não termina rejeita com timeout no prazo; sem prazo explícito, o padrão é 20 s', async () => {
    const { generateScramble } = await carregarModulo();
    vi.useFakeTimers();
    const travado = falso(() => new Promise<never>(() => {}));
    const pendente = Symbol('pendente');
    const aindaPendente = (p: Promise<unknown>) => Promise.race([p, Promise.resolve(pendente)]);
    const desfecho = (p: Promise<string>) => p.then(() => 'resolveu', (erro: Error) => erro.message);

    const comPrazo = desfecho(generateScramble('minx', { load: async () => travado, timeoutMs: 5000 }));
    await vi.advanceTimersByTimeAsync(4999);
    expect(await aindaPendente(comPrazo)).toBe(pendente);
    await vi.advanceTimersByTimeAsync(1);
    expect(await comPrazo).toBe('timeout');

    const padrao = desfecho(generateScramble('minx', { load: async () => travado }));
    await vi.advanceTimersByTimeAsync(19_999);
    expect(await aindaPendente(padrao)).toBe(pendente);
    await vi.advanceTimersByTimeAsync(1);
    expect(await padrao).toBe('timeout');
  });

  it('gera o embaralhamento do evento e devolve o texto', async () => {
    const { generateScramble } = await carregarModulo();
    const pedidos: string[] = [];
    const sorteio = async (evento: string) => {
      pedidos.push(evento);
      return { toString: () => "R U R' U'" };
    };
    await expect(generateScramble('minx', { load: async () => falso(sorteio) })).resolves.toBe("R U R' U'");
    expect(pedidos).toEqual(['minx']);
  });
});
