import { getLocales } from 'expo-localization';
import i18next, { changeLanguage, use as registerI18nextPlugin } from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import { ar } from '@/locales/ar';
import { de } from '@/locales/de';
import { en } from '@/locales/en';
import { fr } from '@/locales/fr';

import { DEFAULT_LOCALE, isLocale, isRtlLocale, type Locale } from './locales';

export const resources = {
  en: { translation: en },
  de: { translation: de },
  fr: { translation: fr },
  ar: { translation: ar },
} as const;

/** First supported device language, else English. */
export function deviceLocale(): Locale {
  const match = getLocales()
    .map((locale) => locale.languageCode)
    .find(isLocale);
  return match ?? DEFAULT_LOCALE;
}

export function resolveLocale(preference: Locale | null): Locale {
  return preference ?? deviceLocale();
}

/**
 * Align native layout direction with the language. Android applies a direction
 * change only after a reload, so returns whether one is needed.
 */
export function applyLayoutDirection(locale: Locale): boolean {
  const rtl = isRtlLocale(locale);
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  return true;
}

export function initI18n(locale: Locale) {
  if (i18next.isInitialized) return changeLanguage(locale);
  return registerI18nextPlugin(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false },
    returnNull: false,
  });
}

export { i18next };
