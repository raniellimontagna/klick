import { Play, Square, Timer } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TimerState } from '@/commons/types';
import { useI18nStore } from '@/shared/store/stores/i18nStore';
import { fadeIn, formatTime } from '@/shared/lib';

interface TimerDisplayProps {
  timeMs: number;
  state: TimerState;
  'data-onboarding'?: string;
}

export function TimerDisplay({
  timeMs,
  state,
  'data-onboarding': dataOnboarding,
}: TimerDisplayProps) {
  const { t } = useI18nStore();

  const getStateColor = () => {
    switch (state) {
      case 'idle':
        return 'text-gray-400';
      case 'inspection':
        return 'text-yellow-400';
      case 'running':
        return 'text-accent';
      case 'stopped':
        return 'text-white';
      default:
        return 'text-white';
    }
  };

  const getStateIcon = () => {
    switch (state) {
      case 'idle':
        return <Timer size={32} className="text-gray-400" />;
      case 'inspection':
        return <Timer size={32} className="text-yellow-400 animate-pulse" />;
      case 'running':
        return <Play size={32} className="text-accent" />;
      case 'stopped':
        return <Square size={32} className="text-white" />;
      default:
        return null;
    }
  };

  const getStateText = () => {
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
        {state !== 'running' && state !== 'stopped' && (
          <motion.div
            key={state}
            variants={fadeIn}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex items-center gap-3"
          >
            {getStateIcon()}
            <p className={`text-xl sm:text-2xl font-semibold ${getStateColor()}`}>
              {getStateText()}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        key={`${state}-${Math.floor(timeMs / 100)}`}
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        className={`text-5xl sm:text-6xl md:text-8xl font-bold tabular-nums ${getStateColor()}`}
      >
        {formatTime(timeMs)}
      </motion.div>

      {state === 'idle' && (
        <motion.p
          variants={fadeIn}
          initial="hidden"
          animate="visible"
          className="text-xs sm:text-sm text-gray-500 text-center max-w-xs"
        >
          {t.timer.holdSpace}
        </motion.p>
      )}
    </div>
  );
}
