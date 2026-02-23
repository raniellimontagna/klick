import { Bolt, GraphUp, InfoCircle, Target } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';
import { DistributionChart } from './distribution-chart';
import { EvolutionChart } from './evolution-chart';
import { type Tab, useAdvancedStatsContent } from './use-advanced-stats-modal';

export const AdvancedStatsContent: React.FC = (): React.ReactElement => {
  const { t } = useI18nStore();
  const { activeTab, setActiveTab, chartData, advancedStats, hasEnoughData } =
    useAdvancedStatsContent();

  const tabs: { id: Tab; label: string; icon: typeof GraphUp }[] = [
    { id: 'evolution', label: t.advancedStats.tabs.evolution, icon: GraphUp },
    { id: 'consistency', label: t.advancedStats.tabs.consistency, icon: Target },
    { id: 'performance', label: t.advancedStats.tabs.performance, icon: Bolt },
  ];

  const getConsistencyLevel = (cv: number) => {
    if (cv < 10)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.excellent,
        color: 'text-success',
        bg: 'bg-success/10',
        border: 'border-success/20',
      };
    if (cv < 15)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.good,
        color: 'text-info',
        bg: 'bg-info/10',
        border: 'border-info/20',
      };
    if (cv < 20)
      return {
        label: t.advancedStats.consistency.coefficientOfVariation.average,
        color: 'text-warning',
        bg: 'bg-warning/10',
        border: 'border-warning/20',
      };
    return {
      label: t.advancedStats.consistency.coefficientOfVariation.needsWork,
      color: 'text-danger',
      bg: 'bg-danger/10',
      border: 'border-danger/20',
    };
  };

  const consistencyLevel = getConsistencyLevel(advancedStats.consistency.coefficientOfVariation);

  return (
    <div className="flex flex-col h-full space-y-6">
      {/* Tabs - Pill Design */}
      <nav
        className="flex p-1 bg-black/20 backdrop-blur-md rounded-xl border border-white/5 overflow-x-auto print:hidden"
        aria-label="Abas de estatísticas"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <Button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              variant="ghost"
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 ${
                isActive
                  ? 'bg-primary/20 text-primary shadow-sm border border-primary/20'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              <Icon size={18} />
              <span className="font-medium whitespace-nowrap">{tab.label}</span>
            </Button>
          );
        })}
      </nav>

      {/* Content */}
      <div className="min-h-[400px]">
        {!hasEnoughData ? (
          <section className="flex flex-col items-center justify-center h-full py-16 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/5">
            <div className="bg-white/5 p-4 rounded-full mb-4">
              <GraphUp size={48} className="text-text-muted opacity-50" />
            </div>
            <h3 className="text-xl font-bold text-text-primary mb-2">
              {t.advancedStats.evolution.noData}
            </h3>
            <p className="text-text-muted max-w-md mx-auto">{t.advancedStats.evolution.tip}</p>
          </section>
        ) : (
          <AnimatePresence mode="wait">
            {activeTab === 'evolution' && (
              <motion.section
                key="evolution"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                aria-label={t.advancedStats.evolution.title}
              >
                <div className="glass p-6 rounded-2xl border border-white/5">
                  <header className="mb-6">
                    <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                      <GraphUp size={20} className="text-primary" />
                      {t.advancedStats.evolution.title}
                    </h3>
                    <p className="text-sm text-text-muted mt-1">
                      {t.advancedStats.evolution.description}
                    </p>
                  </header>
                  <EvolutionChart data={chartData} />
                </div>
              </motion.section>
            )}

            {activeTab === 'consistency' && (
              <motion.section
                key="consistency"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                aria-label={t.advancedStats.tabs.consistency}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Standard Deviation */}
                  <div className="glass p-6 rounded-2xl border border-white/5 relative overflow-hidden group">
                    <div
                      className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"
                      aria-hidden="true"
                    >
                      <Target size={64} />
                    </div>
                    <h4 className="text-lg font-bold text-text-primary mb-2">
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
                    className={`glass p-6 rounded-2xl border relative overflow-hidden transition-colors ${consistencyLevel.border} ${consistencyLevel.bg}`}
                  >
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
                        className={`inline-flex self-start items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${consistencyLevel.color} ${consistencyLevel.border} bg-white/5`}
                      >
                        {consistencyLevel.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interpretation */}
                <aside className="glass p-5 rounded-xl border border-info/20 bg-info/5 flex gap-4">
                  <InfoCircle size={24} className="shrink-0 text-info" aria-hidden="true" />
                  <div>
                    <h4 className="font-bold text-info mb-1">
                      {t.advancedStats.consistency.interpretation.title}
                    </h4>
                    <p className="text-sm text-text-secondary leading-relaxed">
                      {t.advancedStats.consistency.interpretation.description}
                    </p>
                  </div>
                </aside>
              </motion.section>
            )}

            {activeTab === 'performance' && (
              <motion.section
                key="performance"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
                aria-label={t.advancedStats.tabs.performance}
              >
                {/* Average TPS */}
                <div className="glass p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex-1">
                    <h4 className="text-lg font-bold text-text-primary mb-2 flex items-center gap-2">
                      <Bolt size={20} className="text-warning" />
                      {t.advancedStats.performance.averageTPS.title}
                    </h4>
                    <p className="text-sm text-text-muted">
                      {t.advancedStats.performance.averageTPS.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-mono font-bold text-warning">
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
                  <header className="mb-6">
                    <h4 className="text-lg font-bold text-text-primary mb-2">
                      {t.advancedStats.performance.distribution.title}
                    </h4>
                    <p className="text-sm text-text-muted">
                      {t.advancedStats.performance.distribution.description}
                    </p>
                  </header>
                  <DistributionChart distribution={advancedStats.performance.distribution} />
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
};
