import { forwardRef } from 'react';
import { cn } from '@/shared/lib';

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white shadow-[0_14px_32px_-20px_rgba(124,77,255,0.85)] hover:bg-primary-hover active:scale-[0.99]',
  secondary:
    'border border-border/75 bg-surface/88 text-text-primary shadow-[var(--klick-shadow-soft)] hover:border-border-strong/80 hover:bg-surface-hover/85',
  ghost: 'text-text-secondary hover:bg-surface-hover/65 hover:text-text-primary',
  danger:
    'bg-danger/90 text-white shadow-[0_12px_28px_-18px_rgba(248,113,113,0.8)] hover:bg-danger active:scale-[0.99]',
  success:
    'bg-success/90 text-white shadow-[0_12px_28px_-18px_rgba(52,211,153,0.8)] hover:bg-success active:scale-[0.99]',
  warning:
    'bg-warning/90 text-black shadow-[0_12px_28px_-18px_rgba(251,191,36,0.75)] hover:bg-warning active:scale-[0.99]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs sm:text-sm',
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
