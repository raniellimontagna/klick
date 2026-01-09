export function formatTime(ms: number): string {
  if (!Number.isFinite(ms)) return 'DNF';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
  }

  return `${seconds}.${milliseconds.toString().padStart(2, '0')}`;
}

export function formatTimeWithPenalty(ms: number, penalty: string): string {
  const formatted = formatTime(ms);
  if (penalty === '+2') return `${formatted}+`;
  if (penalty === 'DNF') return 'DNF';
  return formatted;
}

/**
 * Formata tempo em ms para formato curto (sem milissegundos)
 */
export function formatTimeShort(ms: number): string {
  if (ms === Infinity) return 'DNF';
  if (ms === 0) return '0s';

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${seconds}s`;
}
