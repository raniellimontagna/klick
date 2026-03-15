import { DangerTriangle, Restart, Stop, UndoLeftRound } from '@solar-icons/react';
import { Button } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';

interface HomeControlsProps {
  onNewScramble: () => void;
  onTogglePlus2: () => void;
  onToggleDNF: () => void;
  onUndoLast: () => void;
}

const keycapClass =
  'inline-flex min-w-6 items-center justify-center rounded-md border border-border/75 bg-surface/80 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-primary';

export function HomeControls({
  onNewScramble,
  onTogglePlus2,
  onToggleDNF,
  onUndoLast,
}: HomeControlsProps) {
  const { t } = useI18nStore();

  return (
    <section
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      aria-label={t.homeRevamp.controls.sectionLabel}
    >
      <Button
        variant="secondary"
        className="h-12 justify-between border-border/75 bg-surface/72 px-4 text-text-primary"
        onClick={onNewScramble}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Restart size={18} />
          {t.scramble.new}
        </span>
        <span className={keycapClass}>N</span>
      </Button>

      <Button
        variant="secondary"
        className="h-12 justify-between border-border/75 bg-surface/72 px-4 text-text-primary"
        onClick={onTogglePlus2}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Stop size={18} />
          {t.homeRevamp.controls.plusTwo}
        </span>
        <span className={keycapClass}>P</span>
      </Button>

      <Button
        variant="secondary"
        className="h-12 justify-between border-border/75 bg-surface/72 px-4 text-text-primary"
        onClick={onToggleDNF}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Stop size={18} />
          {t.homeRevamp.controls.dnf}
        </span>
        <span className={keycapClass}>D</span>
      </Button>

      <Button
        variant="secondary"
        className="h-12 justify-between border-border/75 bg-surface/72 px-4 text-text-primary"
        onClick={onUndoLast}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <UndoLeftRound size={18} />
          {t.homeRevamp.controls.undo}
        </span>
        <span className={keycapClass}>U</span>
      </Button>

      <p className="col-span-full inline-flex items-center gap-2 text-xs text-text-muted">
        <DangerTriangle size={15} />
        {t.homeRevamp.controls.helper}
      </p>
    </section>
  );
}
