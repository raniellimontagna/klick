import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from '@/shared/hooks/use-translation';

interface MoveIndicatorProps {
  lastMove: string | null;
}

export function MoveIndicator({ lastMove }: MoveIndicatorProps) {
  const { t } = useTranslation();
  const copy = t.cubeViewer.indicator;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={lastMove ?? 'idle'}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2 }}
        className="surface-base rounded-[1.5rem] px-4 py-4"
      >
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.title}</p>
        <p className="mt-2 font-mono text-2xl font-bold text-primary">{lastMove ?? copy.empty}</p>
      </motion.div>
    </AnimatePresence>
  );
}
