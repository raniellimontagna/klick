
import { useMemo } from 'react';
import { useI18nStore } from '@/shared/store/stores/i18n-store';

export function useTranslation() {
  const { t, language, setLanguage } = useI18nStore();

  const locale = useMemo(() => t, [t]);

  return {
    t: locale,
    language,
    setLanguage,
  };
}
