import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { workflowPagesTranslations } from '../workflow-pages-translations';

/** Workflow Automation screens: every locale complete, placeholders intact, every used key defined. */
const LOCALES = ['de', 'fr', 'ar'];
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();

describe('workflow pages translations', () => {
  const en = workflowPagesTranslations.en;
  it('has a non-empty value for every key in every locale with the same placeholders', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(workflowPagesTranslations[locale]).sort()).toEqual(Object.keys(en).sort());
      for (const [key, value] of Object.entries(en)) {
        const translated = workflowPagesTranslations[locale][key];
        expect(translated, `${locale} ${key}`).toBeTruthy();
        expect(placeholders(translated), `${locale} ${key}`).toEqual(placeholders(value));
      }
    }
  });

  it('defines every workflowPages key the screens use', () => {
    const dir = path.resolve(__dirname, '../../../modules/workflowAutomation/ui/pages');
    const used = new Set();
    for (const file of readdirSync(dir)) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      for (const m of source.matchAll(/t\(\s*'(workflowPages\.[^']+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(100);
    expect([...used].filter((k) => !(k in en))).toEqual([]);
  });
});
