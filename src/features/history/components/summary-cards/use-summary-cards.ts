import { useMemo } from 'react';
import { calculateAo5 } from '@/features/stats/averages';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Solve } from '@/shared/types';

export type SummaryCardTone = 'default' | 'primary' | 'accent' | 'warning';

interface HistorySummaryCard {
  id: string;
  label: string;
  value: string;
  description: string;
  tone: SummaryCardTone;
}

function replaceTokens(template: string, values: Record<string, string | number>): string {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  );
}

export function useSummaryCards(solves: Solve[]): HistorySummaryCard[] {
  const { t } = useI18nStore();

  return useMemo(() => {
    if (solves.length === 0) {
      return [];
    }

    const validSolves = solves.filter((solve) => Number.isFinite(solve.effectiveMs));
    const penalizedSolves = solves.filter((solve) => solve.penalty !== 'NONE').length;
    const bestSingle =
      validSolves.length > 0 ? Math.min(...validSolves.map((solve) => solve.effectiveMs)) : null;
    const average =
      validSolves.length > 0
        ? validSolves.reduce((total, solve) => total + solve.effectiveMs, 0) / validSolves.length
        : null;
    const currentAo5 = calculateAo5(solves);

    return [
      {
        id: 'total',
        label: t.history.summary.total,
        value: String(solves.length),
        description: replaceTokens(t.history.summary.totalMeta, {
          penalties: penalizedSolves,
          valid: validSolves.length,
        }),
        tone: 'default',
      },
      {
        id: 'best',
        label: t.history.summary.best,
        value: bestSingle === null ? '--' : formatTime(bestSingle),
        description: t.history.summary.bestMeta,
        tone: 'accent',
      },
      {
        id: 'average',
        label: t.history.summary.average,
        value: average === null ? '--' : formatTime(average),
        description: replaceTokens(t.history.summary.averageMeta, {
          valid: validSolves.length,
        }),
        tone: 'primary',
      },
      {
        id: 'ao5',
        label: t.history.summary.recentAo5,
        value:
          currentAo5 === null ? '--' : currentAo5.isDNF ? 'DNF' : formatTime(currentAo5.value),
        description:
          currentAo5 === null
            ? replaceTokens(t.history.summary.needMoreSolves, { count: 5 })
            : t.history.summary.recentAo5Meta,
        tone: 'warning',
      },
    ];
  }, [solves, t]);
}
