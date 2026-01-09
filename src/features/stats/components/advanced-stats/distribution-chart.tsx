import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeDistribution } from '@/features/stats/advanced';
import { useTranslation } from '@/shared/hooks/use-translation';

type DistributionChartProps = {
  distribution: TimeDistribution;
};

export function DistributionChart({ distribution }: DistributionChartProps) {
  const { t } = useTranslation();

  const chartData = distribution.ranges.map((range, index) => ({
    range,
    count: distribution.counts[index],
  }));

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="range"
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
            angle={-45}
            textAnchor="end"
            height={60}
            interval={0}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke="rgba(255,255,255,0.3)"
            tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
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
            radius={[4, 4, 4, 4]}
            animationDuration={800}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
