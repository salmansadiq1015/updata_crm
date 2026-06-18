import { describe, expect, test } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import { BUILT_IN_TEMPLATE_TYPES } from '../utils/template-defaults';

const locales = ['en', 'fr', 'it'] as const;
const allLocales = ['de', 'en', 'fr', 'it'] as const;

describe('DocTpl translations', () => {
  test('has every German DocTpl key in all supported non-default locales', () => {
    const germanDoctplKeys = Object.keys(translations.de).filter((key) => key.startsWith('doctpl.'));

    for (const locale of locales) {
      for (const key of germanDoctplKeys) {
        expect(translations[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });

  test('has labels for every built-in template type in all supported locales', () => {
    for (const [templateType] of BUILT_IN_TEMPLATE_TYPES) {
      const key = `doctpl.type.${templateType}`;

      for (const locale of allLocales) {
        expect(translations[locale][key], `${locale}:${key}`).toBeTruthy();
      }
    }
  });
});
