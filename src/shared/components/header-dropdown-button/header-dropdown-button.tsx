import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { forwardRef, type ReactNode } from 'react';
import { Button } from '@/shared';

interface HeaderDropdownButtonProps {
  isOpen: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: ReactNode;
  truncateLabel?: boolean;
  maxWidth?: string;
  ariaLabel?: string;
}

export const HeaderDropdownButton = forwardRef<HTMLButtonElement, HeaderDropdownButtonProps>(
  function HeaderDropdownButton(
    {
      isOpen,
      onClick,
      icon,
      label,
      truncateLabel = true,
      maxWidth = 'max-w-20 sm:max-w-[120px] md:max-w-[180px]',
      ariaLabel,
    },
    ref,
  ) {
    return (
      <Button
        ref={ref}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        variant="secondary"
        size="sm"
        className="h-10 flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 glass-button border border-white/10 hover:border-white/20 hover:bg-white/10 rounded-xl min-w-0 text-text-primary transition-all"
      >
        <span className="shrink-0 text-primary">{icon}</span>
        <span
          className={`text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 ${
            truncateLabel ? `truncate ${maxWidth} min-w-0` : ''
          }`}
        >
          {label}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown size={14} className="text-text-muted sm:w-4 sm:h-4" />
        </motion.div>
      </Button>
    );
  },
);
