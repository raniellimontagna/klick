import { CheckCircle, CloseCircle, DangerCircle, InfoCircle } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/shared/components/ui';
import { slideInRight } from '@/shared/lib';
import { useToast } from './use-toast';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
  message: string;
  type?: ToastType;
  duration?: number;
  onClose?: () => void;
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const { isVisible, handleClose, getStyles } = useToast(duration, onClose);

  const getIcon = () => {
    const size = 18;
    switch (type) {
      case 'success':
        return <CheckCircle size={size} className="text-green-500 shrink-0" weight="Bold" />;
      case 'error':
        return <CloseCircle size={size} className="text-red-500 shrink-0" weight="Bold" />;
      case 'warning':
        return <DangerCircle size={size} className="text-orange-500 shrink-0" weight="Bold" />;
      default:
        return <InfoCircle size={size} className="text-blue-500 shrink-0" weight="Bold" />;
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
          className={`fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md flex items-center gap-3 px-4 py-3 rounded-lg border ${getStyles(type)} shadow-lg backdrop-blur-sm z-50`}
        >
          {getIcon()}
          <p className="text-white font-medium text-sm sm:text-base flex-1">{message}</p>
          <Button
            onClick={handleClose}
            variant="ghost"
            size="icon"
            className="ml-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            <CloseCircle size={18} />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
