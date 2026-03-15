import { FolderOpen, Settings } from '@solar-icons/react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useSessionsStore } from '@/shared/store/sessions-store';

interface SessionSwitcherProps {
  onManageClick: () => void;
  'data-onboarding'?: string;
  className?: string;
}

export function SessionSwitcher({
  onManageClick,
  'data-onboarding': dataOnboarding,
  className,
}: SessionSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { t } = useI18nStore();
  const { sessions, activeSessionId, setActiveSession, getActiveSession } = useSessionsStore();

  const activeSession = getActiveSession();

  const handleSessionSelect = (sessionId: string) => {
    setActiveSession(sessionId);
    setIsOpen(false);
  };

  const getSolveCountText = (count: number) => {
    return count === 1 ? t.sessions.solveCountSingular : t.sessions.solveCount;
  };

  return (
    <div data-onboarding={dataOnboarding} className={className}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <DropdownMenuTriggerButton
            icon={<FolderOpen size={18} />}
            label={activeSession?.name || t.sessions.current}
            isOpen={isOpen}
            aria-label={`${t.sessions.current}: ${activeSession?.name || t.sessions.current}`}
            title={activeSession?.name || t.sessions.current}
            className="w-full max-w-full max-[360px]:w-11 max-[360px]:justify-center max-[360px]:px-0"
            contentClassName="min-w-0 flex-1 max-[360px]:justify-center"
            labelClassName="max-[360px]:hidden"
            chevronClassName="max-[360px]:hidden"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(16rem,calc(100vw-1rem))]">
          <div className="max-h-64 overflow-y-auto">
            {sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => handleSessionSelect(session.id)}
                className={cn(
                  'flex items-center justify-between gap-2 py-3 mb-1 last:mb-0',
                  session.id === activeSessionId && 'bg-primary/14 text-text-primary',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-sm font-medium text-text-primary truncate"
                    title={session.name}
                  >
                    {session.name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {session.solves.length} {getSolveCountText(session.solves.length)}
                  </p>
                </div>
                {session.id === activeSessionId && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
              </DropdownMenuItem>
            ))}
          </div>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={() => {
              setIsOpen(false);
              onManageClick();
            }}
            className="gap-3"
          >
            <Settings size={16} className="text-primary shrink-0" />
            <span className="font-medium text-text-primary">{t.sessions.manage}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
