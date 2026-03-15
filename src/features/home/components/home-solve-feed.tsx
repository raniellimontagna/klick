import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Penalty, Solve } from '@/shared/types';
import type { HomeSolveFilter } from '../hooks/use-home-timer-dashboard';

interface HomeSolveFeedProps {
  solves: Solve[];
  filter: HomeSolveFilter;
  onFilterChange: (filter: HomeSolveFilter) => void;
}

function formatCreatedAt(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getPenaltyTag(penalty: Penalty): string | null {
  if (penalty === '+2') {
    return '+2';
  }

  if (penalty === 'DNF') {
    return 'DNF';
  }

  return null;
}

const FILTER_OPTIONS: HomeSolveFilter[] = [5, 12, 50];

export function HomeSolveFeed({ solves, filter, onFilterChange }: HomeSolveFeedProps) {
  const { t } = useI18nStore();

  return (
    <section className="rounded-3xl border border-white/10 bg-zinc-900/70 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
            {t.homeRevamp.solveFeed.title}
          </p>
          <p className="mt-1 text-sm text-zinc-300">{t.homeRevamp.solveFeed.subtitle}</p>
        </div>

        <div className="inline-flex rounded-full border border-white/10 bg-black/30 p-1">
          {FILTER_OPTIONS.map((option) => {
            const isSelected = filter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onFilterChange(option)}
                className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition ${
                  isSelected
                    ? 'bg-primary text-fixed-white'
                    : 'text-zinc-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-pressed={isSelected}
              >
                {t.homeRevamp.solveFeed.last.replace('{count}', String(option))}
              </button>
            );
          })}
        </div>
      </div>

      {solves.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-white/20 bg-black/20 p-8 text-center text-sm text-zinc-300">
          {t.homeRevamp.solveFeed.empty}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
          <div className="hidden grid-cols-[auto_1fr_auto_auto] gap-3 border-b border-white/10 bg-black/35 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400 sm:grid">
            <span>#</span>
            <span>{t.solveTable.columns.time}</span>
            <span>{t.solveTable.columns.date}</span>
            <span>{t.solveTable.columns.scramble}</span>
          </div>

          <ul className="max-h-80 divide-y divide-white/5 overflow-y-auto">
            {solves.map((solve, index) => {
              const solveNumber = solves.length - index;
              const penaltyTag = getPenaltyTag(solve.penalty);

              return (
                <li
                  key={solve.id}
                  className="grid gap-2 bg-black/20 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-3"
                >
                  <span className="font-mono text-xs text-zinc-400">#{solveNumber}</span>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xl font-black tracking-tight ${
                        solve.penalty === 'DNF' ? 'text-rose-300' : 'text-zinc-100'
                      }`}
                    >
                      {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                    </span>
                    {penaltyTag && penaltyTag !== 'DNF' && (
                      <span className="rounded-md border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[11px] font-bold text-amber-200">
                        {penaltyTag}
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-zinc-300">{formatCreatedAt(solve.createdAt)}</span>
                  <span className="truncate font-mono text-xs text-zinc-400" title={solve.scramble}>
                    {solve.scramble}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div
        data-onboarding="shortcuts"
        className="mt-4 flex flex-wrap items-center gap-2 text-xs text-zinc-400"
      >
        <span className="font-semibold uppercase tracking-[0.14em] text-zinc-300">
          {t.homeRevamp.solveFeed.shortcutsLabel}
        </span>
        <kbd className="rounded border border-white/15 bg-black/35 px-2 py-1 font-mono text-zinc-100">
          Space
        </kbd>
        <kbd className="rounded border border-white/15 bg-black/35 px-2 py-1 font-mono text-zinc-100">
          N
        </kbd>
        <kbd className="rounded border border-white/15 bg-black/35 px-2 py-1 font-mono text-zinc-100">
          P
        </kbd>
        <kbd className="rounded border border-white/15 bg-black/35 px-2 py-1 font-mono text-zinc-100">
          D
        </kbd>
        <kbd className="rounded border border-white/15 bg-black/35 px-2 py-1 font-mono text-zinc-100">
          U
        </kbd>
      </div>
    </section>
  );
}
