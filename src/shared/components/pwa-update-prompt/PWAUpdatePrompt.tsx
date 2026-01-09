import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { Button } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/stores/i18nStore';
import { usePWAUpdatePrompt } from './usePWAUpdatePrompt';

export function PWAUpdatePrompt() {
  const { showPrompt, needRefresh, close, handleUpdate } = usePWAUpdatePrompt();
  const { t } = useI18nStore();

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-md z-50"
        >
          <div className="bg-surface border-2 border-primary rounded-2xl p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <Download className="w-5 h-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-text-primary mb-1">
                  {needRefresh ? t.pwa.update.title : t.pwa.offline.title}
                </h3>
                <p className="text-sm text-text-secondary mb-3">
                  {needRefresh ? t.pwa.update.description : t.pwa.offline.description}
                </p>

                <div className="flex gap-2">
                  {needRefresh && (
                    <Button onClick={handleUpdate} className="px-4 py-2 text-sm">
                      {t.pwa.update.updateNow}
                    </Button>
                  )}
                  <Button onClick={close} variant="secondary" className="px-4 py-2 text-sm">
                    {needRefresh ? t.pwa.update.later : t.pwa.offline.understood}
                  </Button>
                </div>
              </div>

              <Button
                onClick={close}
                variant="ghost"
                size="icon"
                className="shrink-0 w-8 h-8"
                aria-label={t.pwa.close}
              >
                <X className="w-5 h-5 text-text-secondary" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
