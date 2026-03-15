import { memo } from 'react';
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
  'inline-flex min-w-6 items-center justify-center rounded-lg border border-border/75 bg-surface/78 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-text-primary';

export const HomeControls = memo(function HomeControls({
  onNewScramble,
  onTogglePlus2,
  onToggleDNF,
  onUndoLast,
}: HomeControlsProps) {
  const { t } = useI18nStore();

  return (
    <section
      className="grid grid-cols-2 gap-2 xl:grid-cols-4"
      aria-label={t.homeRevamp.controls.sectionLabel}
    >
      <Button
        variant="primary"
        className="min-h-12 justify-between rounded-[1.35rem] px-4 text-left"
        onClick={onNewScramble}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Restart size={18} />
          {t.scramble.new}
        </span>
        <span className={keycapClass}>N</span>
      </Button>

      <Button
        variant="warning"
        className="min-h-12 justify-between rounded-[1.35rem] px-4 text-left"
        onClick={onTogglePlus2}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <Stop size={18} />
          {t.homeRevamp.controls.plusTwo}
        </span>
        <span className={keycapClass}>P</span>
      </Button>

      <Button
        variant="danger"
        className="min-h-12 justify-between rounded-[1.35rem] px-4 text-left"
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
        className="min-h-12 justify-between rounded-[1.35rem] px-4 text-left"
        onClick={onUndoLast}
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <UndoLeftRound size={18} />
          {t.homeRevamp.controls.undo}
        </span>
        <span className={keycapClass}>U</span>
      </Button>

      <p className="col-span-full hidden items-center gap-2 px-1 text-xs text-text-muted sm:inline-flex">
        <DangerTriangle size={15} />
        {t.homeRevamp.controls.helper}
      </p>
    </section>
  );
});
