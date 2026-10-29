import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { smsOpsTranslations } from '@/lib/i18n/sms-ops-translations';
import { translations } from '@/lib/i18n/translations';

/**
 * SMS operations keys must be complete in all four UI locales (no fallback to
 * German/English), and every static `t('smsOps.…')` key used by the module
 * must exist.
 */
const LOCALES = ['de', 'en', 'fr', 'ar'];

function staticKeysUsed() {
  const dir = path.resolve(process.cwd(), 'src/modules/smsOps');
  const keys = new Set();
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) { if (entry.name !== '__tests__') walk(full); continue; }
      if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
      for (const m of fs.readFileSync(full, 'utf8').matchAll(/t\('(smsOps\.[A-Za-z0-9_.-]+)'/g)) keys.add(m[1]);
    }
  };
  walk(dir);
  return [...keys];
}

describe('sms ops translations', () => {
  test('every locale has exactly the English key set, all non-empty', () => {
    const en = Object.keys(smsOpsTranslations.en).sort();
    for (const locale of LOCALES) {
      const dict = smsOpsTranslations[locale];
      expect(Object.keys(dict).sort(), locale).toEqual(en);
      const empty = Object.entries(dict).filter(([, v]) => typeof v !== 'string' || !v.trim()).map(([k]) => k);
      expect(empty, `${locale} empty values`).toEqual([]);
    }
  });

  test('interpolation placeholders match English in every locale', () => {
    const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(smsOpsTranslations.en)) {
        expect(vars(smsOpsTranslations[locale][key]), `${locale}:${key}`).toBe(vars(value));
      }
    }
  });

  test('Arabic strings are actually Arabic (not English copies)', () => {
    const latinOnly = Object.entries(smsOpsTranslations.ar)
      .filter(([, v]) => !/[؀-ۿ]/.test(v))
      .map(([k]) => k);
    // Brand / technical tokens that are legitimately the same in every language.
    expect(latinOnly).toEqual([]);
  });

  test('every static key used by the module exists and is wired into the app dictionary', () => {
    const missing = staticKeysUsed().filter((k) => !(k in smsOpsTranslations.en));
    expect(missing).toEqual([]);
    for (const locale of LOCALES) {
      expect(translations[locale]['smsOps.title']).toBe(smsOpsTranslations[locale]['smsOps.title']);
      expect(translations[locale]['sidebar.smsOps']).toBe(smsOpsTranslations[locale]['sidebar.smsOps']);
    }
  });
});
