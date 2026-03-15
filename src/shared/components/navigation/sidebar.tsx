import { Link, useLocation } from 'react-router-dom';
import { Logo } from '@/shared';
import { useTranslation } from '@/shared/hooks/use-translation';
import { cn } from '@/shared/lib/utils';
import { useShellNavigation } from './use-shell-navigation';

export function Sidebar({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { sections } = useShellNavigation();

  return (
    <aside
      className={cn(
        'surface-shell app-shell-sidebar flex min-h-0 flex-col overflow-hidden border-0 border-r border-border/70',
        className,
      )}
    >
      <div className="flex min-h-[4.5rem] items-center border-b border-border/70 px-6 py-4">
        <Link to="/" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <Logo size="sm" />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-5">
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.id} className="space-y-2">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
                {section.label}
              </p>

              <div className="space-y-1">
                {section.items.map((item) => {
                  const isActive = item.isActive || pathname === item.href;

                  return (
                    <Link
                      key={item.id}
                      to={item.href}
                      className={cn(
                        'group relative flex items-center gap-3 overflow-hidden rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200',
                        isActive
                          ? 'bg-primary/12 text-text-primary shadow-[var(--klick-shadow-1)]'
                          : 'text-text-secondary hover:bg-surface-hover/70 hover:text-text-primary',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute inset-y-2 left-0 w-1 rounded-full bg-primary transition-opacity',
                          isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-60',
                        )}
                      />
                      <item.icon
                        className={cn(
                          'h-5 w-5 shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-text-secondary group-hover:text-primary',
                        )}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-current">{item.label}</p>
                        <p className="truncate text-xs font-medium text-text-muted">{item.description}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </nav>

      <div className="border-t border-border/70 p-4">
        <div className="text-center text-xs font-medium tracking-wide text-text-muted">
          {t.app.tagline}
        </div>
      </div>
    </aside>
  );
}
