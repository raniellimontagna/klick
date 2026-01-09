import { AlertTriangle, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TimerState } from '@/shared/types';
import { useI18nStore } from '@/shared/store/i18n-store';

interface InspectionDisplayProps {
  timeLeft: number;
  state: TimerState;
}

export function InspectionDisplay({ timeLeft, state }: InspectionDisplayProps) {
  const { t } = useI18nStore();

  if (state !== 'inspection') return null;

  const isWarning = timeLeft <= 3;
  const isDanger = timeLeft > 15 && timeLeft <= 17;
  const isCritical = timeLeft > 17;

  const getColor = () => {
    if (isCritical) return 'text-red-500';
    if (isDanger) return 'text-orange-500';
    if (isWarning) return 'text-yellow-500';
    return 'text-accent';
  };

  const getMessage = () => {
    if (isCritical) return t.penalties.dnf;
    if (isDanger) return t.inspection.penaltyPlus2;
    return '';
  };

  const getIcon = () => {
    const size = 32;
    const className = getColor();

    if (isCritical || isDanger) {
      return <AlertTriangle size={size} className={className} />;
    }
    return <Clock size={size} className={className} />;
  };

  return (
    <div className="flex flex-col items-center space-y-3 px-4">
      <motion.div
        className="flex items-center gap-3"
        animate={
          isCritical || isDanger
            ? {
              scale: [1, 1.05, 1],
              transition: { duration: 1, repeat: Infinity },
            }
            : {}
        }
      >
        {getIcon()}
        <motion.div
          key={Math.ceil(timeLeft)}
          initial={{ scale: 1.2, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`text-4xl sm:text-5xl md:text-6xl font-bold ${getColor()}`}
        >
          {Math.ceil(timeLeft)}s
        </motion.div>
      </motion.div>

      <AnimatePresence>
        {getMessage() && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 text-lg sm:text-2xl font-bold text-red-500"
          >
            <AlertTriangle size={20} className="sm:w-6 sm:h-6" />
            <span>{getMessage()}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
