import { describe, expect, it } from 'vitest';
import { filterAgentLanguages } from '../ui/language-select';
import type { AgentLanguage } from '../types/ai-calling-types';

const langs: AgentLanguage[] = [
  { code: 'auto', name: "Automatic (match the lead's language)", nativeName: 'Auto', support: 'full', rtl: false },
  { code: 'de', name: 'German', nativeName: 'Deutsch', support: 'full', rtl: false },
  { code: 'fr', name: 'French', nativeName: 'Français', support: 'full', rtl: false },
  { code: 'ar-MA', name: 'Arabic (Morocco, Moroccan Darija)', nativeName: 'العربية المغربية — الدارجة المغربية', support: 'limited', rtl: true },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', support: 'full', rtl: true },
];

describe('filterAgentLanguages', () => {
  it('returns everything for an empty query', () => {
    expect(filterAgentLanguages(langs, '  ')).toHaveLength(5);
  });
  it('finds Moroccan Arabic by country, dialect, native name and locale code', () => {
    for (const query of ['Arabic Morocco', 'Darija', 'الدارجة المغربية', 'ar_ma', 'ar-MA']) {
      expect(filterAgentLanguages(langs, query).map(l => l.code)).toEqual(['ar-MA']);
    }
  });
  it('matches English name, native name (diacritic-insensitive) and code', () => {
    expect(filterAgentLanguages(langs, 'germ').map((l) => l.code)).toEqual(['de']);
    expect(filterAgentLanguages(langs, 'francais').map((l) => l.code)).toEqual(['fr']);
    expect(filterAgentLanguages(langs, 'اردو').map((l) => l.code)).toEqual(['ur']);
    expect(filterAgentLanguages(langs, 'UR').map((l) => l.code)).toEqual(['ur']);
  });
});
