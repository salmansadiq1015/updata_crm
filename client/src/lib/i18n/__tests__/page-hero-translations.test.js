import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { pageHeroTranslations } from '../page-hero-translations';
import { translations } from '../translations';

/** Module page headers: complete locales, intact placeholders, every literal key the screens use is defined. */
const placeholders = (s) => (String(s).match(/\{\w+\}/g) || []).sort();
const en = pageHeroTranslations.en;
const SCREENS = [
  'modules/leads/ui/lead-list-view.tsx',
  'modules/leads/ui/lead-hero-stats.tsx',
  'modules/leads/ui/follow-up-inbox.tsx',
  'modules/aiCalling/ui/calling-agent-platform.tsx',
  'modules/inboundCalls/ui/incoming-calls-workspace.tsx',
  'modules/simCalls/ui/sim-calls-workspace.tsx',
  'modules/smsOps/ui/sms-ops-workspace.tsx',
  'modules/workflowAutomation/ui/pages/overview-page.tsx',
];

describe('page hero translations', () => {
  it.each(['de', 'fr', 'ar'])('%s has every key with the same placeholders', (locale) => {
    for (const [key, value] of Object.entries(en)) {
      expect(pageHeroTranslations[locale][key], `${locale}:${key}`).toBeTruthy();
      expect(placeholders(pageHeroTranslations[locale][key]), `${locale}:${key}`).toEqual(placeholders(value));
    }
  });

  it('defines every literal key the header screens use, in the merged dictionary', () => {
    const root = path.resolve(__dirname, '../../..');
    const code = SCREENS.map((f) => readFileSync(path.join(root, f), 'utf8')).join('\n');
    const used = [...new Set([...code.matchAll(/t\(\s*'((?:hero|simCalls|common|callingExperience)\.[\w.]+)'/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(60);
    for (const locale of ['en', 'de', 'fr', 'ar']) expect(used.filter((k) => !translations[locale][k]), locale).toEqual([]);
  });
});
