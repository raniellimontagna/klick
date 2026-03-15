import { AltArrowDown, AltArrowUp, ClockCircle, MedalRibbon } from '@solar-icons/react';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Solve } from '@/shared/types';

interface SummaryCardsProps {
  solves: Solve[];
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  solves,
}: SummaryCardsProps): React.ReactElement | null => {
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
      icon: MedalRibbon,
      color: 'text-warning',
    },
    {
      label: t.stats.average,
      value: average,
      icon: ClockCircle,
      color: 'text-primary',
    },
    {
      label: t.stats.worst,
      value: worst,
      icon: AltArrowUp,
      color: 'text-danger',
    },
    {
      label: t.stats.deviation,
      value: stdDev,
      icon: AltArrowDown,
      color: 'text-text-muted',
    },
  ];

  return (
    <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6" aria-label="Resumo estatístico">
      {cards.map((card) => (
        <article
          key={card.label}
          className="surface-panel flex flex-col items-center justify-center rounded-2xl p-4 text-center"
        >
          <div
            className={`mb-2 rounded-full border border-border/70 bg-surface/70 p-2 ${card.color}`}
            aria-hidden="true"
          >
            <card.icon size={18} className={card.color} />
          </div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-1">
            {card.label}
          </h3>
          <p className="text-lg sm:text-2xl font-mono font-bold text-text-primary tracking-tight">
            {validSolves.length > 0 ? formatTime(card.value) : '-'}
          </p>
        </article>
      ))}
    </section>
  );
};
