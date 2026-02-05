import { AnimatePresence, motion } from 'framer-motion';

interface MoveIndicatorProps {
  lastMove: string | null;
}

export function MoveIndicator({ lastMove }: MoveIndicatorProps) {
  return (
    <AnimatePresence>
      {lastMove && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="absolute top-4 right-4 z-10"
        >
          <div className="bg-primary/20 backdrop-blur-md border border-primary/30 rounded-lg px-4 py-2">
            <p className="text-xs text-text-muted uppercase tracking-wider mb-1">Last Move</p>
            <p className="text-2xl font-mono font-bold text-primary">{lastMove}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
