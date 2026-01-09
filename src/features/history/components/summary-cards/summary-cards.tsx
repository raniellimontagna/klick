import { ArrowDown, ArrowUp, Clock, Medal } from 'lucide-react';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Solve } from '@/shared/types';

interface SummaryCardsProps {
  solves: Solve[];
}

export function SummaryCards({ solves }: SummaryCardsProps) {
  const { t } = useI18nStore();

  if (solves.length === 0) return null;

  const validSolves = solves.filter((s) => s.penalty !== 'DNF');
  const best = validSolves.length > 0 ? Math.min(...validSolves.map((s) => s.effectiveMs)) : 0;
  const worst = validSolves.length > 0 ? Math.max(...validSolves.map((s) => s.effectiveMs)) : 0;

  const average =
    validSolves.length > 0
      ? validSolves.reduce((acc, s) => acc + s.effectiveMs, 0) / validSolves.length
      : 0;

  // Calculate Standard Deviation
  const variance =
    validSolves.length > 0
      ? validSolves.reduce((acc, s) => acc + (s.effectiveMs - average) ** 2, 0) / validSolves.length
      : 0;
  const stdDev = Math.sqrt(variance);

  const cards = [
    {
      label: t.stats.best,
      value: best,
      icon: Medal,
      color: 'text-warning',
    },
    {
      label: t.stats.average,
      value: average,
      icon: Clock,
      color: 'text-primary',
    },
    {
      label: t.stats.worst,
      value: worst,
      icon: ArrowUp,
      color: 'text-danger',
    },
    {
      label: t.stats.deviation,
      value: stdDev,
      icon: ArrowDown,
      color: 'text-text-muted',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="glass p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center text-center"
        >
          <div className={`p-2 rounded-full bg-surface mb-2 ${card.color} bg-opacity-10`}>
            <card.icon size={18} className={card.color} />
          </div>
          <span className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
            {card.label}
          </span>
          <span className="text-lg sm:text-2xl font-mono font-bold text-text-primary tracking-tight">
            {validSolves.length > 0 ? formatTime(card.value) : '-'}
          </span>
        </div>
      ))}
    </div>
  );
}
