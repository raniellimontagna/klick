import { UndoLeft, Restart, UndoLeftRound, Maximize } from '@solar-icons/react';
import { Button } from '@/shared/components/ui/button';
import { useScrambleStore } from '@/shared/store/scramble-store';
import { ThemeSelector } from './theme-selector';
import { motion } from 'framer-motion';

interface CubeActionBarProps {
  onUndo: () => void;
  onReset: () => void;
  onRealign: () => void;
  isAnimating: boolean;
  historyLength: number;
}

export function CubeActionBar({
  onUndo,
  onReset,
  onRealign,
  isAnimating,
  historyLength,
}: CubeActionBarProps) {
  const { generateNewScramble } = useScrambleStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center justify-center gap-2 px-4 py-3 bg-[#161B22]/80 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl"
    >
      {/* Action Group 1: Navigation/Correction */}
      <div className="flex items-center gap-1.5 pr-2 border-r border-white/5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={isAnimating || historyLength === 0}
          className="h-9 px-3 gap-2 hover:bg-white/5 text-white/70"
          title="Undo (Ctrl+Z)"
        >
          <UndoLeft size={18} />
          <span className="hidden md:inline">Undo</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRealign}
          className="h-9 px-3 gap-2 hover:bg-white/5 text-white/70"
          title="Realign Camera"
        >
          <Maximize size={18} />
          <span className="hidden md:inline">Realign</span>
        </Button>
      </div>

      {/* Action Group 2: Reset/Scramble */}
      <div className="flex items-center gap-1.5 px-2 border-r border-white/5">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => generateNewScramble()}
          disabled={isAnimating}
          className="h-9 px-4 gap-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
        >
          <Restart size={18} />
          <span>Scramble</span>
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={isAnimating}
          className="h-9 px-3 gap-2 hover:bg-white/5 text-white/60"
        >
          <UndoLeftRound size={18} />
          <span className="hidden md:inline">Reset</span>
        </Button>
      </div>

      {/* Action Group 3: Customization */}
      <div className="pl-2">
        <ThemeSelector />
      </div>
    </motion.div>
  );
}
