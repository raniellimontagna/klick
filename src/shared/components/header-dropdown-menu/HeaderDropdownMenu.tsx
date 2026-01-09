import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { slideDown } from '@/shared/lib';

interface HeaderDropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  align?: 'left' | 'right';
  anchorRef?: RefObject<HTMLElement | null>;
}

export function HeaderDropdownMenu({
  isOpen,
  onClose,
  children,
  width = 'sm:w-64 sm:max-w-sm',
  align = 'left',
  anchorRef,
}: HeaderDropdownMenuProps) {
  const EDGE_PADDING = 16;

  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileStyles, setMobileStyles] = useState({
    top: 0,
    left: EDGE_PADDING,
    right: EDGE_PADDING,
    maxHeight: 0,
  });
  const [desktopStyles, setDesktopStyles] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const updatePosition = () => {
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
      const isMobile = viewportWidth < 640;

      setIsMobileViewport(isMobile);

      const anchorRect = anchorRef?.current?.getBoundingClientRect();
      if (!anchorRect) {
        return;
      }

      if (isMobile) {
        const top = anchorRect.bottom + viewportOffsetTop + EDGE_PADDING;
        const left = viewportOffsetLeft + EDGE_PADDING;
        const right = viewportOffsetLeft + EDGE_PADDING;
        const availableHeight = viewportHeight - (anchorRect.bottom + EDGE_PADDING * 2);

        setMobileStyles({
          top,
          left,
          right,
          maxHeight: Math.max(200, availableHeight),
        });
      } else {
        setDesktopStyles({
          top: anchorRect.bottom + EDGE_PADDING,
          left: align === 'right' ? anchorRect.right : anchorRect.left,
        });
      }
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updatePosition);
    viewport?.addEventListener('scroll', updatePosition);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      viewport?.removeEventListener('resize', updatePosition);
      viewport?.removeEventListener('scroll', updatePosition);
    };
  }, [isOpen, anchorRef, align]);

  const menuPositionClass = isMobileViewport ? 'fixed inset-x-4 sm:inset-auto sm:static' : 'fixed';

  const widthClass = isMobileViewport ? 'w-auto max-w-full' : width;

  const mobileStyle = isMobileViewport
    ? {
      top: mobileStyles.top,
      left: mobileStyles.left,
      right: mobileStyles.right,
      maxHeight: mobileStyles.maxHeight > 0 ? `${mobileStyles.maxHeight}px` : undefined,
    }
    : undefined;

  const desktopStyle = useMemo(() => {
    if (isMobileViewport) {
      return undefined;
    }

    const transform = align === 'right' ? 'translateX(-100%)' : undefined;
    return {
      top: desktopStyles.top,
      left: desktopStyles.left,
      transform,
    } as CSSProperties;
  }, [desktopStyles, isMobileViewport, align]);

  if (typeof document === 'undefined') {
    return null;
  }

  const content = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <button
            type="button"
            onClick={onClose}
            className="fixed inset-0 z-999 cursor-default bg-black/20 backdrop-blur-xs focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
            }}
            aria-label="Close menu"
            tabIndex={-1}
          />

          {/* Menu */}
          <motion.div
            variants={slideDown}
            initial="hidden"
            animate="visible"
            exit="hidden"
            className={`${menuPositionClass} ${widthClass} bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-1000 overflow-hidden`}
            style={mobileStyle ?? desktopStyle}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(content, document.body);
}
