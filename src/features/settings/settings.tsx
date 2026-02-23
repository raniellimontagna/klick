import { Settings as SettingsIcon } from '@solar-icons/react';
import { motion } from 'framer-motion';
import { PageHeader } from '@/shared';
import { fadeIn } from '@/shared/lib';
import { useI18nStore } from '@/shared/store/i18n-store';
import { SettingsContent } from './components/settings-content';

export const Settings: React.FC = (): React.ReactElement => {
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
        icon={<SettingsIcon size={32} />}
      />

      <section className="mt-8">
        <SettingsContent />
      </section>
    </motion.div>
  );
};
