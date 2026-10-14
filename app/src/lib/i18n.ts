// The app language: the setting from Settings (also carried in backups), or
// the phone's language. Texts are English keys translated by the shared
// dictionary in setlog/js/core/i18n-de.js, the same one the web app uses.
import { useMemo } from 'react';
import { translator, pickLanguage, configureUnits } from '@setlog/core';

import { useAppState } from '@/data/store';

export type Tr = (text: string, vars?: Record<string, string | number>) => string;

export function phoneLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
  } catch {
    return 'en-US';
  }
}

export function resolveLanguage(setting: unknown): 'en' | 'de' {
  return setting === 'en' || setting === 'de' ? setting : pickLanguage([phoneLocale()]);
}

/** Locale for numbers and dates: German formats in German, the phone's otherwise. */
export function localeFor(lang: 'en' | 'de'): string {
  const phone = phoneLocale();
  if (lang === 'de') return /^de\b/i.test(phone) ? phone : 'de-DE';
  return /^de\b/i.test(phone) ? 'en-US' : phone;
}

export function useLang() {
  const { settings } = useAppState();
  const lang = resolveLanguage(settings.language);
  return useMemo(() => {
    const locale = localeFor(lang);
    let decimal = '.';
    try {
      decimal = new Intl.NumberFormat(locale).formatToParts(1.5).find((p) => p.type === 'decimal')?.value || '.';
    } catch {
      // keep "."
    }
    configureUnits({ decimal });
    return { lang, locale, tr: translator(lang) as Tr };
  }, [lang]);
}
