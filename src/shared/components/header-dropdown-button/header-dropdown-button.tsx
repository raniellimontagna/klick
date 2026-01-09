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
        className="flex items-center gap-1.5 sm:gap-2 px-2.5 py-2 sm:px-3 sm:py-2.5 md:px-4 md:py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg sm:rounded-xl min-w-0 text-white"
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
          <ChevronDown size={14} className="text-gray-400 sm:w-4 sm:h-4" />
        </motion.div>
      </Button>
    );
  },
);
