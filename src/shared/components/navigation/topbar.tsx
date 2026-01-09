import { PuzzleSelector } from '@/features/puzzle-selector';
import { LanguageSelector, MobileNav, SessionSwitcher } from '@/shared';

interface TopbarProps {
  onMobileMenuClick?: () => void;
  onManageClick: () => void;
}

export function Topbar({ onManageClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-4">
        <PuzzleSelector />
      </div>

      <div className="flex items-center gap-3">
        <SessionSwitcher onManageClick={onManageClick} />
        <LanguageSelector />

        {/* Mobile Nav Logic usually handled here or in MainLayout, keeping existing MobileNav for now */}
        <div className="sm:hidden">
          <MobileNav />
        </div>
      </div>
    </header>
  );
}
