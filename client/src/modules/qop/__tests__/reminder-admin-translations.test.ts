import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '@/lib/i18n/translations';
import { REMINDER_ADMIN_I18N_KEYS } from '../constants/reminder-admin';

const SUPPORTED_LOCALES = ['de', 'en'] as const;
const SOURCE_FILES = [
  'src/modules/qop/components/reminder-admin-page.jsx',
  'src/modules/qop/hooks/use-reminder-admin-controller.js',
  'src/modules/qop/utils/reminder-admin-utils.js',
  'src/modules/qop/constants/reminder-admin.js',
];

function collectLiteralReminderKeys() {
  const keys = new Set<string>();

  for (const file of SOURCE_FILES) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const match of source.matchAll(/qop\.reminders\.[A-Za-z0-9_.]+/g)) {
      const key = match[0];
      if (!key.endsWith('.')) keys.add(key);
    }
  }

  return [...keys].sort();
}

describe('reminder admin translations', () => {
  test('tracks every literal reminder key used by the page source', () => {
    const declared = new Set(REMINDER_ADMIN_I18N_KEYS);
    const missingFromRegistry = collectLiteralReminderKeys().filter((key) => !declared.has(key));

    expect(missingFromRegistry, `Keys used by source but missing from REMINDER_ADMIN_I18N_KEYS: ${missingFromRegistry.join(', ')}`)
      .toEqual([]);
  });

  test('has every reminder admin key in every supported locale', () => {
    const missing: string[] = [];

    for (const locale of SUPPORTED_LOCALES) {
      for (const key of REMINDER_ADMIN_I18N_KEYS) {
        const value = translations[locale]?.[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
          missing.push(`${locale}:${key}`);
        }
      }
    }

    expect(missing, `Missing reminder translations: ${missing.join(', ')}`).toEqual([]);
  });
});
