import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { liveVoiceTranslations } from '@/lib/i18n/live-voice-translations';
import { translations } from '@/lib/i18n/translations';

/** Every live-voice key exists in all four locales, and every key the module uses is defined. */
const LOCALES = ['de', 'en', 'fr', 'ar'];

function keysUsed() {
  const dir = path.resolve(process.cwd(), 'src/modules/ai/voice-live');
  const keys = new Set();
  for (const f of fs.readdirSync(dir)) {
    if (!/\.(jsx?|tsx?)$/.test(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of src.matchAll(/'(live\.[a-zA-Z_.]+)'/g)) keys.add(m[1]);
  }
  return [...keys];
}

describe('live voice translations', () => {
  test('all locales have the same keys, none empty', () => {
    const en = Object.keys(liveVoiceTranslations.en).sort();
    for (const locale of LOCALES) {
      expect(Object.keys(liveVoiceTranslations[locale]).sort()).toEqual(en);
      for (const value of Object.values(liveVoiceTranslations[locale])) expect(String(value).trim()).not.toBe('');
    }
  });

  test('every key used by the module is defined and merged into the app dictionary', () => {
    const used = keysUsed();
    expect(used.length).toBeGreaterThan(40);
    for (const key of used) {
      for (const locale of LOCALES) expect(translations[locale][key], `${locale}:${key}`).toBeTruthy();
    }
  });
});
