import { GraphUp } from '@solar-icons/react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo } from 'react';
import { useMediaQuery } from '@/shared/hooks';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Solve } from '@/shared/types';

interface HistoryChartsProps {
  solves: Solve[];
}

export const HistoryCharts: React.FC<HistoryChartsProps> = ({
  solves,
}: HistoryChartsProps): React.ReactElement => {
  const { t } = useI18nStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const data = useMemo(
    () =>
      [...solves].map((solve, index) => ({
        displayTime: Number.isFinite(solve.effectiveMs) ? solve.effectiveMs / 1000 : null,
        i: index + 1,
        penalty: solve.penalty,
        timeMs: solve.effectiveMs,
      })),
    [solves],
  );

  const trendCopy = useMemo(() => {
    const validTimes = solves
      .map((solve) => solve.effectiveMs)
      .filter((value) => Number.isFinite(value)) as number[];

    if (validTimes.length < 2) {
      return null;
    }

    const first = validTimes[0];
    const last = validTimes.at(-1);

    if (typeof last !== 'number') {
      return null;
    }

    const delta = Math.abs(last - first);

    if (delta < 250) {
      return t.history.charts.trendStable;
    }

    return last < first
      ? t.history.charts.trendFaster.replace('{delta}', formatTime(delta))
      : t.history.charts.trendSlower.replace('{delta}', formatTime(delta));
  }, [solves, t]);

  if (solves.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 text-text-muted/70">
        <GraphUp size={48} className="mb-4 opacity-50" />
        <p className="text-sm font-medium">{t.history.charts.noData.title}</p>
        <p className="text-xs mt-1">{t.history.charts.noData.description}</p>
      </div>
    );
  }

  if (solves.length < 2) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/70 text-text-muted/70">
        <GraphUp size={48} className="mb-4 opacity-50" />
        <p className="text-sm font-medium">{t.history.charts.insufficientData.title}</p>
        <p className="text-xs mt-1">{t.history.charts.insufficientData.description}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-text-secondary">
          <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
          {t.history.charts.legendSingle}
        </span>
        <span className="rounded-full border border-border/75 bg-surface/65 px-3 py-1 text-xs font-semibold text-text-secondary">
          {t.history.charts.legendDnf}
        </span>
        {trendCopy ? (
          <span className="rounded-full border border-accent/20 bg-accent/10 px-3 py-1 text-xs font-semibold text-text-secondary">
            {trendCopy}
          </span>
        ) : null}
      </div>

      <div className="h-72 w-full rounded-[1.5rem] border border-border/75 bg-surface/48 p-3 sm:h-80 sm:p-4">
        <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
          <LineChart
            data={data}
            margin={{
              bottom: 0,
              left: isMobile ? -26 : -12,
              right: isMobile ? 4 : 12,
              top: 6,
            }}
          >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(138, 150, 173, 0.28)" vertical={false} />
          <XAxis
            dataKey="i"
            stroke="rgba(138, 150, 173, 0.72)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            minTickGap={isMobile ? 18 : 10}
          />
          <YAxis
            stroke="rgba(138, 150, 173, 0.72)"
            fontSize={12}
            tickFormatter={(val) => val.toFixed(1)}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
            width={isMobile ? 38 : 48}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const dataPoint = payload[0].payload;
                return (
                  <div className="surface-overlay min-w-[10rem] rounded-2xl p-3">
                    <p className="text-text-muted text-xs mb-1">
                      {t.history.charts.tooltip.solve} #{label}
                    </p>
                    <p
                      className={`text-xl font-bold font-mono ${dataPoint.penalty === 'DNF' ? 'text-danger' : 'text-primary'}`}
                    >
                      {dataPoint.penalty === 'DNF' ? 'DNF' : formatTime(dataPoint.timeMs)}
                    </p>
                    {dataPoint.penalty === '+2' && (
                      <span className="text-xs text-warning block mt-1">
                        +2 {t.history.charts.tooltip.penaltyApplied}
                      </span>
                    )}
                  </div>
                );
              }
              return null;
            }}
          />
          <Line
            type="monotone"
            dataKey="displayTime"
            stroke="var(--color-primary)"
            strokeWidth={2.25}
            dot={false}
            activeDot={{ r: 5, fill: 'var(--color-primary)' }}
            animationDuration={500}
            connectNulls={false}
          />
        </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
