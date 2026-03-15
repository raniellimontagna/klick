import { Bolt, GraphUp, InfoCircle, Target } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { formatAverage, formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { DistributionChart } from './distribution-chart';
import { EvolutionChart, type EvolutionSeriesKey } from './evolution-chart';
import {
  type EvolutionMetric,
  type StatsPeriod,
  type Tab,
  useAdvancedStatsContent,
} from './use-advanced-stats-modal';

const tabs: { icon: typeof GraphUp; id: Tab }[] = [
  { id: 'evolution', icon: GraphUp },
  { id: 'consistency', icon: Target },
  { id: 'performance', icon: Bolt },
];

const periodOptions: StatsPeriod[] = ['last12', 'last25', 'last50', 'all'];
const metricOptions: EvolutionMetric[] = ['all', 'single', 'ao5', 'ao12'];

const seriesKeyMap: Record<Exclude<EvolutionMetric, 'all'>, EvolutionSeriesKey> = {
  ao5: 'ao5',
  ao12: 'ao12',
  single: 'single',
};

const legendToneMap: Record<EvolutionSeriesKey, string> = {
  ao5: 'bg-success',
  ao12: 'bg-info',
  single: 'bg-primary',
};

function getConsistencyLevel(
  cv: number,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
) {
  if (cv < 10) {
    return {
      badgeClassName: 'border-success/25 bg-success/10 text-success',
      label: strings.advancedStats.consistency.coefficientOfVariation.excellent,
      toneClassName: 'text-success',
    };
  }

  if (cv < 15) {
    return {
      badgeClassName: 'border-info/25 bg-info/10 text-info',
      label: strings.advancedStats.consistency.coefficientOfVariation.good,
      toneClassName: 'text-info',
    };
  }

  if (cv < 20) {
    return {
      badgeClassName: 'border-warning/25 bg-warning/10 text-warning',
      label: strings.advancedStats.consistency.coefficientOfVariation.average,
      toneClassName: 'text-warning',
    };
  }

  return {
    badgeClassName: 'border-danger/25 bg-danger/10 text-danger',
    label: strings.advancedStats.consistency.coefficientOfVariation.needsWork,
    toneClassName: 'text-danger',
  };
}

function getPeriodLabel(period: StatsPeriod, strings: ReturnType<typeof useI18nStore.getState>['t']) {
  switch (period) {
    case 'last12':
      return strings.advancedStats.filters.last12;
    case 'last25':
      return strings.advancedStats.filters.last25;
    case 'last50':
      return strings.advancedStats.filters.last50;
    default:
      return strings.advancedStats.filters.all;
  }
}

function getMetricLabel(
  metric: EvolutionMetric,
  strings: ReturnType<typeof useI18nStore.getState>['t'],
) {
  switch (metric) {
    case 'single':
      return strings.advancedStats.filters.single;
    case 'ao5':
      return strings.advancedStats.filters.ao5;
    case 'ao12':
      return strings.advancedStats.filters.ao12;
    default:
      return strings.advancedStats.filters.allMetrics;
  }
}

export const AdvancedStatsContent: React.FC = (): React.ReactElement => {
  const { t } = useI18nStore();
  const {
    activeTab,
    setActiveTab,
    advancedStats,
    chartData,
    evolutionMetric,
    filteredSolves,
    hasEnoughData,
    overview,
    period,
    setEvolutionMetric,
    setPeriod,
  } = useAdvancedStatsContent();

  const visibleSeries = useMemo<EvolutionSeriesKey[]>(
    () =>
      evolutionMetric === 'all'
        ? ['single', 'ao5', 'ao12']
        : [seriesKeyMap[evolutionMetric as Exclude<EvolutionMetric, 'all'>]],
    [evolutionMetric],
  );

  const dominantRange = useMemo(() => {
    const { counts, ranges } = advancedStats.performance.distribution;

    if (counts.length === 0 || ranges.length === 0) {
      return null;
    }

    let dominantIndex = 0;

    counts.forEach((count, index) => {
      if (count > counts[dominantIndex]) {
        dominantIndex = index;
      }
    });

    if (counts[dominantIndex] === 0) {
      return null;
    }

    return ranges[dominantIndex];
  }, [advancedStats.performance.distribution]);

  const consistencyLevel = getConsistencyLevel(
    advancedStats.consistency.coefficientOfVariation,
    t,
  );

  return (
    <div className="flex h-full flex-col gap-5">
      <section className="surface-base rounded-[1.75rem] p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {t.advancedStats.filters.category}
            </p>
            <div className="overflow-x-auto pb-1">
              <nav
                className="inline-flex min-w-max rounded-full border border-border/75 bg-surface/70 p-1"
                aria-label="Abas de estatísticas"
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeTab === tab.id;
                  const label = t.advancedStats.tabs[tab.id];

                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary'
                      }`}
                      aria-pressed={isActive}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="space-y-2 xl:min-w-[18rem]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {t.advancedStats.filters.period}
            </p>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-max rounded-full border border-border/75 bg-surface/70 p-1">
                {periodOptions.map((option) => {
                  const isActive = period === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setPeriod(option)}
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary'
                      }`}
                      aria-pressed={isActive}
                    >
                      {getPeriodLabel(option, t)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {activeTab === 'evolution' ? (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
              {t.advancedStats.filters.metric}
            </p>
            <div className="overflow-x-auto pb-1">
              <div className="inline-flex min-w-max rounded-full border border-border/75 bg-surface/70 p-1">
                {metricOptions.map((option) => {
                  const isActive = evolutionMetric === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setEvolutionMetric(option)}
                      className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? 'bg-primary text-white'
                          : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary'
                      }`}
                      aria-pressed={isActive}
                    >
                      {getMetricLabel(option, t)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <article className="surface-base rounded-[1.45rem] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {t.advancedStats.overview.sample}
          </p>
          <p className="mt-3 font-mono text-[1.8rem] font-black tracking-[-0.05em] text-text-primary">
            {overview.sampleCount}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {t.advancedStats.overview.sampleMeta
              .replace('{count}', String(filteredSolves.length))
              .replace('{period}', getPeriodLabel(period, t))}
          </p>
        </article>

        <article className="surface-base rounded-[1.45rem] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {t.advancedStats.overview.bestSingle}
          </p>
          <p className="mt-3 font-mono text-[1.8rem] font-black tracking-[-0.05em] text-text-primary">
            {overview.bestSingle ? formatTime(overview.bestSingle.value) : '--'}
          </p>
          <p className="mt-2 text-sm text-text-secondary">{t.advancedStats.overview.bestSingleMeta}</p>
        </article>

        <article className="surface-base rounded-[1.45rem] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {t.advancedStats.overview.currentAo5}
          </p>
          <p className="mt-3 font-mono text-[1.8rem] font-black tracking-[-0.05em] text-text-primary">
            {formatAverage(overview.currentAo5)}
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            {overview.currentAo5
              ? t.advancedStats.overview.currentAo5Meta
              : t.advancedStats.overview.needMore.replace('{count}', '5')}
          </p>
        </article>

        <article className="surface-base rounded-[1.45rem] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
            {t.advancedStats.overview.averageTPS}
          </p>
          <p className="mt-3 font-mono text-[1.8rem] font-black tracking-[-0.05em] text-text-primary">
            {overview.averageTPS > 0 ? overview.averageTPS.toFixed(2) : '--'}
          </p>
          <p className="mt-2 text-sm text-text-secondary">{t.advancedStats.overview.averageTPSMeta}</p>
        </article>
      </section>

      {!hasEnoughData ? (
        <section className="surface-panel flex min-h-[24rem] flex-col items-center justify-center rounded-[1.85rem] border-2 border-dashed border-border/70 px-6 py-16 text-center">
          <div className="mb-4 rounded-full border border-border/70 bg-surface/65 p-4">
            <GraphUp size={48} className="text-text-muted opacity-50" />
          </div>
          <h3 className="text-xl font-black tracking-tight text-text-primary">
            {t.advancedStats.evolution.noData}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
            {t.advancedStats.evolution.tip}
          </p>
        </section>
      ) : (
        <AnimatePresence mode="wait">
          {activeTab === 'evolution' ? (
            <motion.section
              key="evolution"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="surface-panel rounded-[1.85rem] p-4 sm:p-5"
              aria-label={t.advancedStats.evolution.title}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t.advancedStats.tabs.evolution}
                  </p>
                  <h3 className="mt-2 text-xl font-black tracking-tight text-text-primary">
                    {t.advancedStats.evolution.title}
                  </h3>
                  <p className="mt-1 text-sm text-text-secondary">
                    {t.advancedStats.evolution.description}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {visibleSeries.map((series) => (
                    <span
                      key={series}
                      className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-surface/70 px-3 py-1 text-xs font-semibold text-text-secondary"
                    >
                      <span className={`h-2 w-2 rounded-full ${legendToneMap[series]}`} aria-hidden="true" />
                      {t.advancedStats.evolution[series]}
                    </span>
                  ))}
                  <span className="rounded-full border border-border/70 bg-surface/70 px-3 py-1 text-xs font-semibold text-text-secondary">
                    {t.advancedStats.evolution.legendDnf}
                  </span>
                </div>
              </div>

              <div className="mt-5">
                <EvolutionChart data={chartData} visibleSeries={visibleSeries} />
              </div>
            </motion.section>
          ) : null}

          {activeTab === 'consistency' ? (
            <motion.section
              key="consistency"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
              aria-label={t.advancedStats.tabs.consistency}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <article className="surface-panel rounded-[1.85rem] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t.advancedStats.consistency.standardDeviation.title}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="font-mono text-[2.5rem] font-black tracking-[-0.06em] text-text-primary">
                        {(advancedStats.consistency.standardDeviation / 1000).toFixed(2)}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {t.advancedStats.consistency.standardDeviation.value}
                      </p>
                    </div>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-surface/70 text-primary">
                      <Target size={18} />
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                    {t.advancedStats.consistency.standardDeviation.description}
                  </p>
                </article>

                <article className="surface-panel rounded-[1.85rem] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                        {t.advancedStats.consistency.coefficientOfVariation.title}
                      </p>
                      <p className={`mt-4 font-mono text-[2.5rem] font-black tracking-[-0.06em] ${consistencyLevel.toneClassName}`}>
                        {advancedStats.consistency.coefficientOfVariation.toFixed(2)}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {t.advancedStats.consistency.coefficientOfVariation.value}
                      </p>
                    </div>

                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] ${consistencyLevel.badgeClassName}`}
                    >
                      {consistencyLevel.label}
                    </span>
                  </div>

                  <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                    {t.advancedStats.consistency.coefficientOfVariation.description}
                  </p>
                </article>
              </div>

              <aside className="feedback-info rounded-[1.6rem] border p-5">
                <div className="flex items-start gap-3">
                  <span className="surface-base inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-info">
                    <InfoCircle size={18} />
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-text-primary">
                      {t.advancedStats.consistency.interpretation.title}
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                      {t.advancedStats.consistency.interpretation.description}
                    </p>
                  </div>
                </div>
              </aside>
            </motion.section>
          ) : null}

          {activeTab === 'performance' ? (
            <motion.section
              key="performance"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
              aria-label={t.advancedStats.tabs.performance}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,0.72fr)_minmax(16rem,0.38fr)]">
                <article className="surface-panel rounded-[1.85rem] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t.advancedStats.performance.averageTPS.title}
                  </p>
                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div>
                      <p className="font-mono text-[2.75rem] font-black tracking-[-0.06em] text-warning">
                        {advancedStats.performance.averageTPS.toFixed(2)}
                      </p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {t.advancedStats.performance.averageTPS.value}
                      </p>
                    </div>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-warning/25 bg-warning/10 text-warning">
                      <Bolt size={18} />
                    </span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                    {t.advancedStats.performance.averageTPS.description}
                  </p>
                  <p className="mt-3 text-xs leading-relaxed text-text-muted">
                    {t.advancedStats.performance.averageTPS.note}
                  </p>
                </article>

                <article className="surface-panel rounded-[1.85rem] p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                    {t.advancedStats.performance.dominantRange.title}
                  </p>
                  <p className="mt-4 font-mono text-[1.9rem] font-black tracking-[-0.05em] text-text-primary">
                    {dominantRange ?? '--'}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {dominantRange
                      ? t.advancedStats.performance.dominantRange.description
                      : t.advancedStats.performance.dominantRange.empty}
                  </p>
                </article>
              </div>

              <article className="surface-panel rounded-[1.85rem] p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      {t.advancedStats.tabs.performance}
                    </p>
                    <h4 className="mt-2 text-xl font-black tracking-tight text-text-primary">
                      {t.advancedStats.performance.distribution.title}
                    </h4>
                    <p className="mt-1 text-sm text-text-secondary">
                      {t.advancedStats.performance.distribution.description}
                    </p>
                  </div>
                  <span className="rounded-full border border-border/70 bg-surface/70 px-3 py-1 text-xs font-semibold text-text-secondary">
                    {t.advancedStats.overview.sampleMeta
                      .replace('{count}', String(filteredSolves.length))
                      .replace('{period}', getPeriodLabel(period, t))}
                  </span>
                </div>

                <div className="mt-5">
                  <DistributionChart distribution={advancedStats.performance.distribution} />
                </div>
              </article>
            </motion.section>
          ) : null}
        </AnimatePresence>
      )}
    </div>
  );
};
