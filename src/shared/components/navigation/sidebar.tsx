import {
  BookMinimalistic,
  Box,
  ChartSquare,
  Dumbbell,
  History,
  Settings,
  Stopwatch,
  User,
} from '@solar-icons/react';
import { Link, useLocation } from 'react-router-dom';
import { Logo } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn } from '@/shared/lib/utils';

export function Sidebar({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const links = [
    { href: '/', label: t.navigation.home, icon: Stopwatch },
    { href: '/history', label: t.navigation.history, icon: History },
    { href: '/stats', label: t.navigation.stats, icon: ChartSquare },
    { href: '/leaderboard', label: t.navigation.leaderboard, icon: ChartSquare },
    { href: '/training', label: t.navigation.training, icon: Dumbbell },
    { href: '/friends', label: t.navigation.friends, icon: User },
    { href: '/tutorial', label: t.navigation.tutorial, icon: BookMinimalistic },
    { href: '/cube-3d', label: t.navigation.cube3d, icon: Box },
    { href: '/settings', label: t.navigation.settings, icon: Settings },
  ];

  return (
    <aside
      className={cn(
        'surface-shell flex min-h-0 flex-col overflow-hidden border-0 border-r border-border/70',
        className,
      )}
    >
      <div className="flex h-16 items-center border-b border-border/70 px-6">
        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <Logo size="sm" />
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200',
                isActive
                  ? 'border border-primary/25 bg-primary/12 text-text-primary shadow-[var(--klick-shadow-1)]'
                  : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary',
              )}
            >
              <link.icon
                className={cn(
                  'h-5 w-5 transition-colors',
                  isActive ? 'text-primary' : 'text-text-secondary group-hover:text-primary',
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/70 p-4">
        <div className="text-center text-xs font-medium tracking-wide text-text-muted">
          {t.app.tagline}
        </div>
      </div>
    </aside>
  );
}
