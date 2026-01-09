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
import { useTheme } from '@/shared/hooks/hooks/use-theme';
import { useTranslation } from '@/shared/hooks/hooks/use-translation';

type EvolutionChartProps = {
  data: ChartDataPoint[];
};

export function EvolutionChart({ data }: EvolutionChartProps) {
  const { t } = useTranslation();
  const { isDark } = useTheme();

  const chartData = data.map((point) => ({
    solve: point.index,
    single: point.single ? point.single / 1000 : null, // Convert to seconds
    ao5: point.ao5 ? point.ao5 / 1000 : null,
    ao12: point.ao12 ? point.ao12 / 1000 : null,
  }));

  // Theme colors
  const textColor = isDark ? '#E6EDF3' : '#1F2328';
  const gridColor = isDark ? '#30363D' : '#D0D7DE';
  const backgroundColor = isDark ? '#0D1117' : '#FFFFFF';

  return (
    <div className="w-full h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            dataKey="solve"
            label={{
              value: t.advancedStats.evolution.solveNumber,
              position: 'insideBottom',
              offset: -5,
            }}
            stroke={textColor}
            tick={{ fill: textColor }}
          />
          <YAxis
            label={{ value: t.advancedStats.evolution.time, angle: -90, position: 'insideLeft' }}
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
            formatter={(value: number) => [`${value.toFixed(2)}s`, '']}
          />
          <Legend wrapperStyle={{ color: textColor }} />
          <Line
            type="monotone"
            dataKey="single"
            stroke="#7C4DFF"
            name={t.advancedStats.evolution.single}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="ao5"
            stroke="#39FF88"
            name={t.advancedStats.evolution.ao5}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="ao12"
            stroke="#00D9FF"
            name={t.advancedStats.evolution.ao12}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
