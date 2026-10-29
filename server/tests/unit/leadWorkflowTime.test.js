import { describe, expect, it } from '@jest/globals';
import {
  addBusinessMinutes, isValidTimezone, startOfNextZonedDay, zonedParts,
} from '../../src/modules/crm/leadWorkflowTime.js';

const ZRH = { enabled: true, timezone: 'Europe/Zurich', days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00' };

describe('lead workflow time helpers', () => {
  it('validates IANA zones', () => {
    expect(isValidTimezone('Europe/Zurich')).toBe(true);
    expect(isValidTimezone('Mars/Base')).toBe(false);
    expect(isValidTimezone('')).toBe(false);
  });

  it('adds wall-clock minutes without business hours', () => {
    expect(addBusinessMinutes(new Date('2026-10-30T15:00:00Z'), 120).toISOString()).toBe('2026-10-30T17:00:00.000Z');
  });

  it('carries over a Friday afternoon into Monday morning (Zurich, after DST end)', () => {
    // Fri 16:00 local (UTC+1) + 2 business hours → Mon 09:00 local
    expect(addBusinessMinutes(new Date('2026-10-30T15:00:00Z'), 120, ZRH).toISOString()).toBe('2026-11-02T08:00:00.000Z');
  });

  it('starts counting at opening time when assigned before hours or on a weekend', () => {
    expect(addBusinessMinutes(new Date('2026-10-29T06:00:00Z'), 30, ZRH).toISOString()).toBe('2026-10-29T07:30:00.000Z');
    expect(addBusinessMinutes(new Date('2026-10-24T20:00:00Z'), 60, ZRH).toISOString()).toBe('2026-10-26T08:00:00.000Z');
  });

  it('handles summer time (UTC+2) days', () => {
    // Wed 2026-07-01 16:30 local (14:30Z) + 60 → Thu 08:30 local (06:30Z)
    expect(addBusinessMinutes(new Date('2026-07-01T14:30:00Z'), 60, ZRH).toISOString()).toBe('2026-07-02T06:30:00.000Z');
  });

  it('finds the next local midnight across a DST change', () => {
    expect(startOfNextZonedDay(new Date('2026-10-24T23:30:00Z'), 'Europe/Zurich').toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(zonedParts(new Date('2026-10-29T10:00:00Z'), 'Asia/Karachi')).toMatchObject({ isoWeekday: 4, minuteOfDay: 15 * 60 });
  });

  it('falls back to wall-clock time for an unusable configuration', () => {
    expect(addBusinessMinutes(new Date('2026-10-30T15:00:00Z'), 60, { ...ZRH, days: [] }).toISOString()).toBe('2026-10-30T16:00:00.000Z');
    expect(addBusinessMinutes(new Date('2026-10-30T15:00:00Z'), 60, { ...ZRH, start: '18:00', end: '09:00' }).toISOString()).toBe('2026-10-30T16:00:00.000Z');
  });
});
