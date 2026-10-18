import { render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { idleStatus } from '../../src/sync/engine';
import LiveCube from '../../src/ui/LiveCube.svelte';
import { filledPieces, firstSyncCube, motionReduced } from '../../src/ui/live-cube';

describe('filledPieces: quantas das 9 peças ficam verdes', () => {
  it('0 a 9, sem passar dos limites e sem total, nada', () => {
    expect(filledPieces(0, 100)).toBe(0);
    expect(filledPieces(50, 100)).toBe(4);
    expect(filledPieces(100, 100)).toBe(9);
    expect(filledPieces(150, 100)).toBe(9);
    expect(filledPieces(5, 0)).toBe(0);
  });
});

describe('firstSyncCube: o estado do cubo no passo do primeiro sync', () => {
  it('pronto vira resolvido, com as 9 peças', () => {
    expect(firstSyncCube('done', idleStatus())).toEqual({ state: 'solved', filled: 9 });
  });

  it('cancelado, sem rede e erro viram erro', () => {
    expect(firstSyncCube('cancelled', idleStatus())).toEqual({ state: 'error', filled: 0 });
    expect(firstSyncCube('started', { ...idleStatus(), phase: 'offline' })).toEqual({ state: 'error', filled: 0 });
    expect(firstSyncCube('started', { ...idleStatus(), phase: 'error', error: 'server' })).toEqual({ state: 'error', filled: 0 });
  });

  it('com o total conhecido, enche; sem total, gira', () => {
    expect(firstSyncCube('started', { ...idleStatus(), phase: 'syncing', progress: { sent: 3, total: 9, received: 0 } })).toEqual({ state: 'fill', filled: 3 });
    expect(firstSyncCube('started', { ...idleStatus(), phase: 'syncing', progress: { sent: 0, total: 0, received: 40 } })).toEqual({ state: 'turn', filled: 0 });
    expect(firstSyncCube(null, idleStatus())).toEqual({ state: 'turn', filled: 0 });
  });

  // Revisão final (resíduo, Minor 2): o orçamento de leituras do dia parou o primeiro sync até amanhã; girar sugeriria que ele anda.
  it('parado pelo orçamento de leituras do dia (idle com o aviso reads), fica parado', () => {
    expect(firstSyncCube('started', { ...idleStatus(), phase: 'idle', notice: 'reads' })).toEqual({ state: 'idle', filled: 0 });
  });

  it('baixando a conta (o total da fila já veio, nada subiu ainda), gira em vez de ficar parado', () => {
    expect(firstSyncCube('started', { ...idleStatus(), phase: 'syncing', progress: { sent: 0, total: 5, received: 120 } })).toEqual({ state: 'turn', filled: 0 });
  });
});

describe('motionReduced', () => {
  afterEach(() => {
    delete document.documentElement.dataset.reducedMotion;
  });

  it('lê o atributo do ajuste', () => {
    expect(motionReduced()).toBe(false);
    document.documentElement.dataset.reducedMotion = 'true';
    expect(motionReduced()).toBe(true);
  });
});

describe('LiveCube', () => {
  it('enchendo: 9 peças, as primeiras 4 acesas, decorativo, o centro marcado', () => {
    const { container } = render(LiveCube, { state: 'fill', filled: 4 });
    const root = container.querySelector('.live-cube');
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.getAttribute('data-cube')).toBe('fill');
    expect(root?.getAttribute('data-size')).toBe('lg');
    const pieces = container.querySelectorAll('[data-piece]');
    expect(pieces).toHaveLength(9);
    expect(container.querySelectorAll('[data-on="true"]')).toHaveLength(4);
    expect([...pieces].map((p) => p.hasAttribute('data-on'))).toEqual([true, true, true, true, false, false, false, false, false]);
    expect([...pieces].map((p) => p.hasAttribute('data-center'))).toEqual([false, false, false, false, true, false, false, false, false]);
  });

  it('parado: nenhuma peça acesa, e o tamanho pequeno vai no atributo', () => {
    const { container } = render(LiveCube, { state: 'idle', size: 'sm' });
    expect(container.querySelectorAll('[data-on]')).toHaveLength(0);
    expect(container.querySelector('.live-cube')?.getAttribute('data-size')).toBe('sm');
  });

  it('fora do estado enchendo, filled não acende nada', () => {
    const { container } = render(LiveCube, { state: 'turn', filled: 5 });
    expect(container.querySelectorAll('[data-on]')).toHaveLength(0);
  });
});
