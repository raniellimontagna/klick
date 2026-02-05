import {
  BookMinimalistic,
  Box,
  ChartSquare,
  Dumbbell,
  History,
  Settings,
  Stopwatch,
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
    { href: '/training', label: t.navigation.training, icon: Dumbbell },
    { href: '/tutorial', label: t.navigation.tutorial, icon: BookMinimalistic },
    { href: '/cube-3d', label: t.navigation.cube3d, icon: Box },
    { href: '/settings', label: t.navigation.settings, icon: Settings },
  ];

  return (
    <aside className={cn('flex flex-col glass border-0 border-r border-white/5 z-20', className)}>
      <div className="flex h-16 items-center px-6 border-b border-white/5">
        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <Logo size="sm" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {links.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              to={link.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                isActive
                  ? 'bg-primary/10 text-primary shadow-sm'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
            >
              <link.icon
                className={cn(
                  'w-5 h-5 transition-colors',
                  isActive ? 'text-primary' : 'text-text-secondary group-hover:text-primary',
                )}
              />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/5">
        <div className="text-xs text-text-muted text-center">{t.app.tagline}</div>
      </div>
    </aside>
  );
}
