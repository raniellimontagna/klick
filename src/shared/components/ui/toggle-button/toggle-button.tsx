import { motion } from 'framer-motion';
import { cn } from '@/shared/lib';

interface ToggleButtonProps {
  value: boolean;
  onValueChange: () => void;
  'aria-label': string;
  className?: string;
  disabled?: boolean;
}

export function ToggleButton({
  value,
  onValueChange,
  className,
  disabled = false,
  ...props
}: ToggleButtonProps) {
  return (
    <button
      onClick={onValueChange}
      disabled={disabled}
      role="switch"
      aria-checked={value}
      className={cn(
        'relative h-7 w-12 rounded-full border p-0 transition-[background-color,border-color,box-shadow] duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
        value
          ? 'border-primary/35 bg-primary shadow-[var(--klick-shadow-accent)]'
          : 'border-border/80 bg-surface-active/80',
        className,
      )}
      {...props}
    >
      <motion.span
        className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_8px_16px_-12px_rgba(15,23,42,0.7)]"
        initial={false}
        animate={{ x: value ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      />
    </button>
  );
}
