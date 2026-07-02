import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '@/lib/i18n/translations';
import { DOCTPL_TEMPLATE_ADMIN_I18N_KEYS } from '../constants/template-admin';
import { BUILT_IN_TEMPLATE_TYPES } from '../utils/template-defaults';

const locales = ['en', 'fr', 'it'] as const;
const allLocales = ['de', 'en', 'fr', 'it'] as const;
const templateAdminSourceFiles = [
  'src/app/(platform)/admin/templates/page.jsx',
  'src/modules/doctpl/components/template-admin-page.jsx',
  'src/modules/doctpl/components/CreateTemplateDialog/index.jsx',
  'src/modules/doctpl/hooks/use-template-admin-controller.js',
  'src/modules/doctpl/constants/template-admin.js',
];

function collectTemplateAdminSourceKeys() {
  const keys = new Set<string>();
  for (const file of templateAdminSourceFiles) {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');
    for (const match of source.matchAll(/doctpl\.templates\.[A-Za-z0-9]+/g)) {
      keys.add(match[0]);
    }
  }
  return [...keys].sort();
}

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

  test('every DocTpl key exists in every locale (bidirectional completeness)', () => {
    // Union of doctpl.* keys across ALL locales — catches a key missing in any
    // single language, including German (the previous test only anchored on de).
    const unionKeys = new Set<string>();
    for (const locale of allLocales) {
      for (const key of Object.keys(translations[locale])) {
        if (key.startsWith('doctpl.')) unionKeys.add(key);
      }
    }

    const missing: string[] = [];
    for (const locale of allLocales) {
      for (const key of unionKeys) {
        if (!translations[locale][key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing/empty DocTpl translations: ${missing.join(', ')}`).toEqual([]);
  });

  test('has every document templates admin page key in all supported locales', () => {
    const missing: string[] = [];

    for (const locale of allLocales) {
      for (const key of DOCTPL_TEMPLATE_ADMIN_I18N_KEYS) {
        if (!translations[locale][key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing template admin translations: ${missing.join(', ')}`).toEqual([]);
  });

  test('has translations for every literal document templates page source key', () => {
    const pageKeys = collectTemplateAdminSourceKeys();
    const missing: string[] = [];

    expect(pageKeys.length).toBeGreaterThan(0);
    for (const locale of allLocales) {
      for (const key of pageKeys) {
        if (!translations[locale][key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing source-scanned template page translations: ${missing.join(', ')}`).toEqual([]);
  });
});
