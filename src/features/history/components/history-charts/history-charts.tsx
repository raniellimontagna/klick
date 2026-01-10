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
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Solve } from '@/shared/types';

interface HistoryChartsProps {
  solves: Solve[];
}

export function HistoryCharts({ solves }: HistoryChartsProps) {
  const { t } = useI18nStore();

  if (solves.length === 0) {
    return (
      <div className="h-64 w-full flex flex-col items-center justify-center text-text-muted/50 border-2 border-dashed border-white/5 rounded-xl">
        <GraphUp size={48} className="mb-4 opacity-50" />
        <p className="text-sm font-medium">{t.history.charts.noData.title}</p>
        <p className="text-xs mt-1">{t.history.charts.noData.description}</p>
      </div>
    );
  }

  // Also handle single solve case better
  if (solves.length < 2) {
    return (
      <div className="h-64 w-full flex flex-col items-center justify-center text-text-muted/50 border-2 border-dashed border-white/5 rounded-xl">
        <GraphUp size={48} className="mb-4 opacity-50" />
        <p className="text-sm font-medium">{t.history.charts.insufficientData.title}</p>
        <p className="text-xs mt-1">{t.history.charts.insufficientData.description}</p>
      </div>
    );
  }

  // Prepare data (reverse to show oldest to newest left to right)
  const data = [...solves].reverse().map((solve, index) => ({
    i: index + 1,
    timeMs: solve.effectiveMs,
    penalty: solve.penalty,
    displayTime: solve.penalty === 'DNF' ? null : solve.effectiveMs / 1000, // Seconds for Y-axis
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="i"
            stroke="rgba(255,255,255,0.3)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="rgba(255,255,255,0.3)"
            fontSize={12}
            tickFormatter={(val) => val.toFixed(1)}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const dataPoint = payload[0].payload;
                return (
                  <div className="glass p-3 rounded-lg border border-white/10 shadow-xl">
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
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-surface)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'var(--color-primary)' }}
            animationDuration={500}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
