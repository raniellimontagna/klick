import { PuzzleSelector } from '@/features/puzzle-selector';
import { Link } from 'react-router-dom';
import { LanguageSelector, Logo, SessionSwitcher } from '@/shared';
import { useShellNavigation } from './use-shell-navigation';

interface TopbarProps {
  onManageClick: () => void;
}

export function Topbar({ onManageClick }: TopbarProps) {
  const { activeRoute, activeSection } = useShellNavigation();

  return (
    <header className="app-shell-topbar surface-shell sticky top-0 z-30 shrink-0 border-x-0 border-b border-t-0 border-border/70">
      <div className="flex min-h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Link to="/" className="md:hidden">
            <Logo size="sm" />
          </Link>

          <div className="hidden min-w-0 md:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-muted">
              {activeSection.label}
            </p>
            <p className="truncate text-sm font-semibold text-text-primary">{activeRoute.label}</p>
          </div>
        </div>

        <PuzzleSelector className="max-w-[clamp(4.25rem,28vw,8.5rem)] sm:max-w-[clamp(5rem,22vw,9.5rem)]" />

        <SessionSwitcher
          onManageClick={onManageClick}
          data-onboarding="sessions"
          className="min-w-0 max-w-[clamp(7rem,42vw,15rem)] sm:max-w-[clamp(9.5rem,34vw,18rem)]"
        />
        <LanguageSelector />
      </div>
    </header>
  );
}
