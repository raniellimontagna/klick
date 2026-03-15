import { memo } from 'react';

interface HomeStatCard {
  id: string;
  label: string;
  value: string;
}

interface HomeStatsGridProps {
  title: string;
  stats: HomeStatCard[];
}

export const HomeStatsGrid = memo(function HomeStatsGrid({ title, stats }: HomeStatsGridProps) {
  return (
    <section
      data-onboarding="stats"
      aria-label={title}
      className="surface-panel rounded-3xl p-4 sm:p-5"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">{title}</p>
      <ul className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map((stat) => (
          <li
            key={stat.id}
            className="rounded-2xl border border-border/75 bg-surface/62 p-4 transition hover:border-border-strong/75"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
              {stat.label}
            </p>
            <p className="mt-2 font-mono text-[1.65rem] font-black tracking-[-0.04em] text-text-primary">
              {stat.value}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
});
