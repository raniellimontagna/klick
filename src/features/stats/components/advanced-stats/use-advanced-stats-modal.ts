import { useMemo, useState } from 'react';
import {
  type AdvancedStats,
  type ChartDataPoint,
  calculateAdvancedStats,
  prepareChartData,
} from '@/features/stats/advanced';
import { calculateAo5, calculateSingle } from '@/features/stats/averages';
import { useSessionsStore } from '@/shared/store/sessions-store';

export type Tab = 'evolution' | 'consistency' | 'performance';
export type StatsPeriod = 'last12' | 'last25' | 'last50' | 'all';
export type EvolutionMetric = 'all' | 'single' | 'ao5' | 'ao12';

interface StatsOverview {
  averageTPS: number;
  bestSingle: ReturnType<typeof calculateSingle> | null;
  currentAo5: ReturnType<typeof calculateAo5>;
  sampleCount: number;
}

interface UseAdvancedStatsContentReturn {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  evolutionMetric: EvolutionMetric;
  setEvolutionMetric: (metric: EvolutionMetric) => void;
  filteredSolves: ReturnType<typeof useSessionsStore.getState>['sessions'][number]['solves'];
  chartData: ChartDataPoint[];
  advancedStats: AdvancedStats;
  hasEnoughData: boolean;
  overview: StatsOverview;
  period: StatsPeriod;
  setPeriod: (period: StatsPeriod) => void;
}

export const useAdvancedStatsContent = (): UseAdvancedStatsContentReturn => {
  const [activeTab, setActiveTab] = useState<Tab>('evolution');
  const [period, setPeriod] = useState<StatsPeriod>('last25');
  const [evolutionMetric, setEvolutionMetric] = useState<EvolutionMetric>('all');

  const { sessions, activeSessionId } = useSessionsStore();

  const solves = useMemo(() => {
    const currentSession = sessions.find((s) => s.id === activeSessionId);
    return currentSession?.solves || [];
  }, [sessions, activeSessionId]);

  const filteredSolves = useMemo(() => {
    if (period === 'all') {
      return solves;
    }

    const limitMap: Record<Exclude<StatsPeriod, 'all'>, number> = {
      last12: 12,
      last25: 25,
      last50: 50,
    };

    return solves.slice(-limitMap[period]);
  }, [period, solves]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    return prepareChartData(filteredSolves);
  }, [filteredSolves]);

  const advancedStats: AdvancedStats = useMemo(() => {
    return calculateAdvancedStats(filteredSolves);
  }, [filteredSolves]);

  const overview = useMemo<StatsOverview>(
    () => ({
      averageTPS: advancedStats.performance.averageTPS,
      bestSingle: filteredSolves.length > 0 ? calculateSingle(filteredSolves) : null,
      currentAo5: calculateAo5(filteredSolves),
      sampleCount: filteredSolves.length,
    }),
    [advancedStats.performance.averageTPS, filteredSolves],
  );

  const hasEnoughData = filteredSolves.length >= 5;

  return {
    activeTab,
    setActiveTab,
    evolutionMetric,
    setEvolutionMetric,
    filteredSolves,
    chartData,
    advancedStats,
    hasEnoughData,
    overview,
    period,
    setPeriod,
  };
};
