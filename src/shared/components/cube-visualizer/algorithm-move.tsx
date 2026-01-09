import { AltArrowRight, UndoLeftRound, UndoRightRound } from '@solar-icons/react';
import { motion } from 'framer-motion';

interface AlgorithmMoveProps {
  move: string;
  description?: string;
  compact?: boolean;
}

export function AlgorithmMove({ move, description, compact = false }: AlgorithmMoveProps) {
  const isClockwise = !move.includes("'");
  const is180 = move.includes('2');

  if (compact) {
    return (
      <div className="flex items-center gap-1">
        <code className="text-xs font-mono font-bold text-primary">{move}</code>
        {is180 ? (
          <div className="flex">
            <UndoRightRound size={12} className="text-primary" />
            <UndoRightRound size={12} className="text-primary -ml-1.5" />
          </div>
        ) : isClockwise ? (
          <UndoRightRound size={12} className="text-primary" />
        ) : (
          <UndoLeftRound size={12} className="text-primary" />
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 p-2 bg-surface rounded-lg border border-border"
    >
      <div className="flex items-center gap-1">
        <code className="text-sm font-mono font-bold text-primary">{move}</code>
        {is180 ? (
          <div className="flex">
            <UndoRightRound size={16} className="text-primary" />
            <UndoRightRound size={16} className="text-primary -ml-2" />
          </div>
        ) : isClockwise ? (
          <UndoRightRound size={16} className="text-primary" />
        ) : (
          <UndoLeftRound size={16} className="text-primary" />
        )}
      </div>
      {description && (
        <>
          <AltArrowRight size={16} className="text-text-secondary" />
          <span className="text-xs text-text-secondary">{description}</span>
        </>
      )}
    </motion.div>
  );
}
