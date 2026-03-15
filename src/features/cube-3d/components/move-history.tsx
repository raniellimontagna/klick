import { UndoLeft } from '@solar-icons/react';
import { useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { useTranslation } from '@/shared/hooks/use-translation';

interface MoveHistoryProps {
  history: { id: string; notation: string }[];
  onUndo: () => void;
  disabled?: boolean;
}

export function MoveHistory({ history, onUndo, disabled }: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const copy = t.cubeViewer.history;
  const actionCopy = t.cubeViewer.actions;

  useEffect(() => {
    if (!scrollRef.current || history.length <= 0) {
      return;
    }

    scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [history.length]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-muted">{copy.title}</p>
          <p className="mt-1 text-sm text-text-secondary">{copy.description}</p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="rounded-2xl"
          onClick={onUndo}
          disabled={disabled || history.length === 0}
          title={actionCopy.undo}
        >
          <UndoLeft size={16} />
          {actionCopy.undo}
        </Button>
      </div>

      {history.length > 0 ? (
        <div
          ref={scrollRef}
          className="surface-base flex gap-2 overflow-x-auto no-scrollbar rounded-[1.5rem] p-4"
          style={{ scrollBehavior: 'smooth' }}
        >
          {history.map((item) => (
            <span
              key={item.id}
              className="rounded-full border border-border/70 bg-surface-hover/40 px-3 py-1.5 font-mono text-sm font-semibold whitespace-nowrap text-text-primary"
            >
              {item.notation}
            </span>
          ))}
        </div>
      ) : (
        <div className="surface-base rounded-[1.5rem] px-4 py-5 text-sm text-text-secondary">
          {copy.empty}
        </div>
      )}
    </div>
  );
}
