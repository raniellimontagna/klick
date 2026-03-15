import { CloseCircle, Download } from '@solar-icons/react';
import { AnimatePresence, motion } from 'framer-motion';
import { Button } from '@/shared/components/ui';
import { useI18nStore } from '@/shared/store/i18n-store';
import { usePWAUpdatePrompt } from './use-pwa-update-prompt';

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
          className="fixed bottom-[calc(var(--safe-area-bottom)+6.5rem)] left-4 right-4 z-50 sm:bottom-4 sm:left-auto sm:max-w-md"
        >
          <div className="surface-overlay rounded-[1.75rem] p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Download className="w-5 h-5 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="mb-1 font-semibold text-text-primary">
                  {needRefresh ? t.pwa.update.title : t.pwa.offline.title}
                </h3>
                <p className="mb-3 text-sm leading-relaxed text-text-secondary">
                  {needRefresh ? t.pwa.update.description : t.pwa.offline.description}
                </p>

                <div className="flex flex-wrap gap-2">
                  {needRefresh && (
                    <Button onClick={handleUpdate} className="text-sm">
                      {t.pwa.update.updateNow}
                    </Button>
                  )}
                  <Button onClick={close} variant="secondary" className="text-sm">
                    {needRefresh ? t.pwa.update.later : t.pwa.offline.understood}
                  </Button>
                </div>
              </div>

              <Button
                onClick={close}
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label={t.pwa.close}
              >
                <CloseCircle size={20} className="text-text-secondary" />
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
