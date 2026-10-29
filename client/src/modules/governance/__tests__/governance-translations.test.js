import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { platformGovernanceTranslations } from '@/lib/i18n/platform-governance-translations';
import { translations } from '@/lib/i18n/translations';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..', '..');
const LOCALES = ['de', 'en', 'fr', 'ar'];

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : filesUnder(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

describe('platform governance translations', () => {
  it('every locale has exactly the same non-empty keys', () => {
    const en = Object.keys(platformGovernanceTranslations.en).sort();
    for (const locale of LOCALES) {
      const keys = Object.keys(platformGovernanceTranslations[locale]).sort();
      expect(keys, locale).toEqual(en);
      for (const key of keys) expect(platformGovernanceTranslations[locale][key].trim(), `${locale}:${key}`).not.toBe('');
    }
  });

  it('keeps {placeholders} identical across locales', () => {
    const vars = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
    for (const [key, value] of Object.entries(platformGovernanceTranslations.en)) {
      for (const locale of LOCALES) expect(vars(platformGovernanceTranslations[locale][key]), `${locale}:${key}`).toBe(vars(value));
    }
  });

  it('is merged into the app dictionary for every locale', () => {
    for (const locale of LOCALES) {
      expect(translations[locale]['governance.nav.accessLog']).toBe(platformGovernanceTranslations[locale]['governance.nav.accessLog']);
    }
  });

  it('covers every static governance / campaignPerformance key used in the UI', () => {
    const files = [
      ...filesUnder(join(src, 'modules', 'governance')),
      ...filesUnder(join(src, 'modules', 'campaignPerformance')),
      join(src, 'layout', 'sidebar.jsx'),
      join(src, 'modules', 'settings', 'constants', 'settings-hub.js'),
    ];
    const used = new Set();
    for (const file of files) {
      for (const m of readFileSync(file, 'utf8').matchAll(/['"`]((?:governance|campaignPerformance)\.[A-Za-z0-9_.]+)['"`]/g)) used.add(m[1]);
    }
    const missing = [...used].filter((key) => !(key in platformGovernanceTranslations.en));
    expect(missing).toEqual([]);
  });
});
