import { UndoLeft } from '@solar-icons/react';
import { useEffect, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';

interface MoveHistoryProps {
  history: { id: string; notation: string }[];
  onUndo: () => void;
  disabled?: boolean;
}

export function MoveHistory({ history, onUndo, disabled }: MoveHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to end when history changes
  useEffect(() => {
    // Only scroll if history length has changed
    const _len = history.length;
    if (scrollRef.current && _len > 0) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [history.length]);

  if (history.length === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-surface/80 backdrop-blur-md p-2 rounded-xl border border-white/5 shadow-lg max-w-[90vw] md:max-w-md">
      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 h-8 w-8 hover:bg-white/10"
        onClick={onUndo}
        disabled={disabled || history.length === 0}
        title="Undo (Ctrl+Z)"
      >
        <UndoLeft size={16} />
      </Button>

      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto no-scrollbar mask-gradient-x p-1"
        style={{ scrollBehavior: 'smooth' }}
      >
        {history.map((item) => (
          <span
            key={item.id}
            className="font-mono text-sm font-bold text-white/80 bg-white/5 px-2 py-0.5 rounded border border-white/5 whitespace-nowrap"
          >
            {item.notation}
          </span>
        ))}
        {/* Spacer for better scrolling */}
        <div className="w-1 shrink-0" />
      </div>
    </div>
  );
}
