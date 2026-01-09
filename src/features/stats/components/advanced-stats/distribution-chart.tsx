import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, } from 'recharts';
import type { TimeDistribution } from '@/features/stats/advanced';
import { useTheme } from '@/shared/hooks/use-theme';
import { useTranslation } from '@/shared/hooks/use-translation';

type DistributionChartProps = {
  distribution: TimeDistribution;
};

export function DistributionChart({ distribution }: DistributionChartProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();

  const chartData = distribution.ranges.map((range, index) => ({
    range,
    count: distribution.counts[index],
  }));

  // Theme colors
  const textColor = isDark ? '#E6EDF3' : '#1F2328';
  const gridColor = isDark ? '#30363D' : '#D0D7DE';
  const backgroundColor = isDark ? '#0D1117' : '#FFFFFF';

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="range"
            label={{
              value: t.advancedStats.performance.distribution.xAxis,
              position: 'insideBottom',
              offset: -5,
            }}
            stroke={textColor}
            tick={{ fill: textColor, fontSize: 12 }}
            angle={-45}
            textAnchor="end"
            height={80}
          />
          <YAxis
            label={{
              value: t.advancedStats.performance.distribution.yAxis,
              angle: -90,
              position: 'insideLeft',
            }}
            stroke={textColor}
            tick={{ fill: textColor }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor,
              borderColor: gridColor,
              color: textColor,
            }}
            labelStyle={{ color: textColor }}
            formatter={(value: number) => [value, t.advancedStats.performance.distribution.yAxis]}
          />
          <Bar dataKey="count" fill="#7C4DFF" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
