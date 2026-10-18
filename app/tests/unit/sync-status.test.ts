import { describe, expect, it } from 'vitest';
import { idleStatus, type SyncStatus } from '../../src/sync/engine';
import { syncIcon, syncLine } from '../../src/ui/sync-status';

const NOW = 1_791_500_000_000;
const MIN = 60_000;
const at = (patch: Partial<SyncStatus>): SyncStatus => ({ ...idleStatus(), phase: 'idle', ...patch });

describe('a situação do sync em palavras (spec 9.1)', () => {
  it('sincronizado: há quanto tempo, ou só "Sincronizado" antes do primeiro', () => {
    expect(syncLine(at({ lastSyncAt: NOW - 20_000 }), NOW)).toBe('Sincronizado agora');
    expect(syncLine(at({ lastSyncAt: NOW - 2 * MIN - 5_000 }), NOW)).toBe('Sincronizado há 2 min');
    expect(syncLine(at({ lastSyncAt: NOW - 3 * 60 * MIN }), NOW)).toBe('Sincronizado há 3 h');
    expect(syncLine(at({ lastSyncAt: NOW - 24 * 60 * MIN }), NOW)).toBe('Sincronizado há 1 dia');
    expect(syncLine(at({ lastSyncAt: NOW - 5 * 24 * 60 * MIN }), NOW)).toBe('Sincronizado há 5 dias');
    expect(syncLine(at({ lastSyncAt: NOW + 5_000 }), NOW)).toBe('Sincronizado agora'); // o relógio de outro aparelho à frente
    expect(syncLine(at({ lastSyncAt: null }), NOW)).toBe('Sincronizado');
  });

  it('sem rede: quantas mudanças esperam', () => {
    expect(syncLine(at({ phase: 'offline', pending: 4 }), NOW)).toBe('4 mudanças esperando rede');
    expect(syncLine(at({ phase: 'offline', pending: 1 }), NOW)).toBe('1 mudança esperando rede');
    expect(syncLine(at({ phase: 'offline', pending: 0 }), NOW)).toBe('Esperando rede');
  });

  it('durante a rodada: o que sobe, o que chega ou só "Sincronizando…"', () => {
    expect(syncLine(at({ phase: 'syncing', progress: { sent: 500, total: 1200, received: 0 } }), NOW)).toBe('Enviando 500 de 1.200…');
    expect(syncLine(at({ phase: 'syncing', progress: { sent: 1300, total: 1200, received: 0 } }), NOW)).toBe('Enviando 1.200 de 1.200…');
    expect(syncLine(at({ phase: 'syncing', progress: { sent: 0, total: 0, received: 3000 } }), NOW)).toBe('Recebendo da conta: 3.000…');
    // O primeiro login baixa a conta inteira antes de subir a fila (spec 6.5): enquanto nada subiu, o que chega é o que conta.
    expect(syncLine(at({ phase: 'syncing', progress: { sent: 0, total: 1200, received: 3000 } }), NOW)).toBe('Recebendo da conta: 3.000…');
    expect(syncLine(at({ phase: 'syncing', progress: { sent: 0, total: 1200, received: 0 } }), NOW)).toBe('Enviando 0 de 1.200…');
    expect(syncLine(at({ phase: 'syncing', progress: null }), NOW)).toBe('Sincronizando…');
  });

  // Endurecimento 4.1 e decisão 6: o aviso da última rodada troca o "Sincronizado…" só na fase idle.
  it('idle com a cota cheia diz o limite; com o orçamento, que o resto sobe amanhã', () => {
    expect(syncLine(at({ lastSyncAt: NOW - 20_000, notice: 'quota' }), NOW)).toBe(
      'A conta chegou ao limite do plano gratuito. Os novos ficam só neste aparelho.',
    );
    expect(syncLine(at({ lastSyncAt: NOW - 20_000, notice: 'budget' }), NOW)).toBe('Muita coisa para subir hoje: o resto sobe amanhã.');
    // O orçamento de leituras do dia da conta (revisão final, I2 c): nem receber nem subir andam até amanhã.
    expect(syncLine(at({ lastSyncAt: NOW - 20_000, notice: 'reads' }), NOW)).toBe('Muita coisa para sincronizar hoje: o resto fica para amanhã.');
    expect(syncLine(at({ lastSyncAt: NOW - 20_000, notice: null }), NOW)).toBe('Sincronizado agora');
    // Fora da fase idle, o aviso não troca nada: a rodada, a falta de rede e o erro falam por si.
    expect(syncLine(at({ phase: 'offline', pending: 2, notice: 'budget' }), NOW)).toBe('2 mudanças esperando rede');
    expect(syncLine(at({ phase: 'syncing', progress: null, notice: 'quota' }), NOW)).toBe('Sincronizando…');
    expect(syncLine(at({ phase: 'error', error: 'server', notice: 'quota' }), NOW)).toBe('O sync parou. Tentando de novo.');
  });

  it('os erros: a sessão expirou, o app velho e o servidor', () => {
    expect(syncLine(at({ phase: 'error', error: 'auth' }), NOW)).toBe('Sua sessão expirou. Entre de novo para sincronizar.');
    expect(syncLine(at({ phase: 'error', error: 'update' }), NOW)).toBe('Atualize o Klick para sincronizar.');
    expect(syncLine(at({ phase: 'error', error: 'server' }), NOW)).toBe('O sync parou. Tentando de novo.');
  });

  it('o ícone', () => {
    expect(syncIcon(at({}))).toBe('synced');
    expect(syncIcon(at({ phase: 'off' }))).toBe('synced');
    expect(syncIcon(at({ phase: 'syncing' }))).toBe('syncing');
    expect(syncIcon(at({ phase: 'offline' }))).toBe('waiting');
    expect(syncIcon(at({ phase: 'error', error: 'server' }))).toBe('error');
  });
});
