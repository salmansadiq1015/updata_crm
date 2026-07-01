import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '@/lib/i18n/translations';
import { NOTIFICATION_I18N_KEYS } from '../constants/notification-i18n-keys';

const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'it'];
const ADMIN_CONSOLE_SOURCE = readFileSync(
  resolve(process.cwd(), 'src/modules/notifications/components/notification-admin-console.jsx'),
  'utf8',
);

function extractAdminConsoleKeys() {
  return [...ADMIN_CONSOLE_SOURCE.matchAll(/t\('([^']+)'/g)]
    .map((match) => match[1])
    .filter((key) => key.startsWith('notifications.admin.'))
    .sort();
}

describe('notification translations', () => {
  it('has complete notification keys for every supported locale', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of NOTIFICATION_I18N_KEYS) {
        expect(translations[locale]?.[key], `${locale}.${key}`).toEqual(expect.any(String));
        expect(translations[locale][key].trim().length, `${locale}.${key}`).toBeGreaterThan(0);
      }
    }
  });

  it('registers every notification admin console key for locale coverage', () => {
    for (const key of extractAdminConsoleKeys()) {
      expect(NOTIFICATION_I18N_KEYS, key).toContain(key);
    }
  });
});
