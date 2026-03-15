import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeDistribution } from '@/features/stats/advanced';
import { useMediaQuery } from '@/shared/hooks';
import { useI18nStore } from '@/shared/store/i18n-store';

type DistributionChartProps = {
  distribution: TimeDistribution;
};

export const DistributionChart: React.FC<DistributionChartProps> = ({
  distribution,
}: DistributionChartProps): React.ReactElement => {
  const { t } = useI18nStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  const chartData = distribution.ranges.map((range, index) => ({
    count: distribution.counts[index],
    range: range.replace('s', ''),
  }));

  return (
    <div className="h-[24rem] w-full" role="img" aria-label="Gráfico de distribuição de tempos">
      <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{
            bottom: 0,
            left: isMobile ? 8 : 18,
            right: isMobile ? 8 : 18,
            top: 8,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(138, 150, 173, 0.18)" horizontal={false} />
          <XAxis
            type="number"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="range"
            stroke="var(--color-text-muted)"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={isMobile ? 54 : 68}
          />
          <Tooltip
            cursor={{ fill: 'rgba(138, 150, 173, 0.12)' }}
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div className="surface-overlay min-w-[10rem] rounded-2xl p-3">
                    <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-text-muted">
                      {data.range}s
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-text-primary">{data.count}</span>
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
            radius={[0, 999, 999, 0]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
