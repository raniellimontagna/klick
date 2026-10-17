// O cubo vivo (spec 2026-10-17, seção 5): as regras puras de qual estado o desenho mostra. O desenho está em LiveCube.svelte.
import type { SyncStatus } from '../sync/engine';
import type { SignInSync } from './state/account.svelte';
import { isSending } from './sync-status';

export type CubeState = 'idle' | 'wave' | 'turn' | 'fill' | 'solved' | 'error';

// Quantas das 9 peças ficam verdes: 0 a 9; sem total conhecido, nenhuma.
export function filledPieces(sent: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(9, Math.max(0, Math.floor((sent / total) * 9)));
}

// O cubo do passo do primeiro sync. "Enchendo" só com o total conhecido (a fase de enviar, a mesma regra do syncLine); baixando a conta, "girando".
export function firstSyncCube(progress: SignInSync | null, status: SyncStatus): { state: CubeState; filled: number } {
  if (progress === 'done') return { state: 'solved', filled: 9 };
  if (progress === 'cancelled' || status.phase === 'error' || status.phase === 'offline') return { state: 'error', filled: 0 };
  if (status.progress && isSending(status.progress)) return { state: 'fill', filled: filledPieces(status.progress.sent, status.progress.total) };
  return { state: 'turn', filled: 0 };
}

// Menos movimento (sistema ou ajuste): o CSS já para tudo; isto é para quem decide em JS (esperar a cascata, o tremor).
export function motionReduced(): boolean {
  return document.documentElement.dataset.reducedMotion === 'true';
}
