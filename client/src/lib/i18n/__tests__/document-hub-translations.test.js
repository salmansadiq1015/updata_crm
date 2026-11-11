import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { documentHubTranslations } from '../document-hub-translations';
import { translations } from '../translations';

/** Document hub: complete locales, intact placeholders, every literal key the screens use is defined. */
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
const en = documentHubTranslations.en;

describe('document hub translations', () => {
  it.each(['de', 'fr', 'ar'])('%s has every key with the same placeholders', (locale) => {
    for (const [key, value] of Object.entries(en)) {
      expect(documentHubTranslations[locale][key], `${locale}:${key}`).toBeTruthy();
      expect(placeholders(documentHubTranslations[locale][key]), `${locale}:${key}`).toEqual(placeholders(value));
    }
  });

  it('defines every documents.hub key the module uses, in the merged dictionary', () => {
    const dir = path.resolve(__dirname, '../../../modules/documents/components');
    const code = readdirSync(dir).filter((f) => f.endsWith('.jsx')).map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const used = [...new Set([...code.matchAll(/t\(\s*'(documents\.hub\.[\w.]+)'/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(40);
    for (const locale of ['en', 'de']) expect(used.filter((k) => !translations[locale][k])).toEqual([]);
  });
});
