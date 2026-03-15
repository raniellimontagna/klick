interface HomeStatCard {
  id: string;
  label: string;
  value: string;
}

interface HomeStatsGridProps {
  title: string;
  stats: HomeStatCard[];
}

export function HomeStatsGrid({ title, stats }: HomeStatsGridProps) {
  return (
    <section
      data-onboarding="stats"
      aria-label={title}
      className="rounded-3xl border border-white/10 bg-zinc-900/70 p-4 sm:p-6"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">{title}</p>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <li
            key={stat.id}
            className="rounded-2xl border border-white/10 bg-black/25 p-4 transition hover:border-white/20"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
              {stat.label}
            </p>
            <p className="mt-2 font-mono text-2xl font-black tracking-tight text-zinc-100">
              {stat.value}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
