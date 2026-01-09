import { AnimatePresence, motion } from 'framer-motion';
import { Box, ChevronDown, Grid3X3, Layers, Pentagon, Triangle } from 'lucide-react';
import { type ElementType, useEffect, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { PuzzleType } from '@/shared/types';

const PUZZLES: { type: PuzzleType; label: string; icon: ElementType }[] = [
  { type: '3x3', label: '3x3x3', icon: Box },
  { type: '2x2', label: '2x2x2', icon: Grid3X3 },
  { type: '4x4', label: '4x4x4', icon: Grid3X3 },
  { type: '5x5', label: '5x5x5', icon: Grid3X3 },
  { type: 'pyraminx', label: 'Pyraminx', icon: Triangle },
  { type: 'megaminx', label: 'Megaminx', icon: Pentagon },
  { type: 'skewb', label: 'Skewb', icon: Layers },
  { type: 'square1', label: 'Square-1', icon: Box },
];

export function PuzzleSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeSession = useSessionsStore((state) => state.getActiveSession());
  const switchPuzzleType = useSessionsStore((state) => state.switchPuzzleType);

  const currentPuzzle = activeSession?.puzzleType || '3x3';
  const activePuzzleData = PUZZLES.find((p) => p.type === currentPuzzle) || PUZZLES[0];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className="relative z-50" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors rounded-lg hover:bg-surface-hover text-text-primary"
      >
        <activePuzzleData.icon className="w-5 h-5 text-primary" />
        <span>{activePuzzleData.label}</span>
        <ChevronDown
          className={cn('w-4 h-4 transition-transform duration-200', isOpen && 'rotate-180')}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="absolute left-0 z-50 w-48 mt-2 overflow-hidden border shadow-xl bg-surface border-border rounded-xl"
          >
            <div className="p-1">
              {PUZZLES.map((puzzle) => (
                <button
                  type="button"
                  key={puzzle.type}
                  onClick={() => {
                    switchPuzzleType(puzzle.type);
                    setIsOpen(false);
                  }}
                  className={cn(
                    'flex items-center w-full gap-3 px-3 py-2 text-sm transition-colors rounded-lg',
                    currentPuzzle === puzzle.type
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                  )}
                >
                  <puzzle.icon className="w-4 h-4" />
                  {puzzle.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
