import { describe, expect, test } from 'vitest';
import { translations } from '@/lib/i18n/translations';

const locales = ['en', 'fr', 'it'] as const;

describe('DocTpl translations', () => {
  test('has every German DocTpl key in all supported non-default locales', () => {
    const germanDoctplKeys = Object.keys(translations.de).filter((key) => key.startsWith('doctpl.'));

    for (const locale of locales) {
      for (const key of germanDoctplKeys) {
        expect(translations[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
