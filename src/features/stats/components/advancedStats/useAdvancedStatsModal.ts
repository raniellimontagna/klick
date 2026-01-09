import { useState, useMemo } from 'react';
import { useSessionsStore } from '@/shared/store/stores/sessionsStore';
import {
  prepareChartData,
  calculateAdvancedStats,
  type ChartDataPoint,
  type AdvancedStats,
} from '@/features/stats/advanced';

export type Tab = 'evolution' | 'consistency' | 'performance';

export function useAdvancedStatsContent() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('evolution');

  const { sessions, activeSessionId } = useSessionsStore();

  const solves = useMemo(() => {
    const currentSession = sessions.find((s) => s.id === activeSessionId);
    return currentSession?.solves || [];
  }, [sessions, activeSessionId]);

  const chartData: ChartDataPoint[] = useMemo(() => {
    return prepareChartData(solves);
  }, [solves]);

  const advancedStats: AdvancedStats = useMemo(() => {
    return calculateAdvancedStats(solves);
  }, [solves]);

  const hasEnoughData = solves.length >= 5;

  return {
    isOpen,
    setIsOpen,
    activeTab,
    setActiveTab,
    chartData,
    advancedStats,
    hasEnoughData,
  };
}
