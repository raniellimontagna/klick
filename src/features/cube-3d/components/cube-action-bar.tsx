import { Maximize, Restart, Soundwave, SoundwaveSquare, UndoLeft, UndoLeftRound } from '@solar-icons/react';
import { Button } from '@/shared/components/ui/button';
import { useTranslation } from '@/shared/hooks/use-translation';
import { ThemeSelector } from './theme-selector';

interface CubeActionBarProps {
  onGenerateScramble: () => void;
  onUndo: () => void;
  onReset: () => void;
  onRealign: () => void;
  onToggleSound: () => void;
  soundEnabled: boolean;
  isAnimating: boolean;
  historyLength: number;
}

export function CubeActionBar({
  onGenerateScramble,
  onUndo,
  onReset,
  onRealign,
  onToggleSound,
  soundEnabled,
  isAnimating,
  historyLength,
}: CubeActionBarProps) {
  const { t } = useTranslation();
  const copy = t.cubeViewer.actions;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.title}</p>
        <p className="mt-1 text-sm text-text-secondary">{copy.description}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onGenerateScramble}
          disabled={isAnimating}
          className="justify-center rounded-2xl"
        >
          <Restart size={18} />
          {copy.scramble}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={onUndo}
          disabled={isAnimating || historyLength === 0}
          className="justify-center rounded-2xl"
          title={copy.undo}
        >
          <UndoLeft size={18} />
          {copy.undo}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onRealign}
          className="justify-center rounded-2xl"
          title={copy.realign}
        >
          <Maximize size={18} />
          {copy.realign}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={isAnimating}
          className="justify-center rounded-2xl"
          title={copy.reset}
        >
          <UndoLeftRound size={18} />
          {copy.reset}
        </Button>

        <Button
          variant={soundEnabled ? 'secondary' : 'ghost'}
          size="sm"
          onClick={onToggleSound}
          className="justify-center rounded-2xl"
          title={soundEnabled ? copy.soundOn : copy.soundOff}
        >
          {soundEnabled ? <Soundwave size={18} /> : <SoundwaveSquare size={18} />}
          {soundEnabled ? copy.soundOn : copy.soundOff}
        </Button>

        <ThemeSelector />
      </div>
    </div>
  );
}
