import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, X, Home, History, TrendingUp, BookOpen, Settings, Dumbbell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Button } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/hooks/use-translation';

export function MobileNav() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { to: '/', icon: Home, label: t.navigation.home },
    { to: '/history', icon: History, label: t.navigation.history },
    { to: '/stats', icon: TrendingUp, label: t.navigation.stats },
    { to: '/training', icon: Dumbbell, label: t.navigation.training },
    { to: '/tutorial', icon: BookOpen, label: t.navigation.tutorial },
    { to: '/settings', icon: Settings, label: t.navigation.settings },
  ];

  const closeMenu = () => setIsOpen(false);

  return (
    <div className="md:hidden">
      {/* Menu Button */}
      <Button
        onClick={() => setIsOpen(true)}
        variant="ghost"
        size="icon"
        className="text-text-secondary hover:text-text-primary"
        aria-label="Menu"
      >
        <Menu className="w-6 h-6" />
      </Button>

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
                  className="absolute inset-y-0 right-0 w-80 max-w-[85vw] bg-background border-l border-border shadow-2xl"
                >
                  <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between p-4 border-b border-border bg-surface/30">
                      <h2 className="text-lg font-bold text-text-primary">{t.app.title}</h2>
                      <Button
                        onClick={closeMenu}
                        variant="ghost"
                        size="icon"
                        className="text-text-secondary hover:text-text-primary"
                        aria-label="Fechar menu"
                      >
                        <X className="w-4 h-4" />
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
                              `flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all ${
                                isActive
                                  ? 'bg-primary text-white shadow-md'
                                  : 'text-text-secondary hover:text-text-primary hover:bg-surface'
                              }`
                            }
                          >
                            <Icon className="w-6 h-6 shrink-0" />
                            <span>{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </nav>

                    <div className="p-4 border-t border-border bg-surface/30">
                      <p className="text-xs text-text-secondary text-center">{t.app.tagline}</p>
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
