import { AnimatePresence, motion } from 'framer-motion';
import { Info, Target, TrendingUp, Zap } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/use-translation';
import { DistributionChart } from './distribution-chart';
import { EvolutionChart } from './evolution-chart';
import { type Tab, useAdvancedStatsContent } from './use-advanced-stats-modal';

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
        bg: 'bg-green-400/10',
        border: 'border-green-400/20',
      };
    if (cv < 15)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.good,
        color: 'text-blue-400',
        bg: 'bg-blue-400/10',
        border: 'border-blue-400/20',
      };
    if (cv < 20)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.average,
        color: 'text-yellow-400',
        bg: 'bg-yellow-400/10',
        border: 'border-yellow-400/20',
      };
    return {
      label: t.advancedStats.consistency.coefficientOfVariation.needsWork,
      color: 'text-red-400',
      bg: 'bg-red-400/10',
      border: 'border-red-400/20',
    };
  };

  const consistencyLevel = getConsistencyLevel(advancedStats.consistency.coefficientOfVariation);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Tabs - Pill Design */}
      <div className="flex p-1 bg-black/20 backdrop-blur-md rounded-xl border border-white/5 overflow-x-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              variant="ghost"
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActive
                  ? 'bg-primary/20 text-auth-active shadow-sm border border-primary/20'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <Icon size={18} />
              <span className="font-medium whitespace-nowrap">{tab.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-[400px]">
        {!hasEnoughData ? (
          <div className="flex flex-col items-center justify-center h-full py-16 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
            <div className="bg-white/5 p-4 rounded-full mb-4">
              <TrendingUp size={48} className="text-text-muted opacity-50" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              {t.advancedStats.evolution.noData}
            </h3>
            <p className="text-text-muted max-w-md mx-auto">{t.advancedStats.evolution.tip}</p>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'evolution' && (
              <motion.div
                key="evolution"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="glass p-6 rounded-2xl border border-white/5">
                  <div className="mb-6">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-primary" />
                      {t.advancedStats.evolution.title}
                    </h3>
                    <p className="text-sm text-text-muted mt-1">
                      {t.advancedStats.evolution.description}
                    </p>
                  </div>
                  <EvolutionChart data={chartData} />
                </div>
              </motion.div>
            )}

            {activeTab === 'consistency' && (
              <motion.div
                key="consistency"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Standard Deviation */}
                  <div className="glass p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Target size={64} />
                    </div>
                    <h4 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
                      {t.advancedStats.consistency.standardDeviation.title}
                    </h4>
                    <p className="text-xs text-text-muted mb-6 h-8">
                      {t.advancedStats.consistency.standardDeviation.description}
                    </p>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-mono font-bold text-primary">
                        {(advancedStats.consistency.standardDeviation / 1000).toFixed(2)}
                      </span>
                      <span className="text-sm font-bold text-text-muted">
                        {t.advancedStats.consistency.standardDeviation.value}
                      </span>
                    </div>
                  </div>

                  {/* Coefficient of Variation */}
                  <div
                    className={`glass p-6 rounded-2xl border relative overflow-hidden transition-colors ${consistencyLevel.border}`}
                  >
                    <div
                      className={`absolute inset-0 opacity-5 pointer-events-none ${consistencyLevel.bg}`}
                    />
                    <h4 className="text-lg font-bold text-text-primary mb-2">
                      {t.advancedStats.consistency.coefficientOfVariation.title}
                    </h4>
                    <p className="text-xs text-text-muted mb-6 h-8">
                      {t.advancedStats.consistency.coefficientOfVariation.description}
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-mono font-bold ${consistencyLevel.color}`}>
                          {advancedStats.consistency.coefficientOfVariation.toFixed(2)}
                        </span>
                        <span className="text-sm font-bold text-text-muted">
                          {t.advancedStats.consistency.coefficientOfVariation.value}
                        </span>
                      </div>
                      <span
                        className={`inline-flex self-start items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${consistencyLevel.color} ${consistencyLevel.border} ${consistencyLevel.bg}`}
                      >
                        {consistencyLevel.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interpretation */}
                <div className="glass p-5 rounded-xl border border-blue-500/20 bg-blue-500/5 flex gap-4">
                  <Info className="flex-shrink-0 text-blue-400 w-6 h-6" />
                  <div>
                    <h4 className="font-bold text-blue-400 mb-1">
                      {t.advancedStats.consistency.interpretation.title}
                    </h4>
                    <p className="text-sm text-blue-300/80 leading-relaxed">
                      {t.advancedStats.consistency.interpretation.description}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'performance' && (
              <motion.div
                key="performance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* Average TPS */}
                <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
                      <Zap className="w-5 h-5 text-yellow-400" />
                      {t.advancedStats.performance.averageTPS.title}
                    </h4>
                    <p className="text-sm text-text-muted">
                      {t.advancedStats.performance.averageTPS.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-mono font-bold text-yellow-400">
                        {advancedStats.performance.averageTPS.toFixed(2)}
                      </span>
                      <span className="text-sm font-bold text-text-muted">
                        {t.advancedStats.performance.averageTPS.value}
                      </span>
                    </div>
                    <span className="text-xs text-text-muted/50 mt-1">
                      {t.advancedStats.performance.averageTPS.note}
                    </span>
                  </div>
                </div>

                {/* Distribution */}
                <div className="glass p-6 rounded-2xl border border-white/5">
                  <div className="mb-6">
                    <h4 className="text-lg font-bold text-text-primary mb-2">
                      {t.advancedStats.performance.distribution.title}
                    </h4>
                    <p className="text-sm text-text-muted">
                      {t.advancedStats.performance.distribution.description}
                    </p>
                  </div>
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
