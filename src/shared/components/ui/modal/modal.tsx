import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
  backdropClassName?: string;
  containerClassName?: string;
}

const sizeClasses: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = 'md',
  ariaLabel,
  ariaDescribedBy,
  className = '',
  backdropClassName = 'bg-black/60 backdrop-blur-sm',
  containerClassName = 'p-4',
}: ModalProps): React.ReactElement | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div
          className="fixed inset-0 z-1200 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
        >
          {/* Backdrop */}
          <motion.div
            className={`absolute inset-0 ${backdropClassName}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          >
            <button
              type="button"
              className="absolute inset-0 w-full h-full cursor-default outline-none"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              aria-label={ariaLabel || 'Fechar modal'}
            />
          </motion.div>

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className={`relative w-full ${sizeClasses[size]} ${containerClassName} pointer-events-none`}
          >
            <div
              className={`glass border border-white/10 shadow-2xl rounded-2xl overflow-hidden pointer-events-auto ${className}`}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
};
