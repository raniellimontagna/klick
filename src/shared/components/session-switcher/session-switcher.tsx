import { FolderOpen, Settings } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button, HeaderDropdownButton, HeaderDropdownMenu } from '@/shared';
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  const activeSession = getActiveSession();

  const handleSessionSelect = (sessionId: string) => {
    setActiveSession(sessionId);
    setIsOpen(false);
  };

  const getSolveCountText = (count: number) => {
    return count === 1 ? t.sessions.solveCountSingular : t.sessions.solveCount;
  };

  return (
    <div className="relative" data-onboarding={dataOnboarding}>
      {/* Trigger Button */}
      <HeaderDropdownButton
        ref={triggerRef}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        icon={<FolderOpen size={16} className="sm:w-[18px] sm:h-[18px]" />}
        label={activeSession?.name || t.sessions.current}
        ariaLabel={t.sessions.title}
      />

      {/* Dropdown Menu */}
      <HeaderDropdownMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        align="right"
        anchorRef={triggerRef}
      >
        {/* Sessions List */}
        <div className="max-h-64 overflow-y-auto">
          {sessions.map((session) => (
            <Button
              key={session.id}
              onClick={() => handleSessionSelect(session.id)}
              variant="ghost"
              className={`w-full px-3 sm:px-4 py-2.5 sm:py-3 justify-start text-left hover:bg-white/10 border-b border-white/5 last:border-b-0 ${
                session.id === activeSessionId
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex-1 min-w-0">
                  <p className="text-xs sm:text-sm font-medium text-text-primary truncate">
                    {session.name}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {session.solves.length} {getSolveCountText(session.solves.length)}
                  </p>
                </div>
                {session.id === activeSessionId && (
                  <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                )}
              </div>
            </Button>
          ))}
        </div>

        {/* Manage Button */}
        <Button
          onClick={() => {
            setIsOpen(false);
            onManageClick();
          }}
          variant="ghost"
          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 flex items-center gap-2 justify-start text-text-secondary hover:bg-white/10 hover:text-text-primary border-t border-white/5"
        >
          <Settings size={16} className="text-primary shrink-0 w-4 h-4" />
          <span className="text-xs sm:text-sm font-medium text-text-primary">
            {t.sessions.manage}
          </span>
        </Button>
      </HeaderDropdownMenu>
    </div>
  );
}
