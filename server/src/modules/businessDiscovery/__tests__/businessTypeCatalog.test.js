import { describe, test, expect } from '@jest/globals';
import {
  CATALOG,
  getType,
  isValidType,
  resolveProviderQuery,
  sanitizeCustomType,
  matchesProviderType,
} from '../businessTypeCatalog.js';

describe('CATALOG integrity', () => {
  const allTypes = CATALOG.flatMap((g) => g.types);

  test('covers the seven design groups', () => {
    const groups = CATALOG.map((g) => g.group);
    expect(groups).toEqual([
      'Food & Hospitality',
      'Healthcare',
      'Professional Services',
      'Retail',
      'Personal Services',
      'Education',
      'Construction / Industrial',
    ]);
  });

  test('every type has exactly one of includedType / textQuery and required fields', () => {
    for (const t of allTypes) {
      expect(typeof t.id).toBe('string');
      expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/); // kebab-case
      expect(typeof t.name).toBe('string');
      expect(typeof t.icon).toBe('string');
      expect(t.icon.length).toBeGreaterThan(0);
      const hasIncluded = typeof t.includedType === 'string';
      const hasText = typeof t.textQuery === 'string';
      expect(hasIncluded !== hasText).toBe(true); // exactly one
      if (hasIncluded) expect(t.includedType).toMatch(/^[a-z][a-z0-9_]*$/); // snake_case
    }
  });

  test('type ids are unique', () => {
    const ids = allTypes.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getType / isValidType', () => {
  test('getType returns an enriched entry', () => {
    const t = getType('restaurant');
    expect(t).toMatchObject({
      id: 'restaurant',
      name: 'Restaurant',
      group: 'Food & Hospitality',
      includedType: 'restaurant',
      i18nKey: 'leadgen.type.restaurant',
    });
  });

  test('getType with dashes builds an underscore i18n key', () => {
    expect(getType('medical-store').i18nKey).toBe('leadgen.type.medical_store');
  });

  test('unknown id → undefined / false', () => {
    expect(getType('nope')).toBeUndefined();
    expect(getType(123)).toBeUndefined();
    expect(isValidType('restaurant')).toBe(true);
    expect(isValidType('nope')).toBe(false);
  });
});

describe('resolveProviderQuery', () => {
  test('catalog type with structured type → includedType, no textQuery', () => {
    expect(resolveProviderQuery('restaurant')).toEqual({
      includedType: 'restaurant',
      typeId: 'restaurant',
      osmTags: [{ key: 'amenity', value: 'restaurant' }],
    });
  });

  test('design mapping: medical-store → pharmacy', () => {
    expect(resolveProviderQuery('medical-store')).toEqual({
      includedType: 'pharmacy',
      typeId: 'medical-store',
      osmTags: [
        { key: 'amenity', value: 'pharmacy' },
        { key: 'shop', value: 'chemist' },
      ],
    });
  });

  test('includedType + keyword → both (so searchText can honor the keyword)', () => {
    expect(resolveProviderQuery('restaurant', 'Italian')).toEqual({
      includedType: 'restaurant',
      textQuery: 'Restaurant Italian',
      typeId: 'restaurant',
      osmTags: [{ key: 'amenity', value: 'restaurant' }],
    });
  });

  test('catalog type without a structured mapping → textQuery', () => {
    expect(resolveProviderQuery('marketing-agency')).toEqual({
      textQuery: 'marketing agency',
      typeId: 'marketing-agency',
      osmTags: [
        { key: 'office', value: 'advertising_agency' },
        { key: 'office', value: 'marketing' },
      ],
    });
    expect(resolveProviderQuery('marketing-agency', 'b2b')).toEqual({
      textQuery: 'marketing agency b2b',
      typeId: 'marketing-agency',
      osmTags: [
        { key: 'office', value: 'advertising_agency' },
        { key: 'office', value: 'marketing' },
      ],
    });
  });

  test('custom / unsupported type → sanitized textQuery', () => {
    expect(resolveProviderQuery('Underwater Basket Weaving Studio')).toEqual({
      textQuery: 'Underwater Basket Weaving Studio',
      typeId: null,
      osmTags: [],
    });
    expect(resolveProviderQuery('yoga studio', 'hot')).toEqual({
      textQuery: 'yoga studio hot',
      typeId: null,
      osmTags: [],
    });
  });

  test('keyword alone still drives a text search', () => {
    expect(resolveProviderQuery('', 'vegan')).toEqual({
      textQuery: 'vegan',
      typeId: null,
      osmTags: [],
    });
  });

  test('nothing usable → throws INVALID_BUSINESS_TYPE', () => {
    let caught;
    try {
      resolveProviderQuery('', '');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught.code).toBe('INVALID_BUSINESS_TYPE');
  });
});

describe('matchesProviderType', () => {
  test('accepts restaurant subtypes but rejects unrelated primary businesses', () => {
    expect(matchesProviderType({ primaryType: 'italian_restaurant', types: ['italian_restaurant', 'restaurant'] }, 'restaurant')).toBe(true);
    expect(matchesProviderType({ primaryType: 'shopping_mall', types: ['shopping_mall', 'restaurant'] }, 'restaurant')).toBe(false);
    expect(matchesProviderType({ primaryType: 'hostel', types: ['hostel', 'restaurant'] }, 'restaurant')).toBe(false);
  });

  test('preserves secondary matching for non-hierarchical types', () => {
    expect(matchesProviderType({ primaryType: 'drugstore', types: ['drugstore', 'pharmacy'] }, 'pharmacy')).toBe(true);
    expect(matchesProviderType({ primaryType: 'store', types: ['store'] }, 'pharmacy')).toBe(false);
  });
});

describe('sanitizeCustomType', () => {
  test('trims and collapses whitespace', () => {
    expect(sanitizeCustomType('  Hello   World  ')).toBe('Hello World');
  });

  test('strips control and injection-risky characters', () => {
    const out = sanitizeCustomType('drop$table;{}<script>');
    expect(out).toBe('drop table script');
    for (const ch of ['$', ';', '{', '}', '<', '>']) {
      expect(out.includes(ch)).toBe(false);
    }
  });

  test('bounds length to 80 characters', () => {
    expect(sanitizeCustomType('a'.repeat(200))).toHaveLength(80);
  });

  test('empty / whitespace / non-string → null', () => {
    expect(sanitizeCustomType('   ')).toBeNull();
    expect(sanitizeCustomType('')).toBeNull();
    expect(sanitizeCustomType(null)).toBeNull();
    expect(sanitizeCustomType(42)).toBeNull();
  });
});
