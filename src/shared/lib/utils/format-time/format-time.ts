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
