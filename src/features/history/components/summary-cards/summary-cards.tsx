import {
  Alarm,
  ClockCircle,
  History as HistoryIcon,
  MedalRibbon,
} from '@solar-icons/react';
import type { Solve } from '@/shared/types';
import { useSummaryCards, type SummaryCardTone } from './use-summary-cards';

interface SummaryCardsProps {
  solves: Solve[];
}

const toneClasses: Record<SummaryCardTone, string> = {
  default: 'text-text-secondary bg-surface/72 border-border/75',
  primary: 'text-primary bg-primary/10 border-primary/20',
  accent: 'text-accent bg-accent/10 border-accent/20',
  warning: 'text-warning bg-warning/10 border-warning/20',
};

const iconMap = {
  ao5: Alarm,
  average: ClockCircle,
  best: MedalRibbon,
  total: HistoryIcon,
};

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  solves,
}: SummaryCardsProps): React.ReactElement | null => {
  const cards = useSummaryCards(solves);

  if (cards.length === 0) {
    return null;
  }

  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Resumo estatístico">
      {cards.map((card) => (
        <article
          key={card.id}
          className="surface-panel flex min-h-[10.5rem] flex-col justify-between rounded-[1.5rem] p-4 sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                {card.label}
              </p>
              <p className="mt-3 font-mono text-[1.9rem] font-black tracking-[-0.05em] text-text-primary sm:text-[2.15rem]">
                {card.value}
              </p>
            </div>

            <span
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border ${toneClasses[card.tone]}`}
              aria-hidden="true"
            >
              {(() => {
                const Icon = iconMap[card.id as keyof typeof iconMap];
                return Icon ? <Icon size={18} /> : null;
              })()}
            </span>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-text-secondary">{card.description}</p>
        </article>
      ))}
    </section>
  );
};
