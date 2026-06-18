import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import { NOTIFICATION_I18N_KEYS } from '../constants/notification-i18n-keys';

const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'it'];

describe('notification translations', () => {
  it('has complete notification keys for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of NOTIFICATION_I18N_KEYS) {
        expect(translations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String));
        expect(translations[locale][key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });
});
