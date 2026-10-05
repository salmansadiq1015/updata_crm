import { describe, expect, test } from 'vitest';
import { SUPPORTED_LOCALES, directionFor, intlLocaleFor } from '@/lib/i18n/locale-config';
import { translations } from '@/lib/i18n/translations';

describe('application locale coverage', () => {
  test('supports English, German, French, and Arabic with the correct directions', () => {
    expect(SUPPORTED_LOCALES).toEqual(['de', 'en', 'fr', 'ar']);
    expect(directionFor('de')).toBe('ltr');
    expect(directionFor('en')).toBe('ltr');
    expect(directionFor('fr')).toBe('ltr');
    expect(directionFor('ar')).toBe('rtl');
  });

  test('maps app locale ids to Intl locale tags', () => {
    expect(intlLocaleFor('de')).toBe('de-CH');
    expect(intlLocaleFor('en')).toBe('en-GB');
    expect(intlLocaleFor('fr')).toBe('fr-CH');
    expect(intlLocaleFor('ar')).toBe('ar');
    expect(intlLocaleFor('fr-CH')).toBe('fr-CH');
  });

  test('keeps every English app key available in every supported locale', () => {
    const englishKeys = Object.keys(translations.en);
    expect(englishKeys.length).toBeGreaterThan(0);

    const missing = [];
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of englishKeys) {
        const value = translations[locale]?.[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
          missing.push(`${locale}:${key}`);
        }
      }
    }

    expect(missing, `Missing locale keys: ${missing.join(', ')}`).toEqual([]);
  });
});
