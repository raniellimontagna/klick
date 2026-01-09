import { motion } from 'framer-motion';
import { Settings as SettingsIcon } from 'lucide-react';
import { SettingsContent } from './components/SettingsContent';
import { PageHeader } from '@/shared';
import { useI18nStore } from '@/shared/store/stores/i18nStore';
import { fadeIn } from '@/shared/lib';

export function Settings() {
  const { t } = useI18nStore();

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="mx-auto w-full max-w-6xl"
    >
      <PageHeader
        title={t.navigation.settings}
        description={t.pages.settings.description}
        icon={<SettingsIcon className="w-8 h-8" />}
      />

      <SettingsContent />
    </motion.div>
  );
}
