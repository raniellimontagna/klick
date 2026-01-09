import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { AdvancedStatsContent } from './components/advanced-stats/advanced-stats-content';
import { PageHeader } from '@/shared';
import { useI18nStore } from '@/shared/store/stores/i18n-store';
import { fadeIn } from '@/shared/lib';

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
        icon={<TrendingUp className="w-8 h-8" />}
      />

      <div className="min-h-[600px]">
        <AdvancedStatsContent />
      </div>
    </motion.div>
  );
}
