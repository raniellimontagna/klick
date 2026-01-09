import { AnimatePresence, motion } from 'framer-motion';
import { Box, Check, Copy, HelpCircle, RefreshCw } from 'lucide-react';
import type { CubeState } from '@/features/home/lib/scramble/cube-solver';
import { CubeVisualizer } from '@/shared/components/cube-visualizer/cube-visualizer';
import { ScrambleGuideModal } from '@/shared/components/scramble-guide-modal/scramble-guide-modal';
import { useScrambleGuideModal } from '@/shared/components/scramble-guide-modal/use-scramble-guide-modal';
import { Button } from '@/shared/components/ui';
import { slideDown } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { useScrambleBox } from './use-scramble-box';

const MotionButton = motion.create(Button);

interface ScrambleBoxProps {
  scramble: string;
  onNewScramble: () => void;
  cubeState: CubeState | null;
  showVisualizer: boolean;
  onToggleVisualizer: () => void;
  'data-onboarding'?: string;
}

export function ScrambleBox({
  scramble,
  onNewScramble,
  cubeState,
  showVisualizer,
  onToggleVisualizer,
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
        <div className="bg-surface rounded-xl sm:rounded-2xl p-3 sm:p-6 shadow-lg border border-white/5">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-semibold text-muted">{t.scramble.title}</h2>
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
              {cubeState && (
                <MotionButton
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onToggleVisualizer}
                  variant="ghost"
                  size="icon"
                  className={`p-1 focus-visible:ring-blue-400 focus-visible:ring-offset-gray-800 transition-colors ${
                    showVisualizer ? 'text-primary' : 'text-gray-400 hover:text-primary'
                  }`}
                  title="Toggle 3D View"
                >
                  <Box size={18} />
                </MotionButton>
              )}
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
            className="font-mono text-lg sm:text-2xl text-primary wrap-break-word leading-relaxed text-center sm:text-left"
          >
            {scramble || t.scramble.generating}
          </motion.div>

          <AnimatePresence>
            {showVisualizer && cubeState && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 overflow-hidden border-t border-white/5 pt-4"
              >
                <CubeVisualizer
                  config={{
                    faces: [
                      { label: 'U', colors: cubeState.U },
                      { label: 'F', colors: cubeState.F },
                      { label: 'R', colors: cubeState.R },
                      { label: 'D', colors: cubeState.D },
                      { label: 'L', colors: cubeState.L },
                      { label: 'B', colors: cubeState.B },
                    ],
                  }}
                  className="bg-transparent border-none p-0"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <ScrambleGuideModal isOpen={isOpen} onClose={closeGuide} />
    </>
  );
}
