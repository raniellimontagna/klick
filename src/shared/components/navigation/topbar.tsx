import { PuzzleSelector } from '@/features/puzzle-selector';
import { LanguageSelector, MobileNav, SessionSwitcher } from '@/shared';

interface TopbarProps {
  onMobileMenuClick?: () => void;
  onManageClick: () => void;
}

export function Topbar({ onManageClick }: TopbarProps) {
  return (
    <header className="surface-panel sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-x-0 border-b border-t-0 border-border/70 bg-surface/78 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-4">
        <PuzzleSelector />
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <SessionSwitcher onManageClick={onManageClick} data-onboarding="sessions" />
        <LanguageSelector />
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
