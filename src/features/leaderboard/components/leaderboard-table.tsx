import { Card } from '@/shared/components/ui';
import { formatTime } from '@/shared/lib';

interface LeaderboardRow {
  id: string;
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
    <Card className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-muted">{title}</h2>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-border/70 bg-surface/65 p-4 text-sm text-text-secondary">
          {emptyLabel}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-text-muted">
              <tr className="border-b border-border/70">
                <th className="px-3 py-2">{rankLabel}</th>
                <th className="px-3 py-2">{userLabel}</th>
                <th className="px-3 py-2">{singleLabel}</th>
                <th className="px-3 py-2">{ao5Label}</th>
                <th className="px-3 py-2">{ao12Label}</th>
                <th className="px-3 py-2">{consistencyLabel}</th>
                <th className="px-3 py-2">{solvesLabel}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr
                  key={row.id}
                  className={`border-b border-border/60 last:border-b-0 ${
                    row.isCurrentUser ? 'bg-primary/10' : 'hover:bg-surface/65'
                  }`}
                >
                  <td className="px-3 py-2 font-semibold text-text-primary">#{index + 1}</td>
                  <td className="px-3 py-2 text-text-primary">{row.userLabel}</td>
                  <td className="px-3 py-2 font-mono text-text-secondary">{formatTimeValue(row.bestSingleMs)}</td>
                  <td className="px-3 py-2 font-mono text-text-secondary">{formatTimeValue(row.bestAo5Ms)}</td>
                  <td className="px-3 py-2 font-mono text-text-secondary">{formatTimeValue(row.bestAo12Ms)}</td>
                  <td className="px-3 py-2 font-mono text-text-secondary">
                    {formatConsistencyValue(row.consistencyScore)}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{row.solveCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
