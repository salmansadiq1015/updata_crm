import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { callingIntelligenceTranslations } from '@/lib/i18n/calling-intelligence-translations';
import { translations } from '@/lib/i18n/translations';

const LOCALES = ['de', 'en', 'fr', 'ar'];
const UI_DIR = path.resolve(process.cwd(), 'src/modules/aiCalling/ui');
const FILES = ['call-intelligence-panel.tsx', 'intelligence-review-queue.tsx', 'knowledge-base-panel.tsx', 'transfer-availability.tsx', 'agent-intelligence-settings.tsx', 'incoming-transfer-host.tsx'];

describe('calling intelligence translations', () => {
  test('every locale has exactly the same non-empty keys', () => {
    const en = Object.keys(callingIntelligenceTranslations.en).sort();
    expect(en.length).toBeGreaterThan(200);
    for (const locale of LOCALES) {
      const keys = Object.keys(callingIntelligenceTranslations[locale]).sort();
      expect(keys).toEqual(en);
      for (const key of keys) expect(String(callingIntelligenceTranslations[locale][key]).trim(), `${locale}:${key}`).not.toBe('');
    }
  });

  test('placeholders are kept in every translation', () => {
    for (const [key, value] of Object.entries(callingIntelligenceTranslations.en)) {
      const vars = (value.match(/\{\w+\}/g) || []).sort();
      for (const locale of LOCALES) expect((callingIntelligenceTranslations[locale][key].match(/\{\w+\}/g) || []).sort(), `${locale}:${key}`).toEqual(vars);
    }
  });

  test('every static key used by the UI exists and the app dictionary includes them', () => {
    const used = new Set();
    for (const file of FILES) for (const match of fs.readFileSync(path.join(UI_DIR, file), 'utf8').matchAll(/t\('(callingIntel\.[\w.]+)'/g)) used.add(match[1]);
    const missing = [...used].filter(key => !(key in callingIntelligenceTranslations.en));
    expect(missing).toEqual([]);
    for (const locale of LOCALES) expect(translations[locale]['callingIntel.panel.title']).toBe(locale === 'de' ? translations.de['callingIntel.panel.title'] : callingIntelligenceTranslations[locale]['callingIntel.panel.title']);
  });
});
