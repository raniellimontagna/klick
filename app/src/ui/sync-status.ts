// A situação do sync em palavras e no ícone (spec 9.1 e 9.3): Ajustes, o diálogo de entrar e o indicador da barra de cima leem daqui.
import { T } from '../strings';
import type { SyncStatus } from '../sync/engine';

export type SyncIcon = 'synced' | 'syncing' | 'waiting' | 'error';

export function syncIcon(s: SyncStatus): SyncIcon {
  if (s.phase === 'syncing') return 'syncing';
  if (s.phase === 'offline') return 'waiting';
  if (s.phase === 'error') return 'error';
  return 'synced';
}

// O total da fila só é "o total" na fase de enviar: o primeiro login baixa a conta inteira antes de subir a fila (spec 6.5), e nessa fase o total já veio mas nada subiu. Enviando = total conhecido e (algo subiu, ou nada chegou).
export function isSending(p: NonNullable<SyncStatus['progress']>): boolean {
  return p.total > 0 && (p.sent > 0 || p.received === 0);
}

export function syncLine(s: SyncStatus, now: number): string {
  switch (s.phase) {
    case 'syncing': {
      // Enquanto nada subiu e algo chegou, o que conta é o que chega.
      const p = s.progress;
      if (p && isSending(p)) return T.conta.sending(Math.min(p.sent, p.total), p.total);
      if (p && p.received > 0) return T.conta.receiving(p.received);
      return T.conta.syncing;
    }
    case 'offline':
      return T.conta.waiting(s.pending);
    case 'error':
      return s.error === 'auth' ? T.conta.expired : s.error === 'update' ? T.conta.update : T.conta.failed;
    default:
      return T.conta.synced(s.lastSyncAt === null ? null : T.conta.ago(Math.max(0, now - s.lastSyncAt)));
  }
}
