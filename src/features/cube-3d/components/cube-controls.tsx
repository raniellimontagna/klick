import { Restart, UndoLeftRound } from '@solar-icons/react';
import { Button } from '@/shared/components/ui/button';
import { useScrambleStore } from '@/shared/store/scramble-store';

interface CubeControlsProps {
  onReset: () => void;
  isAnimating: boolean;
}

export function CubeControls({ onReset, isAnimating }: CubeControlsProps) {
  const { generateNewScramble } = useScrambleStore();

  return (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => generateNewScramble()}
        disabled={isAnimating}
        className="gap-2"
      >
        <Restart size={16} />
        Scramble
      </Button>

      <Button variant="ghost" size="sm" onClick={onReset} disabled={isAnimating} className="gap-2">
        <UndoLeftRound size={16} />
        Reset
      </Button>
    </div>
  );
}
