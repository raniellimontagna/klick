import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ONBOARDING_STEPS } from '@/features/home/lib/onboarding/config';
import {
  type OnboardingStep,
  useOnboardingStore,
} from '@/features/home/lib/onboarding/onboarding-store';
import { Button } from '@/shared/components/ui';
import { useTranslation } from '@/shared/hooks/use-translation';

interface OnboardingTooltipProps {
  step: OnboardingStep;
}

const STEP_ORDER: OnboardingStep[] = [
  'welcome',
  'scramble',
  'timer',
  'stats',
  'shortcuts',
  'sessions',
  'complete',
];

type TooltipPosition = {
  top: number;
  left: number;
  right?: number;
  transform: string;
};

function shallowComparePosition(prev: TooltipPosition, next: TooltipPosition) {
  return (
    prev.top === next.top &&
    prev.left === next.left &&
    prev.right === next.right &&
    prev.transform === next.transform
  );
}

export function OnboardingTooltip({ step }: OnboardingTooltipProps) {
  const { t } = useTranslation();
  const { nextStep, previousStep, skipOnboarding } = useOnboardingStore();
  const [position, setPosition] = useState<TooltipPosition>({
    top: 0,
    left: 0,
    right: undefined,
    transform: 'translate(-50%, -50%)',
  });
  const tooltipRef = useRef<HTMLDivElement>(null);

  const stepConfig = ONBOARDING_STEPS[step];
  const currentIndex = STEP_ORDER.indexOf(step);
  const totalSteps = STEP_ORDER.length - 2; // Exclude welcome and complete
  const isFirst = step === 'welcome';
  const isLast = step === 'complete';

  useEffect(() => {
    const EDGE_PADDING = 16;

    const updatePosition = () => {
      const tooltipElement = tooltipRef.current;

      if (!tooltipElement) {
        return;
      }

      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportOffsetTop = viewport?.offsetTop ?? 0;
      const viewportOffsetLeft = viewport?.offsetLeft ?? 0;
      const isMobile = viewportWidth < 640;

      if (!stepConfig.targetSelector) {
        const nextPosition: TooltipPosition = {
          top: viewportOffsetTop + viewportHeight / 2,
          left: viewportOffsetLeft + viewportWidth / 2,
          right: undefined,
          transform: 'translate(-50%, -50%)',
        };

        setPosition((prev) => (shallowComparePosition(prev, nextPosition) ? prev : nextPosition));
        return;
      }

      const element = document.querySelector(stepConfig.targetSelector as string);

      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();

      if (isMobile) {
        const visibleTop = viewportOffsetTop + EDGE_PADDING;
        const visibleBottom = viewportOffsetTop + viewportHeight - EDGE_PADDING;

        if (rect.top < visibleTop || rect.bottom > visibleBottom) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          window.requestAnimationFrame(updatePosition);
          return;
        }
      }

      const tooltipRect = tooltipElement.getBoundingClientRect();
      const tooltipHeight =
        tooltipRect.height || (isMobile ? viewportHeight - EDGE_PADDING * 2 : 200);
      const tooltipWidth = tooltipRect.width || (isMobile ? viewportWidth - EDGE_PADDING * 2 : 400);

      let top = rect.bottom + EDGE_PADDING + viewportOffsetTop;
      let left = rect.left + rect.width / 2 + viewportOffsetLeft;
      let right: number | undefined;
      let transform: string = 'translateX(-50%)';

      if (isMobile) {
        const maxTop = viewportOffsetTop + viewportHeight - EDGE_PADDING - tooltipHeight;
        const minTop = viewportOffsetTop + EDGE_PADDING;

        top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));
        left = viewportOffsetLeft + EDGE_PADDING;
        right = viewportOffsetLeft + EDGE_PADDING;
        transform = 'none';
      } else {
        switch (stepConfig.position) {
          case 'bottom':
            top = rect.bottom + EDGE_PADDING + viewportOffsetTop;
            left = rect.left + rect.width / 2 + viewportOffsetLeft;
            break;
          case 'top':
            top = rect.top - tooltipHeight - EDGE_PADDING + viewportOffsetTop;
            left = rect.left + rect.width / 2 + viewportOffsetLeft;

            if (
              top < viewportOffsetTop + EDGE_PADDING &&
              rect.bottom + EDGE_PADDING + tooltipHeight < viewportOffsetTop + viewportHeight
            ) {
              top = rect.bottom + EDGE_PADDING + viewportOffsetTop;
            }
            break;
          case 'left':
            top = rect.top + rect.height / 2 + viewportOffsetTop;
            left = rect.left - tooltipWidth - EDGE_PADDING + viewportOffsetLeft;
            break;
          case 'right':
            top = rect.top + rect.height / 2 + viewportOffsetTop;
            left = rect.right + EDGE_PADDING + viewportOffsetLeft;
            break;
        }

        const maxTop = viewportOffsetTop + viewportHeight - EDGE_PADDING - tooltipHeight;
        const minTop = viewportOffsetTop + EDGE_PADDING;
        top = Math.min(Math.max(top, minTop), Math.max(minTop, maxTop));

        const minLeft = viewportOffsetLeft + EDGE_PADDING + tooltipWidth / 2;
        const maxLeft = viewportOffsetLeft + viewportWidth - EDGE_PADDING - tooltipWidth / 2;
        left = Math.min(Math.max(left, minLeft), Math.max(minLeft, maxLeft));
      }

      const nextPosition: TooltipPosition = { top, left, right, transform };
      setPosition((prev) => (shallowComparePosition(prev, nextPosition) ? prev : nextPosition));
    };

    updatePosition();
    window.requestAnimationFrame(updatePosition);

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
  }, [stepConfig]);

  const stepContent = t.onboarding[step];
  const showProgress = stepConfig.showProgress && !isFirst && !isLast;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="fixed z-10000 bg-gray-800 rounded-xl sm:rounded-2xl shadow-2xl border-2 border-primary p-4 sm:p-6 max-w-md"
      style={{
        top: position.top,
        left: position.left,
        right: position.right,
        transform: position.transform,
        maxWidth: position.right !== undefined ? undefined : 'min(400px, calc(100vw - 32px))',
      }}
      ref={tooltipRef}
    >
      {/* Close button */}
      {stepConfig.allowSkip && (
        <Button
          onClick={skipOnboarding}
          variant="ghost"
          size="icon"
          className="absolute top-3 right-3 sm:top-4 sm:right-4 text-gray-400 hover:text-white"
          aria-label={t.advancedStats.close}
        >
          <X size={18} className="sm:w-5 sm:h-5" />
        </Button>
      )}

      {/* Progress */}
      {showProgress && (
        <div className="text-xs sm:text-sm text-gray-400 mb-2 sm:mb-3">
          {t.onboarding.progress
            .replace('{current}', String(currentIndex))
            .replace('{total}', String(totalSteps))}
        </div>
      )}

      {/* Content */}
      <h3 className="text-lg sm:text-xl font-bold text-white mb-2 sm:mb-3 pr-6">
        {stepContent.title}
      </h3>
      <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6 leading-relaxed">
        {stepContent.description}
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        {!isFirst && (
          <Button
            onClick={previousStep}
            variant="secondary"
            size="sm"
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white border-none text-sm sm:text-base"
          >
            <ChevronLeft size={16} className="sm:w-[18px] sm:h-[18px]" />
            <span className="hidden sm:inline">{t.onboarding.previous}</span>
            <span className="sm:hidden">Ant.</span>
          </Button>
        )}

        <div className="flex-1" />

        {isLast ? (
          <Button
            onClick={nextStep}
            className="flex items-center gap-2 px-4 sm:px-6 py-2 text-sm sm:text-base"
          >
            {t.onboarding.finish}
          </Button>
        ) : (
          <Button
            onClick={nextStep}
            className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 text-sm sm:text-base"
          >
            <span className="hidden sm:inline">{t.onboarding.next}</span>
            <span className="sm:hidden">Próx.</span>
            <ChevronRight size={16} className="sm:w-[18px] sm:h-[18px]" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
