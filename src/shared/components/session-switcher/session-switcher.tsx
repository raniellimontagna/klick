import { FolderOpen, Settings } from 'lucide-react';
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
}

export function SessionSwitcher({
  onManageClick,
  'data-onboarding': dataOnboarding,
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
    <div data-onboarding={dataOnboarding}>
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <DropdownMenuTriggerButton
            icon={<FolderOpen size={18} />}
            label={activeSession?.name || t.sessions.current}
            isOpen={isOpen}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {/* Sessions List */}
          <div className="max-h-64 overflow-y-auto">
            {sessions.map((session) => (
              <DropdownMenuItem
                key={session.id}
                onClick={() => handleSessionSelect(session.id)}
                className={cn(
                  'flex items-center justify-between gap-2 py-3',
                  session.id === activeSessionId && 'bg-white/10 text-text-primary',
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{session.name}</p>
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

          {/* Manage Button */}
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
