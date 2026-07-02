import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import { SETTINGS_HUB_I18N_KEYS } from '../constants/settings-hub';

const SUPPORTED_LOCALES = ['de', 'en', 'fr', 'it'] as const;
const SOURCE_FILES = [
  'src/app/(platform)/admin/settings/page.jsx',
  'src/layout/sidebar.jsx',
  'src/modules/settings/components/settings-hub-page.jsx',
  'src/modules/settings/constants/settings-hub.js',
  'src/modules/settings/hooks/use-settings-hub-controller.js',
  'src/modules/settings/utils/settings-hub-utils.js',
];

function collectSettingsSourceKeys() {
  const keys = new Set<string>();

  for (const file of SOURCE_FILES) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const match of source.matchAll(/settingsHub\.[A-Za-z0-9_.]+|sidebar\.settings/g)) {
      keys.add(match[0]);
    }
  }

  return [...keys].sort();
}

describe('settings hub translations', () => {
  test('tracks every literal settings key used by source', () => {
    const declared = new Set(SETTINGS_HUB_I18N_KEYS);
    const missingFromRegistry = collectSettingsSourceKeys().filter((key) => !declared.has(key));

    expect(missingFromRegistry, `Missing from SETTINGS_HUB_I18N_KEYS: ${missingFromRegistry.join(', ')}`)
      .toEqual([]);
  });

  test('has every settings key in every supported locale', () => {
    const missing: string[] = [];

    for (const locale of SUPPORTED_LOCALES) {
      for (const key of SETTINGS_HUB_I18N_KEYS) {
        const value = translations[locale]?.[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
          missing.push(`${locale}:${key}`);
        }
      }
    }

    expect(missing, `Missing settings translations: ${missing.join(', ')}`).toEqual([]);
  });
});
