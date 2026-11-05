import type { FollowUp } from '../types';
import { formatFollowUpTime, groupFollowUps } from '../utils/grouping';

const item = (id: string, at: Date | string): FollowUp => ({
  contactLogId: id,
  followUpId: null,
  automation: null,
  leadId: `lead-${id}`,
  leadNumber: null,
  leadName: `Lead ${id}`,
  followUpAt: typeof at === 'string' ? at : at.toISOString(),
  followUpTimezone: null,
  channel: 'phone',
  subject: null,
  note: null,
});

// Local-time constructors: grouping is by the DEVICE's day, whatever its zone.
const local = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute);
const NOW = local(16, 14, 0);

describe('groupFollowUps', () => {
  it('splits into overdue / today / upcoming by local day, each ascending', () => {
    const groups = groupFollowUps(
      [
        item('tomorrow-early', local(17, 0, 0)),
        item('today-late', local(16, 23, 59)),
        item('earlier-today', local(16, 9, 0)),
        item('last-week', local(9, 10, 0)),
        item('today-soon', local(16, 15, 0)),
        item('next-week', local(23, 8, 0)),
      ],
      NOW,
    );
    expect(groups.overdue.map((f) => f.contactLogId)).toEqual(['last-week', 'earlier-today']);
    expect(groups.today.map((f) => f.contactLogId)).toEqual(['today-soon', 'today-late']);
    expect(groups.upcoming.map((f) => f.contactLogId)).toEqual(['tomorrow-early', 'next-week']);
  });

  it('treats a follow-up due exactly now as today, and drops unparseable dates', () => {
    const groups = groupFollowUps([item('now', NOW), item('bad', 'not-a-date')], NOW);
    expect(groups.today.map((f) => f.contactLogId)).toEqual(['now']);
    expect(groups.overdue).toEqual([]);
    expect(groups.upcoming).toEqual([]);
  });

  it('is empty for no items', () => {
    expect(groupFollowUps([], NOW)).toEqual({ overdue: [], today: [], upcoming: [] });
  });
});

describe('formatFollowUpTime', () => {
  it('formats in the device zone with weekday, date and time', () => {
    const text = formatFollowUpTime(local(16, 14, 30).toISOString(), 'en');
    expect(text).toMatch(/16/);
    expect(text).toMatch(/14:30/);
    expect(formatFollowUpTime('nope', 'en')).toBe('');
  });
});
