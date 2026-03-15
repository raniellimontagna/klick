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
    <section className="surface-panel rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">
            {t.homeRevamp.solveFeed.title}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{t.homeRevamp.solveFeed.subtitle}</p>
        </div>

        <div className="inline-flex rounded-full border border-border/75 bg-surface/70 p-1">
          {FILTER_OPTIONS.map((option) => {
            const isSelected = filter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => onFilterChange(option)}
                className={`rounded-full px-3 py-1 text-xs font-semibold tracking-wide transition ${
                  isSelected
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary'
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
        <div className="mt-4 rounded-2xl border border-dashed border-border/80 bg-surface/55 p-8 text-center text-sm text-text-secondary">
          {t.homeRevamp.solveFeed.empty}
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl border border-border/75">
          <div className="hidden grid-cols-[auto_1fr_auto_auto] gap-3 border-b border-border/75 bg-surface/65 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-text-muted sm:grid">
            <span>#</span>
            <span>{t.solveTable.columns.time}</span>
            <span>{t.solveTable.columns.date}</span>
            <span>{t.solveTable.columns.scramble}</span>
          </div>

          <ul className="max-h-80 divide-y divide-border/70 overflow-y-auto">
            {solves.map((solve, index) => {
              const solveNumber = solves.length - index;
              const penaltyTag = getPenaltyTag(solve.penalty);

              return (
                <li
                  key={solve.id}
                  className="grid gap-2 bg-surface/58 px-4 py-3 sm:grid-cols-[auto_1fr_auto_auto] sm:items-center sm:gap-3"
                >
                  <span className="font-mono text-xs text-text-muted">#{solveNumber}</span>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-xl font-black tracking-tight ${
                        solve.penalty === 'DNF' ? 'text-danger' : 'text-text-primary'
                      }`}
                    >
                      {solve.penalty === 'DNF' ? 'DNF' : formatTime(solve.effectiveMs)}
                    </span>
                    {penaltyTag && penaltyTag !== 'DNF' && (
                      <span className="rounded-md border border-warning/35 bg-warning/15 px-1.5 py-0.5 text-[11px] font-bold text-warning">
                        {penaltyTag}
                      </span>
                    )}
                  </div>

                  <span className="text-xs text-text-secondary">{formatCreatedAt(solve.createdAt)}</span>
                  <span className="truncate font-mono text-xs text-text-muted" title={solve.scramble}>
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
        className="mt-4 flex flex-wrap items-center gap-2 text-xs text-text-muted"
      >
        <span className="font-semibold uppercase tracking-[0.14em] text-text-secondary">
          {t.homeRevamp.solveFeed.shortcutsLabel}
        </span>
        <kbd className="rounded border border-border/75 bg-surface/80 px-2 py-1 font-mono text-text-primary">
          Space
        </kbd>
        <kbd className="rounded border border-border/75 bg-surface/80 px-2 py-1 font-mono text-text-primary">
          N
        </kbd>
        <kbd className="rounded border border-border/75 bg-surface/80 px-2 py-1 font-mono text-text-primary">
          P
        </kbd>
        <kbd className="rounded border border-border/75 bg-surface/80 px-2 py-1 font-mono text-text-primary">
          D
        </kbd>
        <kbd className="rounded border border-border/75 bg-surface/80 px-2 py-1 font-mono text-text-primary">
          U
        </kbd>
      </div>
    </section>
  );
}
