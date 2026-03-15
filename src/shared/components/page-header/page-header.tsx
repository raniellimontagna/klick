import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export function PageHeader({ title, description, icon }: PageHeaderProps) {
  return (
    <header className="surface-panel relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="pointer-events-none absolute right-0 top-0 h-24 w-24 bg-[radial-gradient(circle,rgba(124,77,255,0.22),transparent_70%)]" />
      <div className="flex items-start gap-4">
        <span className="glow-border inline-flex rounded-2xl border border-primary/35 bg-primary/15 p-3 text-primary">
          {icon}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight text-text-primary sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
            {description}
          </p>
        </div>
      </div>
    </header>
  );
}
