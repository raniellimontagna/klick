import {
  BookMinimalistic,
  CloseCircle,
  Widget,
} from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/shared/lib/utils';
import { useShellNavigation } from './use-shell-navigation';

type ActiveSheet = 'learn' | 'more' | null;

export function MobileNav() {
  const { pathname } = useLocation();
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const previousPathnameRef = useRef(pathname);
  const { primaryItems, sheetItems, learnItems, moreSections, sheetDescriptions } = useShellNavigation();

  useEffect(() => {
    if (activeSheet !== null && previousPathnameRef.current !== pathname) {
      setActiveSheet(null);
    }

    previousPathnameRef.current = pathname;
  }, [activeSheet, pathname]);

  const closeSheet = () => setActiveSheet(null);

  const sheetContent =
    activeSheet === 'learn'
      ? {
          description: sheetDescriptions.learn,
          icon: BookMinimalistic,
          sections: [
            {
              id: 'learn',
              label: sheetItems[0]?.label ?? 'Aprender',
              items: learnItems,
            },
          ],
          title: sheetItems[0]?.label ?? 'Aprender',
        }
      : activeSheet === 'more'
        ? {
            description: sheetDescriptions.more,
            icon: Widget,
            sections: moreSections,
            title: sheetItems[1]?.label ?? 'Mais',
          }
        : null;

  return (
    <>
      <nav className="app-shell-mobile-nav md:hidden" aria-label="Navegação principal">
        <div className="app-shell-mobile-nav-panel mx-auto flex w-full max-w-[32rem] items-stretch gap-1 rounded-[1.75rem] px-2 py-2 shadow-[var(--klick-shadow-2)]">
          {primaryItems.map((item) => (
            <NavLink
              key={item.id}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition-colors',
                  isActive
                    ? 'bg-primary/14 text-text-primary'
                    : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary',
                )
              }
            >
              <item.icon size={18} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}

          {sheetItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSheet((currentSheet) => (currentSheet === item.id ? null : item.id))}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2.5 text-[11px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
                item.isActive || activeSheet === item.id
                  ? 'bg-primary/14 text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary',
              )}
              aria-expanded={activeSheet === item.id}
              aria-haspopup="dialog"
            >
              <item.icon size={18} className="shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {sheetContent && (
              <div className="fixed inset-0 z-1100 md:hidden" role="dialog" aria-modal="true" aria-label={sheetContent.title}>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={closeSheet}
                  className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                />

                <motion.div
                  initial={{ opacity: 0, y: 32 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 32 }}
                  transition={{ duration: 0.2 }}
                  className="absolute inset-x-0 bottom-0 px-3 pb-[calc(env(safe-area-inset-bottom,0px)+0.75rem)]"
                >
                  <div className="surface-overlay max-h-[78vh] overflow-hidden rounded-[1.9rem] border border-border/70">
                    <div className="flex items-center justify-between border-b border-border/70 px-5 py-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                          <sheetContent.icon size={18} className="text-primary" />
                          <h2>{sheetContent.title}</h2>
                        </div>
                        <p className="mt-1 text-sm text-text-secondary">{sheetContent.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={closeSheet}
                        className="surface-interactive flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-text-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        aria-label="Fechar painel"
                      >
                        <CloseCircle size={18} />
                      </button>
                    </div>

                    <div className="max-h-[calc(78vh-5rem)] overflow-y-auto px-5 py-4">
                      <div className="space-y-5">
                        {sheetContent.sections.map((section) => (
                          <section key={section.id} className="space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
                              {section.label}
                            </p>

                            <div className="space-y-2">
                              {section.items.map((item) => (
                                <NavLink
                                  key={item.id}
                                  to={item.href}
                                  onClick={closeSheet}
                                  className={({ isActive }) =>
                                    cn(
                                      'flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors',
                                      isActive
                                        ? 'border-primary/30 bg-primary/12'
                                        : 'border-border/60 hover:bg-surface-hover/70',
                                    )
                                  }
                                >
                                  <span className="surface-base mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-primary">
                                    <item.icon size={18} />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-semibold text-text-primary">
                                      {item.label}
                                    </span>
                                    <span className="mt-1 block text-xs leading-relaxed text-text-secondary">
                                      {item.description}
                                    </span>
                                  </span>
                                </NavLink>
                              ))}
                            </div>
                          </section>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
