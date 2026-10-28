import { describe, expect, it } from 'vitest';
import { localDateTimeToIso } from '../schedule-time';

describe('explicit campaign timezones', () => {
  it('converts local time without relying on the browser timezone', () => {
    expect(localDateTimeToIso('2030-11-04T09:00', 'Asia/Karachi')).toBe('2030-11-04T04:00:00.000Z');
    expect(localDateTimeToIso('2030-11-04T09:00', 'Asia/Kolkata')).toBe('2030-11-04T03:30:00.000Z');
    expect(localDateTimeToIso('2026-07-01T09:00', 'America/New_York')).toBe('2026-07-01T13:00:00.000Z');
    expect(localDateTimeToIso('2026-12-01T09:00', 'America/New_York')).toBe('2026-12-01T14:00:00.000Z');
  });
  it('rejects invalid zones, missing times, spring gaps and ambiguous autumn times', () => {
    expect(() => localDateTimeToIso('', 'UTC')).toThrow(/Choose/);
    expect(() => localDateTimeToIso('2026-12-01T09:00', 'bad/zone')).toThrow(/valid timezone/);
    expect(() => localDateTimeToIso('2026-03-08T02:30', 'America/New_York')).toThrow(/does not exist/);
    expect(() => localDateTimeToIso('2026-11-01T01:30', 'America/New_York')).toThrow(/twice/);
  });
});
