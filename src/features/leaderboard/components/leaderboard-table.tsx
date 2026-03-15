import { Card } from '@/shared/components/ui';
import { formatTime } from '@/shared/lib';

interface LeaderboardRow {
  id: string;
  rank: number;
  userLabel: string;
  isCurrentUser: boolean;
  bestSingleMs: number | null;
  bestAo5Ms: number | null;
  bestAo12Ms: number | null;
  consistencyScore: number | null;
  solveCount: number;
}

interface LeaderboardTableProps {
  title: string;
  emptyLabel: string;
  rankLabel: string;
  userLabel: string;
  singleLabel: string;
  ao5Label: string;
  ao12Label: string;
  consistencyLabel: string;
  solvesLabel: string;
  rows: LeaderboardRow[];
}

function formatTimeValue(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return formatTime(value);
}

function formatConsistencyValue(value: number | null): string {
  if (value === null) {
    return '--';
  }

  return `${value.toFixed(2)}%`;
}

export function LeaderboardTable({
  title,
  emptyLabel,
  rankLabel,
  userLabel,
  singleLabel,
  ao5Label,
  ao12Label,
  consistencyLabel,
  solvesLabel,
  rows,
}: LeaderboardTableProps) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">
          {title}
        </h2>
        <span className="surface-base rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
          {rows.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="surface-base rounded-[1.5rem] px-4 py-4 text-sm text-text-secondary">
          {emptyLabel}
        </p>
      ) : (
        <>
          <div className="grid gap-3 lg:hidden">
            {rows.map((row) => (
              <article
                key={row.id}
                className={`rounded-[1.5rem] border px-4 py-4 ${
                  row.isCurrentUser
                    ? 'border-primary/35 bg-primary/10'
                    : 'border-border/70 bg-surface/65'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary">{row.userLabel}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-text-muted">
                      {rankLabel}: #{row.rank}
                    </p>
                  </div>
                  <span className="surface-base rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-secondary">
                    {solvesLabel}: {row.solveCount}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                      {singleLabel}
                    </p>
                    <p className="mt-1 font-mono text-sm text-text-primary">
                      {formatTimeValue(row.bestSingleMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                      {ao5Label}
                    </p>
                    <p className="mt-1 font-mono text-sm text-text-primary">
                      {formatTimeValue(row.bestAo5Ms)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                      {ao12Label}
                    </p>
                    <p className="mt-1 font-mono text-sm text-text-primary">
                      {formatTimeValue(row.bestAo12Ms)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-text-muted">
                      {consistencyLabel}
                    </p>
                    <p className="mt-1 font-mono text-sm text-text-primary">
                      {formatConsistencyValue(row.consistencyScore)}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.12em] text-text-muted">
                <tr className="border-b border-border/70">
                  <th className="px-3 py-3">{rankLabel}</th>
                  <th className="px-3 py-3">{userLabel}</th>
                  <th className="px-3 py-3">{singleLabel}</th>
                  <th className="px-3 py-3">{ao5Label}</th>
                  <th className="px-3 py-3">{ao12Label}</th>
                  <th className="px-3 py-3">{consistencyLabel}</th>
                  <th className="px-3 py-3">{solvesLabel}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border/60 last:border-b-0 ${
                      row.isCurrentUser ? 'bg-primary/10' : 'hover:bg-surface/65'
                    }`}
                  >
                    <td className="px-3 py-3 font-semibold text-text-primary">#{row.rank}</td>
                    <td className="px-3 py-3 text-text-primary">{row.userLabel}</td>
                    <td className="px-3 py-3 font-mono text-text-secondary">
                      {formatTimeValue(row.bestSingleMs)}
                    </td>
                    <td className="px-3 py-3 font-mono text-text-secondary">
                      {formatTimeValue(row.bestAo5Ms)}
                    </td>
                    <td className="px-3 py-3 font-mono text-text-secondary">
                      {formatTimeValue(row.bestAo12Ms)}
                    </td>
                    <td className="px-3 py-3 font-mono text-text-secondary">
                      {formatConsistencyValue(row.consistencyScore)}
                    </td>
                    <td className="px-3 py-3 text-text-secondary">{row.solveCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}
