import { PuzzleSelector } from '@/features/puzzle-selector';
import { LanguageSelector, MobileNav, SessionSwitcher } from '@/shared';

interface TopbarProps {
  onMobileMenuClick?: () => void;
  onManageClick: () => void;
}

export function Topbar({ onManageClick }: TopbarProps) {
  return (
    <header className="surface-shell sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-x-0 border-b border-t-0 border-border/70 px-4 sm:gap-3 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <PuzzleSelector className="max-w-[clamp(4.25rem,28vw,8.5rem)] sm:max-w-[clamp(5rem,22vw,9.5rem)]" />
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
        <SessionSwitcher
          onManageClick={onManageClick}
          data-onboarding="sessions"
          className="min-w-0 max-w-[clamp(7rem,42vw,15rem)] sm:max-w-[clamp(9.5rem,34vw,18rem)]"
        />
        <LanguageSelector />
        <div className="md:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
