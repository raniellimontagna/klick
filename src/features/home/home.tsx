import { GraphUp, Stopwatch, Widget } from '@solar-icons/react';
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

  const stats = [
    { id: 'single', label: t.stats.single, value: formatAverage(single) },
    { id: 'ao5', label: t.stats.ao5, value: formatAverage(ao5) },
    { id: 'ao12', label: t.stats.ao12, value: formatAverage(ao12) },
    { id: 'bestAo5', label: t.stats.bestAo5, value: formatAverage(bestAo5) },
    { id: 'bestAo12', label: t.stats.bestAo12, value: formatAverage(bestAo12) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="relative flex min-h-full flex-col gap-5 pb-4"
    >
      <div className="pointer-events-none absolute inset-x-0 -top-10 h-72 rounded-[3rem] bg-[radial-gradient(circle_at_top,rgba(124,77,255,0.22),rgba(12,17,25,0))]" />

      <section className="relative rounded-3xl border border-white/10 bg-zinc-900/70 p-5 sm:p-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-300">
          <Stopwatch size={16} />
          {t.homeRevamp.badge}
        </div>

        <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-100 sm:text-3xl">
          {t.homeRevamp.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-300 sm:text-base">
          {t.homeRevamp.subtitle}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              {t.homeRevamp.highlights.inspectionTitle}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Stopwatch size={16} />
              {t.homeRevamp.highlights.inspectionDescription}
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              {t.homeRevamp.highlights.visualTitle}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <Widget size={16} />
              {t.homeRevamp.highlights.visualDescription}
            </p>
          </article>

          <article className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-zinc-400">
              {t.homeRevamp.highlights.statsTitle}
            </p>
            <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-zinc-100">
              <GraphUp size={16} />
              {t.homeRevamp.highlights.statsDescription}
            </p>
          </article>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <HomeTimerPanel
          state={state}
          timeMs={timeMs}
          inspectionTimeLeft={inspectionTimeLeft}
          inspectionDuration={inspectionDuration}
          isNewBest={isNewBest}
          lastPenalty={lastPenalty}
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

      <HomeControls
        onNewScramble={generateNewScramble}
        onTogglePlus2={toggleLastPlus2}
        onToggleDNF={toggleLastDNF}
        onUndoLast={undoLastSolve}
      />

      <HomeStatsGrid title={t.homeRevamp.statsTitle} stats={stats} />

      <HomeProgressPanel summary={progressSummary} challenges={dailyChallenges} />

      <HomeSolveFeed solves={filteredSolves} filter={solveFilter} onFilterChange={setSolveFilter} />
    </motion.div>
  );
}
