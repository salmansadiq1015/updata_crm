import { describe, expect, it } from 'vitest';
import { campaignActions, fieldKeyFrom, progress, zonedLocalToIso } from '../sim-call-domain';

describe('sim call domain (web)', () => {
  it('offers only valid lifecycle actions', () => {
    expect(campaignActions('draft')).toEqual(['start', 'cancel']);
    expect(campaignActions('running')).toEqual(['pause', 'cancel', 'retry']);
    expect(campaignActions('paused')).toEqual(['resume', 'cancel', 'retry']);
    expect(campaignActions('completed')).toEqual(['retry']);
    expect(campaignActions('cancelled')).toEqual([]);
  });
  it('computes progress from server summaries', () => {
    expect(progress({ total: 8, completed: 3, skipped: 1, ineligible: 0, cancelled: 0 })).toEqual({ closed: 4, remaining: 4, percent: 50 });
    expect(progress({ total: 0, completed: 0, skipped: 0, ineligible: 0, cancelled: 0 }).percent).toBe(0);
  });
  it('converts a local callback time in an explicit timezone', () => {
    expect(zonedLocalToIso('2026-02-30T10:00', 'UTC')).toBeNull();
    expect(zonedLocalToIso('2026-10-21T25:00', 'UTC')).toBeNull();
    expect(zonedLocalToIso('2026-03-29T02:30', 'Europe/Zurich')).toBeNull();
    expect(zonedLocalToIso('2026-10-25T02:30', 'Europe/Zurich')).toBeNull();
    expect(zonedLocalToIso('2026-10-21T10:00', 'Asia/Karachi')).toBe('2026-10-21T05:00:00.000Z');
    expect(zonedLocalToIso('2026-10-26T10:00', 'Europe/Zurich')).toBe('2026-10-26T09:00:00.000Z');
    expect(zonedLocalToIso('2026-10-21', 'UTC')).toBeNull();
    expect(zonedLocalToIso('2026-10-21T10:00', 'Bad/Zone')).toBeNull();
  });
  it('builds unique server-valid field keys', () => {
    const taken = new Set(['budget']);
    expect(fieldKeyFrom('Budget', taken)).toBe('budget_2');
    expect(fieldKeyFrom('  Ist das der Inhaber?  ', new Set())).toBe('ist_das_der_inhaber');
    expect(fieldKeyFrom('***', new Set())).toBe('question');
  });
});
