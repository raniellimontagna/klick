import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  eyebrow = 'Klick',
}: PageHeaderProps) {
  return (
    <header className="surface-panel relative overflow-hidden rounded-[1.75rem] px-4 py-4 sm:px-6 sm:py-5">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-primary)_30%,white_8%),transparent)]" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3 sm:gap-4">
          <span className="surface-base inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-primary sm:h-14 sm:w-14">
            {icon}
          </span>

          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-text-muted">
              {eyebrow}
            </p>
            <h1 className="mt-1 text-xl font-black tracking-tight text-text-primary sm:text-2xl">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-text-secondary">
              {description}
            </p>
          </div>
        </div>

        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </header>
  );
}
