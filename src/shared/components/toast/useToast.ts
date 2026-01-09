import { useEffect, useState, useCallback } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

export function useToast(duration: number, onClose?: () => void) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      onClose?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    onClose?.();
  }, [onClose]);

  const getIconName = useCallback((type: ToastType) => {
    return type;
  }, []);

  const getStyles = useCallback((type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-green-900/90 border-green-700';
      case 'error':
        return 'bg-red-900/90 border-red-700';
      case 'warning':
        return 'bg-orange-900/90 border-orange-700';
      default:
        return 'bg-blue-900/90 border-blue-700';
    }
  }, []);

  return {
    isVisible,
    handleClose,
    getIconName,
    getStyles,
  };
}
