import { motion } from 'framer-motion';
import { HelpCircle, Timer } from 'lucide-react';
import { Button } from '@/shared';
import { CubeVisualizer } from '@/shared/components/cube-visualizer/cube-visualizer';
import { formatAverage } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import { StatCard } from './components/home-page-components/stat-card';
import { StatsInfoModal } from './components/home-page-components/stats-info-modal';
import { InspectionDisplay } from './components/inspection-display/inspection-display';
import { ScrambleBox } from './components/scramble-box/scramble-box';
import { TimerDisplay } from './components/timer-display/timer-display';
import { useHome } from './use-home';

export function Home() {
  const { t } = useI18nStore();
  const { getSingle, getAo5, getAo12, getBestAo5, getBestAo12 } = useSessionsStore(); // Stats retrieval remains in component or could be moved to hook if strictly following pattern, but easy enough here.

  const {
    scramble,
    state,
    timeMs,
    inspectionTimeLeft,
    isFocusMode,
    showStatsInfo,
    setShowStatsInfo,
    generateNewScramble,
    cubeState,
  } = useHome();

  // Stats
  const stats = [
    { label: t.stats.single, value: getSingle() },
    { label: t.stats.ao5, value: getAo5() },
    { label: t.stats.ao12, value: getAo12() },
    { label: t.stats.bestAo5, value: getBestAo5() },
    { label: t.stats.bestAo12, value: getBestAo12() },
  ];

  return (
    <div className="flex flex-col h-full items-center justify-center min-h-[80vh] relative">
      {/* Timer & Scramble Area - Always Centered */}
      <div className="flex flex-col items-center w-full max-w-4xl z-10 space-y-8 md:space-y-12">
        {/* Scramble - Fades out during solve */}
        <motion.div
          className="w-full"
          animate={{ opacity: isFocusMode ? 0 : 1, y: isFocusMode ? -20 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ScrambleBox
            scramble={scramble}
            onNewScramble={generateNewScramble}
            data-onboarding="scramble"
          />

          {cubeState && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-4"
            >
              <CubeVisualizer
                config={{
                  faces: [
                    { label: 'U', colors: cubeState.U },
                    { label: 'F', colors: cubeState.F },
                    { label: 'R', colors: cubeState.R },
                    { label: 'D', colors: cubeState.D },
                    { label: 'L', colors: cubeState.L },
                    { label: 'B', colors: cubeState.B },
                  ],
                }}
                className="bg-transparent border-none p-0"
              />
            </motion.div>
          )}
        </motion.div>

        {/* Timer Display - Scales up during solve */}
        <div className="flex flex-col items-center justify-center">
          {state === 'inspection' && (
            <InspectionDisplay timeLeft={inspectionTimeLeft} state={state} />
          )}
          <TimerDisplay state={state} timeMs={timeMs} data-onboarding="timer" />
        </div>
      </div>

      {/* Stats & Footer - Fades out during solve */}
      <motion.div
        className="w-full max-w-6xl mt-auto space-y-8 pt-12"
        animate={{ opacity: isFocusMode ? 0 : 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Stats Grid */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-lg font-bold text-text-muted flex items-center gap-2">
              <Timer className="w-5 h-5" />
              {t.navigation.stats}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowStatsInfo(true)}
              aria-label={t.stats.help}
              className="text-text-muted hover:text-text-primary"
            >
              <HelpCircle className="w-5 h-5" />
            </Button>
          </div>

          <div
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4"
            data-onboarding="stats"
          >
            {stats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={formatAverage(stat.value)} />
            ))}
          </div>
        </div>

        {/* Shortcuts Hint */}
        <div className="flex flex-wrap justify-center gap-4 py-4 border-t border-border/30">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono">
              space
            </kbd>
            <span>{t.shortcuts.space}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono">N</kbd>
            <span>{t.shortcuts.newScramble}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <kbd className="px-1.5 py-0.5 bg-surface border border-border rounded font-mono">P</kbd>
            <span>{t.shortcuts.togglePlus2}</span>
          </div>
        </div>
      </motion.div>

      <StatsInfoModal isOpen={showStatsInfo} onClose={() => setShowStatsInfo(false)} />
    </div>
  );
}
