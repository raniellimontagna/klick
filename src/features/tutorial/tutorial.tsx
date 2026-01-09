import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';
import { TutorialContent } from './components/tutorial-content/tutorial-content';
import { PageHeader } from '@/shared';
import { useI18nStore } from '@/shared/store/i18n-store';
import { fadeIn } from '@/shared/lib';

export function Tutorial() {
  const { t } = useI18nStore();

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-6xl"
    >
      <PageHeader
        title={t.navigation.tutorial}
        description={t.pages.tutorial.description}
        icon={<BookOpen className="w-8 h-8" />}
      />

      <div className="bg-surface rounded-xl p-6 shadow-sm">
        <TutorialContent />
      </div>
    </motion.div>
  );
}
