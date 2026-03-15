import { PuzzleSelector } from '@/features/puzzle-selector';
import { LanguageSelector, MobileNav, SessionSwitcher } from '@/shared';

interface TopbarProps {
  onMobileMenuClick?: () => void;
  onManageClick: () => void;
}

export function Topbar({ onManageClick }: TopbarProps) {
  return (
    <header className="surface-panel sticky top-0 z-20 flex h-16 items-center justify-between border-0 border-b border-border/70 bg-surface/78 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex items-center gap-4">
        <PuzzleSelector />
      </div>

      <div className="flex items-center gap-3">
        <SessionSwitcher onManageClick={onManageClick} data-onboarding="sessions" />
        <LanguageSelector />

        {/* Mobile Nav Logic usually handled here or in MainLayout, keeping existing MobileNav for now */}
        <div className="sm:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
