import { motion } from 'framer-motion';
import { Award, BookOpen, Home, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/shared';
import { Button } from '@/shared/components/ui';
import { fadeIn } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { TutorialContent } from './components/tutorial-content/tutorial-content';
import { useTutorialStore } from './tutorial-store';

export function Tutorial() {
  const { t } = useI18nStore();
  const { hasCompleted, resetTutorial } = useTutorialStore();
  const navigate = useNavigate();

  const handleGoToTimer = () => {
    navigate('/');
  };

  const handleRestartTutorial = () => {
    resetTutorial();
  };

  // Completion screen
  if (hasCompleted) {
    return (
      <motion.div
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        className="mx-auto w-full max-w-2xl"
      >
        <div className="bg-white/5 backdrop-blur-md rounded-2xl p-8 sm:p-12 shadow-2xl border border-white/10 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
            className="w-24 h-24 mx-auto mb-6 bg-success/20 rounded-full flex items-center justify-center border-2 border-success/30"
          >
            <Award className="w-12 h-12 text-success" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-3xl sm:text-4xl font-black text-text-primary mb-3"
          >
            🎉 {t.tutorial.completion.title}
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-text-secondary text-lg mb-8 max-w-md mx-auto"
          >
            {t.tutorial.completion.description}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button
              onClick={handleGoToTimer}
              className="flex items-center justify-center gap-2 px-8 py-3 font-bold shadow-lg shadow-primary/20"
            >
              <Home className="w-5 h-5" />
              {t.tutorial.completion.goToTimer}
            </Button>
            <Button
              onClick={handleRestartTutorial}
              variant="ghost"
              className="flex items-center justify-center gap-2 px-6 py-3 text-text-muted hover:text-text-primary hover:bg-white/5"
            >
              <RotateCcw className="w-5 h-5" />
              {t.tutorial.completion.restart}
            </Button>
          </motion.div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-4xl"
    >
      <PageHeader
        title={t.navigation.tutorial}
        description={t.pages.tutorial.description}
        icon={<BookOpen className="w-8 h-8" />}
      />

      <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-2xl border border-white/10">
        <TutorialContent />
      </div>
    </motion.div>
  );
}
