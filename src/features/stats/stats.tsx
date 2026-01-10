import { GraphUp } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/shared';
import { fadeIn } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { AdvancedStatsContent } from './components/advanced-stats/advanced-stats-content';

export function Stats() {
  const { t } = useI18nStore();

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-6xl"
    >
      <PageHeader
        title={t.navigation.stats}
        description={t.pages.stats.description}
        icon={<GraphUp size={32} />}
      />

      <div className="min-h-[600px]">
        <AdvancedStatsContent />
      </div>
    </motion.div>
  );
}
