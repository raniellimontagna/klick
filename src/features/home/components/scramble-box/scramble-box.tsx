import { Copy, RefreshCw, Check, HelpCircle } from 'lucide-react';
import {motion } from 'framer-motion';
import { Button } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/stores/i18n-store';
import { slideDown } from '@/shared/lib';
import { useScrambleBox } from './use-scramble-box';
import { ScrambleGuideModal } from '@/shared/components/scramble-guide-modal/scramble-guide-modal';
import { useScrambleGuideModal } from '@/shared/components/scramble-guide-modal/use-scramble-guide-modal';

const MotionButton = motion(Button);

interface ScrambleBoxProps {
  scramble: string;
  onNewScramble: () => void;
  'data-onboarding'?: string;
}

export function ScrambleBox({
  scramble,
  onNewScramble,
  'data-onboarding': dataOnboarding,
}: ScrambleBoxProps) {
  const { t } = useI18nStore();
  const { copied, copyToClipboard } = useScrambleBox(scramble);
  const { isOpen, openGuide, closeGuide } = useScrambleGuideModal();

  return (
    <>
      <motion.div
        className="w-full mx-auto px-4 sm:px-0 sm:max-w-4xl"
        variants={slideDown}
        initial="hidden"
        animate="visible"
        data-onboarding={dataOnboarding}
      >
        <div className="bg-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-gray-300">
                {t.scramble.title}
              </h2>
              <MotionButton
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={openGuide}
                variant="ghost"
                size="icon"
                className="text-gray-400 hover:text-blue-400 p-1 focus-visible:ring-blue-400 focus-visible:ring-offset-gray-800"
                title={t.scramble.guide}
              >
                <HelpCircle size={18} />
              </MotionButton>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <MotionButton
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={copyToClipboard}
                variant="secondary"
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 flex-1 sm:flex-none border-none"
                title={t.scramble.copy}
              >
                {copied ? (
                  <>
                    <Check size={16} className="text-green-500" />
                    <span className="hidden sm:inline">{t.scramble.copySuccess}</span>
                  </>
                ) : (
                  <>
                    <Copy size={16} />
                    <span className="hidden sm:inline">{t.scramble.copy}</span>
                  </>
                )}
              </MotionButton>
              <MotionButton
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onNewScramble}
                variant="primary"
                className="flex items-center justify-center gap-2 px-3 py-2 text-sm flex-1 sm:flex-none font-medium"
                title={`${t.scramble.new} (N)`}
              >
                <RefreshCw size={16} />
                <span className="hidden sm:inline">{t.scramble.new}</span>
              </MotionButton>
            </div>
          </div>

          <motion.div
            key={scramble}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="font-mono text-lg sm:text-2xl text-white wrap-break-word leading-relaxed text-center sm:text-left"
          >
            {scramble || t.scramble.generating}
          </motion.div>
        </div>
      </motion.div>

      <ScrambleGuideModal isOpen={isOpen} onClose={closeGuide} />
    </>
  );
}
