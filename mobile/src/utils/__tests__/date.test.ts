import { formatDate, formatRelative } from '../date';

describe('date formatting', () => {
  const now = new Date('2026-10-16T12:00:00Z');

  it('formats relative times in the active language', () => {
    expect(formatRelative('2026-10-16T09:00:00Z', 'en', now)).toBe('3 hours ago');
    expect(formatRelative('2026-10-15T12:00:00Z', 'en', now)).toBe('yesterday');
    expect(formatRelative('2026-10-16T11:59:50Z', 'en', now)).toBe('now');
    expect(formatRelative('2026-10-15T12:00:00Z', 'de', now)).toBe('gestern');
  });

  it('returns null for missing or invalid dates instead of "Invalid Date"', () => {
    expect(formatDate(null, 'en')).toBeNull();
    expect(formatDate('garbage', 'en')).toBeNull();
    expect(formatRelative(undefined, 'en')).toBeNull();
  });

  it('formats absolute dates', () => {
    expect(formatDate('2026-10-12T10:00:00Z', 'en')).toBe('12 Oct 2026');
  });
});

describe('formatRelative without Intl.RelativeTimeFormat (Hermes on Android)', () => {
  const original = Intl.RelativeTimeFormat;
  afterEach(() => {
    Object.defineProperty(Intl, 'RelativeTimeFormat', {
      value: original,
      configurable: true,
      writable: true,
    });
  });

  it('falls back to an absolute date instead of throwing', () => {
    Object.defineProperty(Intl, 'RelativeTimeFormat', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const value = formatRelative('2026-10-12T09:30:00Z', 'en', new Date('2026-10-16T10:00:00Z'));
    expect(value).toMatch(/Oct/);
    expect(value).toMatch(/12/);
  });
});
