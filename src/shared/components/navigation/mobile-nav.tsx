import {
  BookMinimalistic,
  Box,
  CloseCircle,
  Dumbbell,
  GraphUp,
  HamburgerMenu,
  History,
  Home,
  Settings,
  User,
} from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink } from 'react-router-dom';
import { Button } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/use-translation';

export function MobileNav() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { to: '/', icon: Home, label: t.navigation.home },
    { to: '/history', icon: History, label: t.navigation.history },
    { to: '/stats', icon: GraphUp, label: t.navigation.stats },
    { to: '/leaderboard', icon: GraphUp, label: t.navigation.leaderboard },
    { to: '/training', icon: Dumbbell, label: t.navigation.training },
    { to: '/friends', icon: User, label: t.navigation.friends },
    { to: '/tutorial', icon: BookMinimalistic, label: t.navigation.tutorial },
    { to: '/cube-3d', icon: Box, label: t.navigation.cube3d },
    { to: '/settings', icon: Settings, label: t.navigation.settings },
  ];

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="md:hidden">
      {/* Menu Button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="glass-button flex h-11 w-11 items-center justify-center rounded-2xl border border-border/75 text-text-primary shadow-[var(--klick-shadow-soft)] transition-all hover:border-border-strong/80 hover:bg-surface-hover/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        aria-label="Menu"
      >
        <HamburgerMenu size={20} />
      </button>

      {/* Drawer */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isOpen && (
              <div className="fixed inset-0 z-1100">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeMenu}
                  className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />

                <motion.div
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={{ type: 'tween', duration: 0.3 }}
                  className="surface-panel absolute inset-y-0 right-0 w-80 max-w-[85vw] border-l border-border/70 bg-background-elevated shadow-2xl"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between border-b border-border/70 bg-surface/50 p-4">
                      <h2 className="text-lg font-bold text-text-primary">{t.app.title}</h2>
                      <Button
                        onClick={closeMenu}
                        variant="ghost"
                        size="icon"
                        className="text-text-secondary hover:text-text-primary"
                        aria-label="Fechar menu"
                      >
                        <CloseCircle size={16} />
                      </Button>
                    </div>

                    <nav className="flex-1 overflow-y-auto p-4">
                      <div className="space-y-2">
                        {navItems.map(({ to, icon: Icon, label }) => (
                          <NavLink
                            key={to}
                            to={to}
                            onClick={closeMenu}
                            className={({ isActive }) =>
                              `flex items-center gap-3 rounded-xl px-3 py-2.5 font-semibold transition-all ${
                                isActive
                                  ? 'glow-border bg-primary/18 text-primary'
                                  : 'text-text-secondary hover:bg-surface-hover/80 hover:text-text-primary'
                              }`
                            }
                          >
                            <Icon className="w-6 h-6 shrink-0" />
                            <span>{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </nav>

                    <div className="border-t border-border/70 bg-surface/50 p-4">
                      <p className="text-center text-xs text-text-secondary">{t.app.tagline}</p>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
