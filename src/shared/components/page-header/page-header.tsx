import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export function PageHeader({ title, description, icon }: PageHeaderProps) {
  return (
    <header className="surface-panel relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--color-primary)_32%,white_10%),transparent)]" />
      <div className="flex items-start gap-4">
        <span className="surface-base inline-flex rounded-2xl border-primary/20 p-3 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            Klick
          </p>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-text-primary sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {description}
          </p>
        </div>
      </div>
    </header>
  );
}
