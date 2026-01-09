import { BookMinimalistic, Dumbbell, GraphUp, History, Home, Settings } from '@solar-icons/react';
import { NavLink } from 'react-router-dom';
import { useTranslation } from '@/shared/hooks/use-translation';

export function Navbar() {
  const { t } = useTranslation();

  const navItems = [
    { to: '/', icon: Home, label: t.navigation.home },
    { to: '/history', icon: History, label: t.navigation.history },
    { to: '/stats', icon: GraphUp, label: t.navigation.stats },
    { to: '/training', icon: Dumbbell, label: t.navigation.training },
    { to: '/tutorial', icon: BookMinimalistic, label: t.navigation.tutorial },
    { to: '/settings', icon: Settings, label: t.navigation.settings },
  ];

  return (
    <nav className="hidden md:flex items-center gap-1">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary text-fixed-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface'
            }`
          }
        >
          <Icon className="w-4 h-4" />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
