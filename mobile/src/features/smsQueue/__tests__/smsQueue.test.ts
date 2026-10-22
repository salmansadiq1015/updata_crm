import {
  buildQueue,
  counts,
  missingValues,
  nextIndex,
  personalize,
  setItem,
  unknownPlaceholders,
} from '../domain/smsQueue';

const lead = (id: string, over: Partial<{ name: string; city: string | null; hasNumber: boolean }> = {}) => ({
  id,
  name: 'Zafar Traders',
  city: 'Lahore',
  hasNumber: true,
  ...over,
});

describe('SMS queue', () => {
  it('fills {name} and {city}; a missing city leaves no dangling space or comma', () => {
    expect(personalize('Salam {name}, from {city}!', lead('a'))).toBe('Salam Zafar Traders, from Lahore!');
    expect(personalize('Hello {name}, {city}.', lead('a', { city: null }))).toBe('Hello Zafar Traders.');
    expect(personalize('Hi {name} in {city} !', lead('a', { city: '' }))).toBe('Hi Zafar Traders in!');
  });

  it('flags placeholders the app cannot fill instead of silently sending them', () => {
    expect(unknownPlaceholders('Hi {name}, your {offer} in {city} ({offer})')).toEqual(['offer']);
    expect(unknownPlaceholders('Hi {name}')).toEqual([]);
  });

  it('skips leads without a number and leads texted recently from this phone', () => {
    const items = buildQueue([lead('a'), lead('b', { hasNumber: false }), lead('c')], new Set(['c']));
    expect(items.map((i) => i.status)).toEqual(['pending', 'blocked', 'skipped']);
    expect(items[1]).toMatchObject({ detail: 'NO_NUMBER' });
    expect(items[2]).toMatchObject({ recentlyTexted: true });
    expect(nextIndex(items)).toBe(0);
  });

  it('advances and counts outcomes; an unknown result is never treated as pending again', () => {
    let items = buildQueue([lead('a'), lead('b'), lead('c')], new Set());
    items = setItem(items, 0, { status: 'sent' });
    items = setItem(items, 1, { status: 'unknown' });
    expect(nextIndex(items)).toBe(2);
    items = setItem(items, 2, { status: 'not_sent' });
    expect(nextIndex(items)).toBe(-1);
    expect(counts(items)).toMatchObject({ total: 3, sent: 1, unknown: 1, notSent: 1, pending: 0 });
  });

  it('lists leads whose placeholder value is empty, so the wording can be checked first', () => {
    expect(
      missingValues('Hi {name} from {city}', [lead('a'), lead('b', { name: 'Bilal', city: null })]),
    ).toEqual([{ placeholder: 'city', names: ['Bilal'] }]);
    expect(missingValues('Hi {name}', [lead('b', { city: null })])).toEqual([]);
  });
});
