import { describe, expect, it } from '@jest/globals';
import recurrenceService from '../recurrence.service.js';

describe('recurrenceService.generateOccurrences', () => {
  it('generates weekly occurrences using AFTER_COUNT including the first assignment', () => {
    const occurrences = recurrenceService.generateOccurrences(
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T10:00:00.000Z'),
      { frequency: 'WEEKLY', interval: 1, endType: 'AFTER_COUNT', endCount: 3 },
    );

    expect(occurrences).toHaveLength(3);
    expect(occurrences.map((item) => item.startDatetime.toISOString())).toEqual([
      '2026-06-01T08:00:00.000Z',
      '2026-06-08T08:00:00.000Z',
      '2026-06-15T08:00:00.000Z',
    ]);
    expect(occurrences[2].recurrenceIndex).toBe(2);
  });

  it('stops daily occurrences at the until date', () => {
    const occurrences = recurrenceService.generateOccurrences(
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T09:00:00.000Z'),
      { frequency: 'DAILY', interval: 1, endType: 'UNTIL_DATE', endDate: '2026-06-03' },
    );

    expect(occurrences.map((item) => item.startDatetime.toISOString())).toEqual([
      '2026-06-01T08:00:00.000Z',
      '2026-06-02T08:00:00.000Z',
      '2026-06-03T08:00:00.000Z',
    ]);
  });

  it('supports custom weekday recurrence', () => {
    const occurrences = recurrenceService.generateOccurrences(
      new Date('2026-06-01T08:00:00.000Z'),
      new Date('2026-06-01T09:00:00.000Z'),
      { frequency: 'CUSTOM', interval: 1, daysOfWeek: 'MO,WE', endType: 'AFTER_COUNT', endCount: 4 },
    );

    expect(occurrences.map((item) => item.startDatetime.toISOString())).toEqual([
      '2026-06-01T08:00:00.000Z',
      '2026-06-03T08:00:00.000Z',
      '2026-06-08T08:00:00.000Z',
      '2026-06-10T08:00:00.000Z',
    ]);
  });
});
