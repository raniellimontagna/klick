import { forwardRef } from 'react';
import { cn } from '@/shared/lib';

const baseClasses =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border font-semibold transition-[background-color,border-color,color,box-shadow,transform] duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'border-primary/80 bg-primary text-white shadow-[var(--klick-shadow-accent)] hover:border-primary hover:bg-primary-hover active:translate-y-px',
  secondary: 'surface-interactive text-text-primary',
  ghost:
    'border-transparent bg-transparent text-text-secondary shadow-none hover:bg-surface-hover/60 hover:text-text-primary',
  danger: 'feedback-danger border-danger/35 text-danger shadow-none hover:border-danger/55',
  success: 'feedback-success border-success/35 text-success shadow-none hover:border-success/55',
  warning: 'feedback-warning border-warning/35 text-warning shadow-none hover:border-warning/55',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 text-sm',
  md: 'px-4 text-sm',
  lg: 'min-h-12 px-5 text-base',
  icon: 'h-11 w-11 p-0',
};

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
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
