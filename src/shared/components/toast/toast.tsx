import { CheckCircle, CloseCircle, DangerCircle, InfoCircle } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/shared/components/ui';
import { cn, slideInRight } from '@/shared/lib';
import { useToast } from './use-toast';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const { isVisible, handleClose } = useToast(duration, onClose);

  const toneClassName: Record<ToastType, string> = {
    success: 'feedback-success text-success',
    error: 'feedback-danger text-danger',
    warning: 'feedback-warning text-warning',
    info: 'feedback-info text-info',
  };

  const getIcon = () => {
    const size = 18;
    switch (type) {
      case 'success':
        return <CheckCircle size={size} className="text-success shrink-0" weight="Bold" />;
      case 'error':
        return <CloseCircle size={size} className="text-danger shrink-0" weight="Bold" />;
      case 'warning':
        return <DangerCircle size={size} className="text-warning shrink-0" weight="Bold" />;
      default:
        return <InfoCircle size={size} className="text-info shrink-0" weight="Bold" />;
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          variants={slideInRight}
          initial="hidden"
          animate="visible"
          exit="exit"
          role={type === 'error' ? 'alert' : 'status'}
          aria-live={type === 'error' ? 'assertive' : 'polite'}
          className={cn(
            'surface-overlay fixed bottom-4 left-4 right-4 z-50 flex items-center gap-3 rounded-2xl px-4 py-3 sm:left-auto sm:max-w-md',
            toneClassName[type],
          )}
        >
          {getIcon()}
          <p className="flex-1 text-sm font-medium text-text-primary sm:text-base">{message}</p>
          <Button
            onClick={handleClose}
            variant="ghost"
            size="icon"
            className="ml-2 text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Fechar notificação"
          >
            <CloseCircle size={18} />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
