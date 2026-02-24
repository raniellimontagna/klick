import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartDataPoint } from '@/features/stats/advanced';
import { formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';

type EvolutionChartProps = {
  data: ChartDataPoint[];
};

export const EvolutionChart: React.FC<EvolutionChartProps> = ({
  data,
}: EvolutionChartProps): React.ReactElement => {
  const { t } = useI18nStore();

  const chartData = data.map((point) => ({
    solve: point.index,
    single: point.single ? point.single / 1000 : null, // Convert to seconds
    ao5: point.ao5 ? point.ao5 / 1000 : null,
    ao12: point.ao12 ? point.ao12 / 1000 : null,
    rawSingle: point.single,
    rawAo5: point.ao5,
    rawAo12: point.ao12,
  }));

  return (
    <div className="w-full h-80" role="img" aria-label="Gráfico de evolução de tempos">
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-white-5)" vertical={false} />
          <XAxis
            dataKey="solve"
            stroke="var(--color-text-muted)"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-text-muted)' }}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            fontSize={12}
            tickFormatter={(val) => val.toFixed(1)}
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'var(--color-text-muted)' }}
            domain={['auto', 'auto']}
          />
          <Tooltip
            cursor={{ stroke: 'var(--color-white-10)', strokeWidth: 2 }}
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="glass p-3 rounded-lg border border-white/10 shadow-xl min-w-[150px]">
                    <p className="text-text-muted text-xs mb-2 font-bold uppercase tracking-wider">
                      Solve #{label}
                    </p>
                    <div className="space-y-1">
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
                            <span className="text-sm font-mono font-bold text-text-primary">
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
          <Legend
            wrapperStyle={{ paddingTop: '20px' }}
            iconType="circle"
            formatter={(value) => <span className="text-xs text-text-muted ml-1">{value}</span>}
          />
          <Line
            type="monotone"
            dataKey="single"
            stroke="var(--color-primary)"
            name={t.advancedStats.evolution.single}
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-surface)', strokeWidth: 2 }}
            activeDot={{ r: 5, fill: 'var(--color-primary)' }}
            connectNulls={false}
            animationDuration={500}
          />
          <Line
            type="monotone"
            dataKey="ao5"
            stroke="var(--color-success)"
            name={t.advancedStats.evolution.ao5}
            strokeWidth={2}
            dot={false}
            strokeDasharray="5 5"
            activeDot={{ r: 5, fill: 'var(--color-success)' }}
            connectNulls={false}
            animationDuration={500}
          />
          <Line
            type="monotone"
            dataKey="ao12"
            stroke="var(--color-info)"
            name={t.advancedStats.evolution.ao12}
            strokeWidth={2}
            dot={false}
            strokeOpacity={0.7}
            activeDot={{ r: 5, fill: 'var(--color-info)' }}
            connectNulls={false}
            animationDuration={500}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
