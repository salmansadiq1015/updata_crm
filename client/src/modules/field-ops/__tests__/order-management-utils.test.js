import { describe, expect, it } from 'vitest';
import {
  computeOrderListMetrics,
  computeStatusSummaryTotal,
  getNextSevenDayRange,
  getOrderDisplayNumber,
  isOrderOverdue,
  isOrderUnassigned,
} from '../utils/order-management-utils';

describe('order management utils', () => {
  const now = new Date('2026-06-29T10:00:00.000Z').getTime();

  it('detects visible-page operational risk metrics', () => {
    const metrics = computeOrderListMetrics([
      {
        id: 'a1',
        status: 'PLANNED',
        priority: 'URGENT',
        scheduled_start: '2026-06-28T08:00:00.000Z',
        scheduled_end: '2026-06-28T12:00:00.000Z',
        documents: [{ id: 'doc-1' }],
      },
      {
        id: 'a2',
        status: 'COMPLETED',
        priority: 'NORMAL',
        scheduled_start: '2026-06-29T08:00:00.000Z',
      },
      {
        id: 'a3',
        status: 'CONFIRMED',
        priority: 'HIGH',
        employeeId: { _id: 'u1' },
        scheduled_start: '2026-07-03T08:00:00.000Z',
      },
    ], now);

    expect(metrics.visible).toBe(3);
    expect(metrics.active).toBe(2);
    expect(metrics.completed).toBe(1);
    expect(metrics.highAttention).toBe(2);
    expect(metrics.urgent).toBe(1);
    expect(metrics.unassigned).toBe(1);
    expect(metrics.overdue).toBe(1);
    expect(metrics.dueToday).toBe(1);
    expect(metrics.upcoming7Days).toBe(1);
    expect(metrics.reportsPending).toBe(1);
    expect(metrics.documents).toBe(1);
    expect(metrics.completionRate).toBe(33);
  });

  it('does not mark completed orders overdue', () => {
    expect(isOrderOverdue({
      status: 'COMPLETED',
      scheduled_end: '2026-06-28T12:00:00.000Z',
    }, now)).toBe(false);
  });

  it('treats team and department targets as assigned work', () => {
    expect(isOrderUnassigned({
      assignmentTargetType: 'TEAM',
      assignmentTargetId: 'field-team-a',
    })).toBe(false);

    expect(isOrderUnassigned({
      employeeId: null,
      assignmentTargetType: 'EMPLOYEE',
    })).toBe(true);
  });

  it('summarizes status objects and formats order display numbers', () => {
    expect(computeStatusSummaryTotal({ PLANNED: 2, COMPLETED: '3', CANCELLED: null })).toBe(5);
    expect(getOrderDisplayNumber({ id: 'abcdef123456' })).toBe('123456');
    expect(getOrderDisplayNumber({ assignmentNumber: 'A-42', id: 'abcdef123456' })).toBe('A-42');
  });

  it('builds a stable seven day date range preset', () => {
    expect(getNextSevenDayRange(now)).toEqual({
      dateFrom: '2026-06-29',
      dateTo: '2026-07-05',
    });
  });
});
