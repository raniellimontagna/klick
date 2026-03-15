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
        'relative w-12 h-6 rounded-full transition-colors p-0 justify-start focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        value ? 'bg-primary' : 'bg-border',
        className,
      )}
      {...props}
    >
      <motion.span
        className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full"
        initial={false}
        animate={{ x: value ? 24 : 0 }}
        transition={{ type: 'spring', stiffness: 700, damping: 30 }}
      />
    </button>
  );
}
