import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  icon: ReactNode;
}

export function PageHeader({ title, description, icon }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:gap-3 mb-6 sm:mb-8">
      <div className="flex items-center gap-3">
        <span className="text-primary">{icon}</span>
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary">{title}</h1>
      </div>
      <p className="text-sm sm:text-base text-text-secondary max-w-3xl">{description}</p>
    </div>
  );
}
