import { forwardRef } from 'react';
import { cn } from '@/shared/lib';

const baseClasses =
  'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-60 disabled:cursor-not-allowed';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-fixed-white hover:bg-primary/90',
  secondary: 'bg-surface text-text-primary border border-border hover:bg-surface/80',
  ghost: 'text-text-secondary hover:text-text-primary hover:bg-surface',
  danger: 'bg-red-600 text-white hover:bg-red-500',
  success: 'bg-green-600 text-white hover:bg-green-500',
  warning: 'bg-warning text-black hover:bg-warning/90',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
  icon: 'p-2',
};

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', className, children, type, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={cn(baseClasses, variantClasses[variant], sizeClasses[size], className)}
      {...props}
    >
      {children}
    </button>
  );
});
