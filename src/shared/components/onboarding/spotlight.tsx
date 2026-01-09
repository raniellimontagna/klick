import { motion, AnimatePresence } from 'framer-motion';
import { useEffect, useState } from 'react';

interface SpotlightProps {
  targetSelector?: string;
  isActive: boolean;
}

export function Spotlight({ targetSelector, isActive }: SpotlightProps) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!targetSelector || !isActive) {
      setTargetRect(null);
      return;
    }

    const updateTargetRect = () => {
      const element = document.querySelector(targetSelector);
      if (element) {
        const rect = element.getBoundingClientRect();
        setTargetRect(rect);
      } else {
        // Element not found, retry after a short delay
        setTimeout(() => {
          const retryElement = document.querySelector(targetSelector);
          if (retryElement) {
            setTargetRect(retryElement.getBoundingClientRect());
          }
        }, 100);
      }
    };

    // Initial delay to ensure DOM is ready
    const timeoutId = setTimeout(updateTargetRect, 50);

    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect);
    };
  }, [targetSelector, isActive]);

  if (!isActive) {
    return null;
  }

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const padding = isMobile ? 4 : 8;
  const gradientSpread = isMobile ? 60 : 100;

  return (
    <AnimatePresence>
      <motion.div
        key="spotlight-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-9998 pointer-events-none"
        style={{
          background: targetRect
            ? `
              radial-gradient(
                circle at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px,
                transparent ${Math.max(targetRect.width, targetRect.height) / 2 + padding}px,
                rgba(0, 0, 0, 0.7) ${Math.max(targetRect.width, targetRect.height) / 2 + padding + gradientSpread}px
              )
            `
            : 'rgba(0, 0, 0, 0.7)',
        }}
      />
      {targetRect && (
        <motion.div
          key="spotlight-border"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="fixed z-9999 pointer-events-none rounded-lg sm:rounded-xl"
          style={{
            left: targetRect.left - padding,
            top: targetRect.top - padding,
            width: targetRect.width + padding * 2,
            height: targetRect.height + padding * 2,
            border: isMobile ? '1.5px solid #7C4DFF' : '2px solid #7C4DFF',
            boxShadow: isMobile
              ? '0 0 0 2px rgba(124, 77, 255, 0.2), 0 0 12px rgba(124, 77, 255, 0.4)'
              : '0 0 0 4px rgba(124, 77, 255, 0.2), 0 0 20px rgba(124, 77, 255, 0.4)',
          }}
        />
      )}
    </AnimatePresence>
  );
}
