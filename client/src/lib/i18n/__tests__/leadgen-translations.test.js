import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { translations } from '@/lib/i18n/translations';
import { SUPPORTED_LOCALES } from '@/lib/i18n/language-context';

/**
 * Locale-parity + catalog-coverage guard for the Lead Generation / Leads module
 * namespaces (design §14). Unlike the rest of the app (which may fall back to
 * German for fr/ar), the `leadgen.*` and `leads.*` namespaces MUST be complete
 * in all four UI locales.
 */

const LOCALES = ['de', 'en', 'fr', 'ar'];
const MODULE_PREFIXES = ['leadgen.', 'leads.'];

const isModuleKey = (key) => MODULE_PREFIXES.some((p) => key.startsWith(p));

function moduleKeysFor(locale) {
  return Object.keys(translations[locale] ?? {}).filter(isModuleKey);
}

/** Read the server business-type catalog and derive the i18n keys it declares. */
function catalogI18nKeys() {
  const catalogPath = path.resolve(
    process.cwd(),
    '../server/src/modules/businessDiscovery/businessTypeCatalog.js',
  );
  const source = fs.readFileSync(catalogPath, 'utf8');

  // Group keys are declared verbatim as `i18nKey: 'leadgen.group.<x>'`.
  const groupKeys = new Set();
  for (const m of source.matchAll(/i18nKey:\s*['"](leadgen\.group\.[^'"]+)['"]/g)) {
    groupKeys.add(m[1]);
  }

  // Type keys are derived from each entry's `id` as `leadgen.type.<id with - → _>`
  // (see TYPE_INDEX in businessTypeCatalog.js).
  const typeKeys = new Set();
  for (const m of source.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)) {
    typeKeys.add(`leadgen.type.${m[1].replace(/-/g, '_')}`);
  }

  return { groupKeys, typeKeys };
}

describe('leadgen/leads translations', () => {
  test('SUPPORTED_LOCALES contains de, en, fr, and ar', () => {
    for (const locale of LOCALES) {
      expect(SUPPORTED_LOCALES).toContain(locale);
    }
  });

  test('every leadgen.*/leads.* key in de is present in en, fr, and ar', () => {
    const deKeys = moduleKeysFor('de');
    expect(deKeys.length).toBeGreaterThan(0);

    const missing = [];
    for (const locale of ['en', 'fr', 'ar']) {
      for (const key of deKeys) {
        if (!translations[locale]?.[key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing module translations: ${missing.join(', ')}`).toEqual([]);
  });

  test('keeps leadgen.*/leads.* keys bidirectionally complete across all four locales', () => {
    const unionKeys = new Set();
    for (const locale of LOCALES) {
      for (const key of moduleKeysFor(locale)) unionKeys.add(key);
    }

    const missing = [];
    for (const locale of LOCALES) {
      for (const key of unionKeys) {
        if (!translations[locale]?.[key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Module namespace parity gaps: ${missing.join(', ')}`).toEqual([]);
  });

  test('every business-type group + type key from the catalog exists in all four locales', () => {
    const { groupKeys, typeKeys } = catalogI18nKeys();
    const catalogKeys = [...groupKeys, ...typeKeys];

    // Sanity: the catalog really did yield the expected shape.
    expect(groupKeys.size).toBeGreaterThan(0);
    expect(typeKeys.size).toBeGreaterThan(0);

    const missing = [];
    for (const locale of LOCALES) {
      for (const key of catalogKeys) {
        if (!translations[locale]?.[key]) missing.push(`${locale}:${key}`);
      }
    }

    expect(missing, `Missing catalog i18n keys: ${missing.join(', ')}`).toEqual([]);
  });
});
