import { AltArrowDown } from '@solar-icons/react';
import { motion } from 'framer-motion';
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
        className="glass-button h-10 min-w-0 rounded-xl border border-border/75 px-3 text-text-primary transition-all hover:border-border-strong/80 hover:bg-surface-hover/75 sm:gap-2 sm:px-4"
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
          <AltArrowDown size={14} className="text-text-muted sm:w-4 sm:h-4" />
        </motion.div>
      </Button>
    );
  },
);
