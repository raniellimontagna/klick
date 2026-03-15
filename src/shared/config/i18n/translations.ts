import { enUS, esES, ptBR } from './locales';

export const translations = {
  'pt-BR': ptBR,
  'en-US': enUS,
  'es-ES': esES,
} as const;

export type Language = keyof typeof translations;
export type TranslationKey = typeof ptBR | typeof enUS | typeof esES;
