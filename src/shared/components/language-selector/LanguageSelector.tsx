import { useRef, useState } from 'react';
import { Languages, Check } from 'lucide-react';
import { useI18nStore } from '@/shared/store/stores/i18nStore';
import { HeaderDropdownButton, HeaderDropdownMenu } from '@/shared';
import { Button } from '@/shared/components/ui';
import type { Language } from '@/shared/config/i18n/translations';

export function LanguageSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { language, setLanguage, t } = useI18nStore();
  const triggerRef = useRef<HTMLButtonElement>(null);

  const languages: { code: Language; label: string; shortLabel: string }[] = [
    { code: 'pt-BR', label: t.language['pt-BR'], shortLabel: 'PT' },
    { code: 'en-US', label: t.language['en-US'], shortLabel: 'EN' },
    { code: 'es-ES', label: t.language['es-ES'], shortLabel: 'ES' },
  ];

  const currentLanguage = languages.find((lang) => lang.code === language);

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang);
    setIsOpen(false);
  };

  const getButtonLabel = () => {
    if (!currentLanguage) {
      return language.split('-')[0]?.toUpperCase() ?? language;
    }

    return (
      <>
        <span className="inline lg:hidden whitespace-nowrap">{currentLanguage.shortLabel}</span>
        <span className="hidden lg:inline whitespace-nowrap">{currentLanguage.label}</span>
      </>
    );
  };

  return (
    <div className="relative">
      <HeaderDropdownButton
        ref={triggerRef}
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        icon={<Languages size={16} className="sm:w-[18px] sm:h-[18px]" />}
        label={getButtonLabel()}
        truncateLabel={false}
        ariaLabel={t.language.title}
      />

      <HeaderDropdownMenu
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        width="sm:w-56 sm:max-w-xs"
        align="left"
        anchorRef={triggerRef}
      >
        <div className="p-2 bg-gray-900">
          <div className="mb-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t.language.title}
          </div>
          {languages.map((lang) => (
            <Button
              key={lang.code as string}
              onClick={() => handleLanguageChange(lang.code)}
              variant="ghost"
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                language === lang.code
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-850'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-gray-700 text-xs font-semibold uppercase tracking-wide text-gray-200">
                  {lang.shortLabel}
                </span>
                <div className="flex flex-col">
                  <span className="font-medium text-white">{lang.label}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-400">{lang.code}</span>
                </div>
              </div>
              {language === lang.code && (
                <Check size={18} className="text-primary" aria-label="Selected" />
              )}
            </Button>
          ))}
        </div>
      </HeaderDropdownMenu>
    </div>
  );
}
