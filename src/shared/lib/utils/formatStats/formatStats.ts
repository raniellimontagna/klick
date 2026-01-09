import type { Average } from '@/features/stats/averages';
import { formatTime } from '../formatTime/formatTime';

export function formatAverage(average: Average | null): string {
  if (!average) {
    return '-';
  }

  if (average.isDNF) {
    return 'DNF';
  }

  return formatTime(average.value);
}
