import { AnimatePresence, motion } from 'framer-motion';
import { Play, Square, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn, fadeIn, formatTime } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import type { Penalty, TimerState } from '@/shared/types';

interface TimerDisplayProps {
  timeMs: number;
  state: TimerState;
  penalty?: Penalty;
  isNewBest?: boolean;
  isFocusMode?: boolean;
  'data-onboarding'?: string;
}

export function TimerDisplay({
  timeMs,
  state,
  penalty = 'NONE',
  isNewBest = false,
  isFocusMode = false,
  'data-onboarding': dataOnboarding,
}: TimerDisplayProps) {
  const { t } = useI18nStore();
  const [flash, setFlash] = useState<'success' | 'failure' | 'best' | null>(null);

  // Flash effect on stop
  useEffect(() => {
    if (state === 'stopped') {
      if (penalty === 'DNF') {
        setFlash('failure');
      } else if (isNewBest) {
        setFlash('best');
      } else {
        setFlash('success');
      }

      const timer = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timer);
    } else {
      setFlash(null);
    }
  }, [state, penalty, isNewBest]);

  const getStateColor = () => {
    if (flash === 'failure') return 'text-red-500';
    if (flash === 'best') return 'text-yellow-400';
    if (flash === 'success') return 'text-green-500';

    switch (state) {
      case 'idle':
        return 'text-text-muted';
      case 'inspection':
        return 'text-warning';
      case 'running':
        return 'text-accent';
      case 'stopped':
        return 'text-text-primary';
      default:
        return 'text-text-primary';
    }
  };

  const getStateIcon = () => {
    if (flash === 'best') return <Timer size={32} className="text-yellow-400 animate-bounce" />;

    switch (state) {
      case 'idle':
        return <Timer size={32} className="text-text-muted" />;
      case 'inspection':
        return <Timer size={32} className="text-warning animate-pulse" />;
      case 'running':
        return <Play size={32} className="text-accent" />;
      case 'stopped':
        return <Square size={32} className="text-text-primary" />;
      default:
        return null;
    }
  };

  const getStateText = () => {
    if (flash === 'best') return 'New Best!';

    switch (state) {
      case 'idle':
        return t.timer.ready;
      case 'inspection':
        return t.timer.inspection;
      case 'running':
        return t.timer.running;
      case 'stopped':
        return t.timer.stopped;
      default:
        return '';
    }
  };

  return (
    <div
      className="flex flex-col items-center justify-center space-y-4 px-4"
      data-onboarding={dataOnboarding}
    >
      <AnimatePresence mode="wait">
        {state !== 'running' && state !== 'stopped' && !flash && (
          <motion.div
            key={state}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-center gap-3"
          >
            {getStateIcon()}
            <p
              className={`text-xl sm:text-2xl font-bold uppercase tracking-[0.2em] ${getStateColor()}`}
            >
              {getStateText()}
            </p>
          </motion.div>
        )}
        {flash && (
          <motion.div
            key="flash"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3"
          >
            {getStateIcon()}
            <p
              className={`text-xl sm:text-2xl font-bold uppercase tracking-[0.2em] ${getStateColor()}`}
            >
              {getStateText()}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        key={`${state}-${Math.floor(timeMs / 100)}`}
        layout
        initial={{ scale: 0.9 }}
        animate={{ scale: state === 'running' ? 1.2 : 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        className={cn(
          'font-mono font-black tabular-nums transition-colors duration-200',
          isFocusMode
            ? 'text-7xl sm:text-8xl md:text-9xl tracking-tighter'
            : 'text-5xl sm:text-6xl md:text-8xl tracking-tight',
          getStateColor(),
        )}
      >
        {formatTime(timeMs)}
      </motion.div>

      {state === 'idle' && (
        <motion.p
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="text-xs sm:text-sm text-text-muted text-center max-w-xs font-medium uppercase tracking-widest opacity-60"
        >
          {t.timer.holdSpace}
        </motion.p>
      )}
    </div>
  );
}
