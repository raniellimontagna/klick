import { useState } from 'react';
import BrFlag from '@/assets/flags/br.svg';
import EsFlag from '@/assets/flags/es.svg';
import UsFlag from '@/assets/flags/us.svg';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuTriggerButton,
} from '@/shared/components/ui';
import type { Language } from '@/shared/config/i18n/translations';
import { useI18nStore } from '@/shared/store/i18n-store';

export function LanguageSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const { language, setLanguage, t } = useI18nStore();

  const languages: { code: Language; label: string; flag: string }[] = [
    { code: 'pt-BR', label: t.language['pt-BR'], flag: BrFlag },
    { code: 'en-US', label: t.language['en-US'], flag: UsFlag },
    { code: 'es-ES', label: t.language['es-ES'], flag: EsFlag },
  ];

  const currentLanguage = languages.find((lang) => lang.code === language);

  const getButtonLabel = () => {
    if (!currentLanguage) {
      return language.split('-')[0]?.toUpperCase() ?? language;
    }
    return <span className="hidden lg:inline whitespace-nowrap">{currentLanguage.label}</span>;
  };

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <DropdownMenuTriggerButton
          icon={
            currentLanguage ? (
              <img
                src={currentLanguage.flag}
                alt={currentLanguage.label}
                className="w-[18px] h-[18px] object-contain rounded-[2px]"
              />
            ) : undefined
          }
          label={getButtonLabel()}
          isOpen={isOpen}
          className="min-w-[44px] lg:min-w-0"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t.language.title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={language} onValueChange={(v) => setLanguage(v as Language)}>
          {languages.map((lang) => (
            <DropdownMenuRadioItem
              key={lang.code}
              value={lang.code}
              className="gap-3 py-3 mb-1 last:mb-0"
            >
              <span className="inline-flex h-8 w-8 items-center justify-center shrink-0">
                <img
                  src={lang.flag}
                  alt={lang.label}
                  className="w-6 h-6 object-contain rounded-[2px] shadow-sm"
                />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="font-medium text-text-primary">{lang.label}</span>
                <span className="text-xs uppercase tracking-wide text-text-muted">{lang.code}</span>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
