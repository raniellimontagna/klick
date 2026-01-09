import { AnimatePresence, motion } from 'framer-motion';
import { TrendingUp, Target, Zap } from 'lucide-react';
import { Button, Card } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/hooks/useTranslation';
import { EvolutionChart } from './EvolutionChart';
import { DistributionChart } from './DistributionChart';
import { useAdvancedStatsContent, type Tab } from './useAdvancedStatsModal';

export function AdvancedStatsContent() {
  const { t } = useTranslation();
  const { activeTab, setActiveTab, chartData, advancedStats, hasEnoughData } =
    useAdvancedStatsContent();

  const tabs: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'evolution', label: t.advancedStats.tabs.evolution, icon: TrendingUp },
    { id: 'consistency', label: t.advancedStats.tabs.consistency, icon: Target },
    { id: 'performance', label: t.advancedStats.tabs.performance, icon: Zap },
  ];

  const getConsistencyLevel = (cv: number) => {
    if (cv < 10)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.excellent,
        color: 'text-green-400',
      };
    if (cv < 15)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.good,
        color: 'text-blue-400',
      };
    if (cv < 20)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.average,
        color: 'text-yellow-400',
      };
    return {
      label: t.advancedStats.consistency.coefficientOfVariation.needsWork,
      color: 'text-red-400',
    };
  };

  const consistencyLevel = getConsistencyLevel(advancedStats.consistency.coefficientOfVariation);

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border px-6 bg-surface rounded-t-xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              variant="ghost"
              className={`flex items-center gap-2 px-4 py-3 border-b-2 rounded-none transition-all duration-200 ${isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
            >
              <Icon size={18} />
              <span className="hidden sm:inline font-medium">{tab.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-surface rounded-b-xl">
        {!hasEnoughData && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <TrendingUp size={48} className="text-text-secondary mb-4" />
            <p className="text-text-primary mb-2 font-semibold">
              {t.advancedStats.evolution.noData}
            </p>
            <p className="text-sm text-text-secondary">{t.advancedStats.evolution.tip}</p>
          </div>
        )}

        {hasEnoughData && (
          <AnimatePresence mode="wait">
            {activeTab === 'evolution' && (
              <motion.div
                key="evolution"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <div>
                  <h3 className="text-xl font-semibold text-text-primary mb-2">
                    {t.advancedStats.evolution.title}
                  </h3>
                  <p className="text-text-secondary text-sm mb-6">
                    {t.advancedStats.evolution.description}
                  </p>
                </div>
                <EvolutionChart data={chartData} />
              </motion.div>
            )}

            {activeTab === 'consistency' && (
              <motion.div
                key="consistency"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-xl font-semibold text-text-primary mb-2">
                    {t.advancedStats.consistency.title}
                  </h3>
                  <p className="text-text-secondary text-sm mb-6">
                    {t.advancedStats.consistency.description}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Standard Deviation */}
                  <Card variant="background">
                    <h4 className="text-lg font-semibold text-text-primary mb-2">
                      {t.advancedStats.consistency.standardDeviation.title}
                    </h4>
                    <p className="text-sm text-text-secondary mb-4">
                      {t.advancedStats.consistency.standardDeviation.description}
                    </p>
                    <div className="text-3xl font-bold text-primary">
                      {(advancedStats.consistency.standardDeviation / 1000).toFixed(2)}
                      <span className="text-sm text-text-secondary ml-2">
                        {t.advancedStats.consistency.standardDeviation.value}
                      </span>
                    </div>
                  </Card>

                  {/* Coefficient of Variation */}
                  <Card variant="background">
                    <h4 className="text-lg font-semibold text-text-primary mb-2">
                      {t.advancedStats.consistency.coefficientOfVariation.title}
                    </h4>
                    <p className="text-sm text-text-secondary mb-4">
                      {t.advancedStats.consistency.coefficientOfVariation.description}
                    </p>
                    <div className="text-3xl font-bold text-primary mb-2">
                      {advancedStats.consistency.coefficientOfVariation.toFixed(2)}
                      <span className="text-sm text-text-secondary ml-2">
                        {t.advancedStats.consistency.coefficientOfVariation.value}
                      </span>
                    </div>
                    <div className={`text-sm font-medium ${consistencyLevel.color}`}>
                      {consistencyLevel.label}
                    </div>
                  </Card>
                </div>

                {/* Interpretation */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-6">
                  <h4 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2">
                    {t.advancedStats.consistency.interpretation.title}
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    {t.advancedStats.consistency.interpretation.description}
                  </p>
                </div>
              </motion.div>
            )}

            {activeTab === 'performance' && (
              <motion.div
                key="performance"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-6"
              >
                <div>
                  <h3 className="text-xl font-semibold text-text-primary mb-2">
                    {t.advancedStats.performance.title}
                  </h3>
                  <p className="text-text-secondary text-sm mb-6">
                    {t.advancedStats.performance.description}
                  </p>
                </div>

                {/* Average TPS */}
                <Card variant="background">
                  <h4 className="text-lg font-semibold text-text-primary mb-2">
                    {t.advancedStats.performance.averageTPS.title}
                  </h4>
                  <p className="text-sm text-text-secondary mb-4">
                    {t.advancedStats.performance.averageTPS.description}
                  </p>
                  <div className="text-3xl font-bold text-primary mb-2">
                    {advancedStats.performance.averageTPS.toFixed(2)}
                    <span className="text-sm text-text-secondary ml-2">
                      {t.advancedStats.performance.averageTPS.value}
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    {t.advancedStats.performance.averageTPS.note}
                  </p>
                </Card>

                {/* Distribution */}
                <div>
                  <h4 className="text-lg font-semibold text-text-primary mb-2">
                    {t.advancedStats.performance.distribution.title}
                  </h4>
                  <p className="text-sm text-text-secondary mb-4">
                    {t.advancedStats.performance.distribution.description}
                  </p>
                  <DistributionChart distribution={advancedStats.performance.distribution} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

      </div>
    </div>
  );
}
