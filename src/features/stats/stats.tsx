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
      className="app-shell-page app-shell-page-wide space-y-5"
    >
      <PageHeader
        title={t.navigation.stats}
        description={t.pages.stats.description}
        icon={<GraphUp size={32} />}
      />

      <div className="surface-panel min-h-[600px] rounded-3xl p-4 sm:p-5">
        <AdvancedStatsContent />
      </div>
    </motion.div>
  );
}
