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
import { useSessionsStore } from '@/shared/store/sessions-store';
import type { PuzzleType } from '@/shared/types';

const PUZZLES: { type: PuzzleType; label: string; icon: ComponentType<any> }[] = [
  { type: '3x3', label: '3x3x3', icon: Box },
  { type: '2x2', label: '2x2x2', icon: Widget },
  { type: '4x4', label: '4x4x4', icon: Widget },
  { type: '5x5', label: '5x5x5', icon: Widget },
  { type: 'pyraminx', label: 'Pyraminx', icon: Box },
  { type: 'megaminx', label: 'Megaminx', icon: Box },
  { type: 'skewb', label: 'Skewb', icon: Layers },
  { type: 'square1', label: 'Square-1', icon: Box },
];

export function PuzzleSelector() {
  const [isOpen, setIsOpen] = useState(false);

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
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuRadioGroup
          value={currentPuzzle}
          onValueChange={(v) => switchPuzzleType(v as PuzzleType)}
        >
          {PUZZLES.map((puzzle) => (
            <DropdownMenuRadioItem key={puzzle.type} value={puzzle.type} className="gap-3">
              <puzzle.icon className="w-4 h-4 shrink-0" />
              <span className="font-medium">{puzzle.label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
