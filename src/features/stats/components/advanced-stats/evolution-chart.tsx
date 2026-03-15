import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartDataPoint } from '@/features/stats/advanced';
import { useMediaQuery } from '@/shared/hooks';
import { formatTime } from '@/shared/lib';

export type EvolutionSeriesKey = 'single' | 'ao5' | 'ao12';

type EvolutionChartProps = {
  data: ChartDataPoint[];
  visibleSeries: EvolutionSeriesKey[];
};

const seriesConfig: Record<EvolutionSeriesKey, { color: string; strokeDasharray?: string }> = {
  ao5: { color: 'var(--color-success)', strokeDasharray: '5 5' },
  ao12: { color: 'var(--color-info)' },
  single: { color: 'var(--color-primary)' },
};

export const EvolutionChart: React.FC<EvolutionChartProps> = ({
  data,
  visibleSeries,
}: EvolutionChartProps): React.ReactElement => {
  const isMobile = useMediaQuery('(max-width: 767px)');

  const chartData = data.map((point) => ({
    ao12: point.ao12 ? point.ao12 / 1000 : null,
    ao5: point.ao5 ? point.ao5 / 1000 : null,
    rawAo12: point.ao12,
    rawAo5: point.ao5,
    rawSingle: point.single,
    single: point.single ? point.single / 1000 : null,
    solve: point.index,
  }));

  return (
    <div className="h-72 w-full sm:h-80" role="img" aria-label="Gráfico de evolução de tempos">
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <LineChart
          data={chartData}
          margin={{
            bottom: 0,
            left: isMobile ? -24 : -12,
            right: isMobile ? 4 : 12,
            top: 8,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(138, 150, 173, 0.28)" vertical={false} />
          <XAxis
            dataKey="solve"
            stroke="var(--color-text-muted)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-text-muted)' }}
            minTickGap={isMobile ? 18 : 10}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            fontSize={12}
            tickFormatter={(val) => val.toFixed(1)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-text-muted)' }}
            domain={['auto', 'auto']}
            width={isMobile ? 40 : 50}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(138, 150, 173, 0.38)', strokeWidth: 2 }}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="surface-overlay min-w-[10rem] rounded-2xl p-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                      Solve #{label}
                    </p>
                    <div className="space-y-1.5">
                      {payload.map((item) => {
                        const dataKey = String(item.dataKey);
                        const rawKey = `raw${dataKey.charAt(0).toUpperCase() + dataKey.slice(1)}`;
                        const value = (item.payload as Record<string, number | null | undefined>)[
                          rawKey
                        ];

                        return (
                          <div key={item.name} className="flex items-center justify-between gap-4">
                            <span className="text-xs font-medium" style={{ color: item.color }}>
                              {item.name}
                            </span>
                            <span className="font-mono text-sm font-bold text-text-primary">
                              {typeof value === 'number' ? formatTime(value) : '-'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />

          {visibleSeries.map((series) => {
            const config = seriesConfig[series];

            return (
              <Line
                key={series}
                type="monotone"
                dataKey={series}
                stroke={config.color}
                name={series}
                strokeWidth={series === 'single' ? 2.5 : 2}
                dot={false}
                activeDot={{ r: 5, fill: config.color }}
                connectNulls={false}
                animationDuration={500}
                strokeDasharray={config.strokeDasharray}
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
