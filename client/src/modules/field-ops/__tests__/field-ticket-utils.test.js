import { describe, expect, it } from 'vitest';
import {
  getTicketSearchText,
  isTicketOverdue,
  normalizeFieldTicketPage,
  userDisplayName,
} from '../utils/field-ticket-utils';

describe('field ticket utils', () => {
  it('normalizes paginated ticket envelopes', () => {
    const page = normalizeFieldTicketPage({
      items: [{ _id: 't1', title: 'Pump failure' }],
      pagination: { hasNext: true, nextCursor: 'abc', limit: 25 },
      summary: { total: 1, overdue: 0, escalated: 0, byStatus: { OPEN: 1 }, byPriority: { HIGH: 1 } },
    });

    expect(page.items).toHaveLength(1);
    expect(page.pagination.nextCursor).toBe('abc');
    expect(page.summary.byStatus.OPEN).toBe(1);
  });

  it('detects overdue non-completed tickets only', () => {
    const now = new Date('2026-06-19T10:00:00.000Z').getTime();
    expect(isTicketOverdue({ dueAt: '2026-06-18T10:00:00.000Z', status: 'OPEN' }, now)).toBe(true);
    expect(isTicketOverdue({ dueAt: '2026-06-18T10:00:00.000Z', status: 'COMPLETED' }, now)).toBe(false);
    expect(isTicketOverdue({ dueAt: '2026-06-20T10:00:00.000Z', status: 'OPEN' }, now)).toBe(false);
  });

  it('builds stable display and search values', () => {
    expect(userDisplayName({ firstName: 'Anna', lastName: 'Keller', email: 'anna@example.test' })).toBe('Anna Keller');
    expect(userDisplayName(null, 'Nicht zugewiesen')).toBe('Nicht zugewiesen');

    const text = getTicketSearchText({
      ticketNumber: 'FT-000010',
      title: 'Boiler outage',
      customerName: 'ACME AG',
      projectName: 'Heating upgrade',
    });
    expect(text).toContain('ft-000010');
    expect(text).toContain('acme ag');
    expect(text).toContain('heating upgrade');
  });
});
