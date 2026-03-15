import { Box, Layers, Widget } from '@solar-icons/react';
import type { ComponentType } from 'react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { PuzzleType } from '@/shared/types';

const PUZZLES: {
  type: PuzzleType;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  { type: '3x3', label: '3x3x3', icon: Box },
  { type: '2x2', label: '2x2x2', icon: Widget },
  { type: '4x4', label: '4x4x4', icon: Widget },
  { type: '5x5', label: '5x5x5', icon: Widget },
  { type: 'pyraminx', label: 'Pyraminx', icon: Box },
  { type: 'megaminx', label: 'Megaminx', icon: Box },
  { type: 'skewb', label: 'Skewb', icon: Layers },
  { type: 'square1', label: 'Square-1', icon: Box },
];

interface PuzzleSelectorProps {
  className?: string;
}

export function PuzzleSelector({ className }: PuzzleSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useI18nStore();

  const activeSession = useSessionsStore((state) => state.getActiveSession());
  const switchPuzzleType = useSessionsStore((state) => state.switchPuzzleType);

  const currentPuzzle = activeSession?.puzzleType || '3x3';
  const activePuzzleData = PUZZLES.find((p) => p.type === currentPuzzle) || PUZZLES[0];

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <DropdownMenuTriggerButton
          icon={<activePuzzleData.icon size={18} />}
          label={activePuzzleData.label}
          isOpen={isOpen}
          aria-label={`${t.sharePage.puzzleType}: ${activePuzzleData.label}`}
          title={`${t.sharePage.puzzleType}: ${activePuzzleData.label}`}
          className={cn(
            'w-full max-w-full max-[430px]:w-11 max-[430px]:justify-center max-[430px]:px-0',
            className,
          )}
          contentClassName="min-w-0 flex-1 max-[430px]:justify-center"
          labelClassName="max-[430px]:hidden"
          chevronClassName="max-[430px]:hidden"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[min(14rem,calc(100vw-1rem))]">
        <DropdownMenuRadioGroup
          value={currentPuzzle}
          onValueChange={(v) => switchPuzzleType(v as PuzzleType)}
        >
          {PUZZLES.map((puzzle) => (
            <DropdownMenuRadioItem
              key={puzzle.type}
              value={puzzle.type}
              className="gap-3"
              title={puzzle.label}
            >
              <puzzle.icon className="w-4 h-4 shrink-0" />
              <span className="min-w-0 truncate font-medium">{puzzle.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
