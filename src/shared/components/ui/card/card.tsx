import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@/shared/lib';

const variantClasses = {
  surface: 'bg-surface border border-border',
  background: 'bg-background border border-border',
  overlay: 'bg-black/60 backdrop-blur-md border border-white/10',
};

const paddingClasses = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

type CardVariant = keyof typeof variantClasses;
type CardPadding = keyof typeof paddingClasses;

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = 'surface', padding = 'md', className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('rounded-xl', variantClasses[variant], paddingClasses[padding], className)}
      {...props}
    >
      {children}
    </div>
  );
});
