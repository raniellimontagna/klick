import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { formatAverage } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import {
  HomeControls,
  HomeProgressPanel,
  HomeScramblePanel,
  HomeSolveFeed,
  HomeStatsGrid,
  HomeTimerPanel,
} from './components';
import { useHomeTimerDashboard } from './hooks/use-home-timer-dashboard';

export function Home() {
  const { t } = useI18nStore();

  const {
    scramble,
    state,
    timeMs,
    inspectionTimeLeft,
    inspectionDuration,
    isFocusMode,
    cubeState,
    copied,
    copyScramble,
    visualizationMode,
    setVisualizationMode,
    solveFilter,
    setSolveFilter,
    filteredSolves,
    lastPenalty,
    isNewBest,
    generateNewScramble,
    toggleLastPlus2,
    toggleLastDNF,
    undoLastSolve,
    single,
    ao5,
    ao12,
    bestAo5,
    bestAo12,
    progressSummary,
    dailyChallenges,
  } = useHomeTimerDashboard();

  const singleValue = formatAverage(single);
  const ao5Value = formatAverage(ao5);
  const ao12Value = formatAverage(ao12);
  const bestAo5Value = formatAverage(bestAo5);
  const bestAo12Value = formatAverage(bestAo12);

  const stats = useMemo(
    () => [
      { id: 'single', label: t.stats.single, value: singleValue },
      { id: 'ao5', label: t.stats.ao5, value: ao5Value },
      { id: 'ao12', label: t.stats.ao12, value: ao12Value },
      { id: 'bestAo5', label: t.stats.bestAo5, value: bestAo5Value },
      { id: 'bestAo12', label: t.stats.bestAo12, value: bestAo12Value },
    ],
    [ao5Value, ao12Value, bestAo12Value, bestAo5Value, singleValue, t],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="app-shell-page app-shell-page-wide flex min-h-0 flex-col gap-4 pb-4 sm:gap-5"
    >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] xl:items-start">
        <HomeTimerPanel
          state={state}
          timeMs={timeMs}
          inspectionTimeLeft={inspectionTimeLeft}
          inspectionDuration={inspectionDuration}
          isNewBest={isNewBest}
          lastPenalty={lastPenalty}
          actions={
            <HomeControls
              onNewScramble={generateNewScramble}
              onTogglePlus2={toggleLastPlus2}
              onToggleDNF={toggleLastDNF}
              onUndoLast={undoLastSolve}
            />
          }
        />

        <HomeScramblePanel
          scramble={scramble}
          cubeState={cubeState}
          copied={copied}
          isFocusMode={isFocusMode}
          visualizationMode={visualizationMode}
          onCopy={copyScramble}
          onNewScramble={generateNewScramble}
          onChangeVisualizationMode={setVisualizationMode}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] xl:items-start">
        <div className="grid gap-4">
          <HomeStatsGrid title={t.homeRevamp.statsTitle} stats={stats} />
          <HomeProgressPanel summary={progressSummary} challenges={dailyChallenges} />
        </div>

        <HomeSolveFeed solves={filteredSolves} filter={solveFilter} onFilterChange={setSolveFilter} />
      </section>
    </motion.div>
  );
}
