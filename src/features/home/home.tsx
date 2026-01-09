import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Keyboard, HelpCircle, Timer } from 'lucide-react';
import { PageHeader, Button } from '@/shared';
import { TimerDisplay } from './components/timer-display/timer-display';
import { ScrambleBox } from './components/scramble-box/scramble-box';
import { InspectionDisplay } from './components/inspection-display/inspection-display';
import { StatsInfoModal } from './components/home-page-components/stats-info-modal';
import { StatCard } from './components/home-page-components/stat-card';
import { useTimer } from './lib/use-timer';
import { generate3x3Scramble } from './lib/scramble/generate3x3';
import { useSessionsStore } from '@/shared/store/stores/sessions-store';
import { useSettingsStore } from '@/shared/store/stores/settings-store';
import { useI18nStore } from '@/shared/store/stores/i18n-store';
import { useOnboardingStore } from '@/shared/store/stores/onboarding-store';
import { slideUp, fadeIn, formatAverage } from '@/shared/lib';
import type { Penalty } from '@/commons/types';

export function Home() {
  const [scramble, setScramble] = useState('');
  const [inspectionOvertime, setInspectionOvertime] = useState(0);
  const [showStatsInfo, setShowStatsInfo] = useState(false);

  const { t } = useI18nStore();
  const { settings } = useSettingsStore();
  const { addSolve, updateSolvePenalty, getSingle, getAo5, getAo12, getBestAo5, getBestAo12 } =
    useSessionsStore();
  const hasCompletedOnboarding = useOnboardingStore((state) => state.hasCompletedOnboarding);
  const onboardingActive = useOnboardingStore((state) => state.isActive);
  const startOnboarding = useOnboardingStore((state) => state.startOnboarding);

  const { state, timeMs, inspectionTimeLeft, reset } = useTimer({
    inspectionDuration: settings.inspectionDuration,
    soundsEnabled: settings.soundsEnabled,
    onInspectionEnd: (overtime) => {
      setInspectionOvertime(overtime);
    },
  });

  const generateNewScramble = useCallback(() => {
    setScramble(generate3x3Scramble());
  }, []);

  // Gera scramble inicial
  useEffect(() => {
    generateNewScramble();
  }, [generateNewScramble]);
  useEffect(() => {
    if (!hasCompletedOnboarding && !onboardingActive) {
      startOnboarding();
    }
  }, [hasCompletedOnboarding, onboardingActive, startOnboarding]);

  // Salvar solve quando o timer parar
  useEffect(() => {
    if (state === 'stopped' && timeMs > 0 && scramble) {
      let penalty: Penalty = 'NONE';

      if (settings.autoInspectionPenalty) {
        const overtime = inspectionOvertime;
        if (overtime >= 2000) {
          penalty = 'DNF';
        } else if (overtime > 0) {
          penalty = '+2';
        }
      }

      addSolve({
        timeMs,
        penalty,
        scramble,
      });

      // Prepara próximo solve
      generateNewScramble();
      setInspectionOvertime(0);
      reset();
    }
  }, [
    state,
    timeMs,
    scramble,
    inspectionOvertime,
    settings.autoInspectionPenalty,
    addSolve,
    generateNewScramble,
    reset,
  ]);

  // Atalhos de teclado
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        generateNewScramble();
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        const session = useSessionsStore.getState().getActiveSession();
        const lastSolve = session?.solves.at(-1);
        if (lastSolve) {
          updateSolvePenalty(lastSolve.id, lastSolve.penalty === '+2' ? 'NONE' : '+2');
        }
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        const session = useSessionsStore.getState().getActiveSession();
        const lastSolve = session?.solves.at(-1);
        if (lastSolve) {
          updateSolvePenalty(lastSolve.id, lastSolve.penalty === 'DNF' ? 'NONE' : 'DNF');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [generateNewScramble, updateSolvePenalty]);

  // Stats
  const single = getSingle();
  const ao5 = getAo5();
  const ao12 = getAo12();
  const bestAo5 = getBestAo5();
  const bestAo12 = getBestAo12();

  const stats = [
    { label: t.stats.single, value: single },
    { label: t.stats.ao5, value: ao5 },
    { label: t.stats.ao12, value: ao12 },
    { label: t.stats.bestAo5, value: bestAo5 },
    { label: t.stats.bestAo12, value: bestAo12 },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 sm:space-y-8">
      <PageHeader
        title={t.navigation.home}
        description={t.pages.home.description}
        icon={<Timer className="w-8 h-8" />}
      />

      {/* Scramble */}
      <motion.div variants={slideUp} initial="hidden" animate="visible">
        <ScrambleBox
          scramble={scramble}
          onNewScramble={generateNewScramble}
          data-onboarding="scramble"
        />
      </motion.div>

      {/* Timer + Inspection */}
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="flex flex-col items-center gap-4"
      >
        {state === 'inspection' && (
          <InspectionDisplay timeLeft={inspectionTimeLeft} state={state} />
        )}
        <TimerDisplay state={state} timeMs={timeMs} data-onboarding="timer" />
      </motion.div>

      {/* Stats */}
      <motion.div variants={slideUp} initial="hidden" animate="visible">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-text-primary">{t.navigation.stats}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowStatsInfo(true)}
            aria-label={t.stats.help}
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
      </motion.div>

      {/* Shortcuts */}
      <motion.div variants={slideUp} initial="hidden" animate="visible">
        <div className="flex items-center gap-2 mb-3">
          <Keyboard className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-semibold text-text-primary">{t.shortcuts.title}</h3>
        </div>
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3"
          data-onboarding="shortcuts"
        >
          <div className="flex items-center gap-2 p-3 bg-surface rounded-lg border border-border">
            <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">
              {t.shortcuts.space}
            </kbd>
            <span className="text-xs text-text-secondary">{t.shortcuts.space}</span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-surface rounded-lg border border-border">
            <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">
              N
            </kbd>
            <span className="text-xs text-text-secondary">{t.shortcuts.newScramble}</span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-surface rounded-lg border border-border">
            <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">
              P
            </kbd>
            <span className="text-xs text-text-secondary">{t.shortcuts.togglePlus2}</span>
          </div>
          <div className="flex items-center gap-2 p-3 bg-surface rounded-lg border border-border">
            <kbd className="px-2 py-1 text-xs font-mono bg-background border border-border rounded">
              D
            </kbd>
            <span className="text-xs text-text-secondary">{t.shortcuts.toggleDNF}</span>
          </div>
        </div>
      </motion.div>

      {/* Modals */}
      <StatsInfoModal isOpen={showStatsInfo} onClose={() => setShowStatsInfo(false)} />
    </div>
  );
}
