import { CheckCircle, XCircle, Info, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/shared/components/ui';
import { slideInRight } from '@/shared/lib';
import { useToast } from './useToast';

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
        return <CheckCircle size={size} className="text-green-500 shrink-0" />;
      case 'error':
        return <XCircle size={size} className="text-red-500 shrink-0" />;
      case 'warning':
        return <AlertCircle size={size} className="text-orange-500 shrink-0" />;
      default:
        return <Info size={size} className="text-blue-500 shrink-0" />;
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
            className="ml-2 text-gray-300 hover:text-white"
          >
            <X size={18} />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
