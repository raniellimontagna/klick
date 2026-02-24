import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeDistribution } from '@/features/stats/advanced';
import { useI18nStore } from '@/shared/store/i18n-store';

type DistributionChartProps = {
  distribution: TimeDistribution;
};

export const DistributionChart: React.FC<DistributionChartProps> = ({
  distribution,
}: DistributionChartProps): React.ReactElement => {
  const { t } = useI18nStore();

  const chartData = distribution.ranges.map((range, index) => ({
    range,
    count: distribution.counts[index],
  }));

  return (
    <div className="w-full h-80" role="img" aria-label="Gráfico de distribuição de tempos">
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-white-5)" vertical={false} />
          <XAxis
            dataKey="range"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={0}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-white-5)' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="glass p-3 rounded-lg border border-white/10 shadow-xl min-w-[150px]">
                    <p className="text-text-muted text-xs mb-1 font-bold uppercase tracking-wider">
                      {data.range}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-primary">{data.count}</span>
                      <span className="text-xs text-text-muted">
                        {t.advancedStats.performance.distribution.yAxis}
                      </span>
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar
            dataKey="count"
            fill="var(--color-primary)"
            radius={[4, 4, 0, 0]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
