import { Languages } from 'lucide-react';
import { useState } from 'react';
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

  const languages: { code: Language; label: string; shortLabel: string }[] = [
    { code: 'pt-BR', label: t.language['pt-BR'], shortLabel: 'PT' },
    { code: 'en-US', label: t.language['en-US'], shortLabel: 'EN' },
    { code: 'es-ES', label: t.language['es-ES'], shortLabel: 'ES' },
  ];

  const currentLanguage = languages.find((lang) => lang.code === language);

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
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <DropdownMenuTriggerButton
          icon={<Languages size={18} />}
          label={getButtonLabel()}
          isOpen={isOpen}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t.language.title}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={language} onValueChange={(v) => setLanguage(v as Language)}>
          {languages.map((lang) => (
            <DropdownMenuRadioItem key={lang.code} value={lang.code} className="gap-3 py-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-xs font-semibold uppercase tracking-wide text-text-secondary shrink-0">
                {lang.shortLabel}
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
