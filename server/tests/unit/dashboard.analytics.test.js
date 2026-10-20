import { describe, expect, jest, test } from '@jest/globals';
import {
  calculateDelta,
  fillTimeline,
  getAnalyticsSnapshot,
  getMobileCrmStats,
  normalizeAnalyticsFilters,
} from '../../src/modules/dashboard/dashboard.service.js';

function aggregateModel(result, error = null) {
  return {
    aggregate: jest.fn(() => {
      if (error) throw error;
      return Promise.resolve(result);
    }),
  };
}

function auditModel(result) {
  return {
    aggregate: jest.fn(() => Promise.resolve(result)),
    find: jest.fn(() => ({
      sort: () => ({
        limit: () => ({
          select: () => ({
            lean: () => Promise.resolve([]),
          }),
        }),
      }),
    })),
  };
}

const EMPTY_FACET = [{}];

function buildModels(overrides = {}) {
  return {
    Customer: aggregateModel(EMPTY_FACET),
    Project: aggregateModel(EMPTY_FACET),
    Quotation: aggregateModel(EMPTY_FACET),
    Order: aggregateModel(EMPTY_FACET),
    Invoice: aggregateModel(EMPTY_FACET),
    Task: aggregateModel(EMPTY_FACET),
    Assignment: aggregateModel(EMPTY_FACET),
    ApInvoice: aggregateModel(EMPTY_FACET),
    BankTransaction: aggregateModel(EMPTY_FACET),
    JournalEntry: aggregateModel(EMPTY_FACET),
    User: aggregateModel(EMPTY_FACET),
    AuditLog: auditModel(EMPTY_FACET),
    ...overrides,
  };
}

describe('dashboard analytics service', () => {
  test('builds a permission-scoped mobile CRM snapshot from real model counts', async () => {
    const Lead = aggregateModel([
      { _id: 'new', count: 7 },
      { _id: 'contacted', count: 4 },
      { _id: 'qualified', count: 3 },
      { _id: 'converted', count: 1 },
    ]);
    const CallCampaign = { countDocuments: jest.fn().mockResolvedValue(2) };
    const CallRecord = { countDocuments: jest.fn().mockResolvedValue(9) };

    const snapshot = await getMobileCrmStats('64b7f0c2a1b2c3d4e5f60701', {
      now: new Date('2026-10-19T12:00:00.000Z'),
      models: { Lead, CallCampaign, CallRecord },
    });

    expect(snapshot).toEqual(expect.objectContaining({
      leads: { total: 15, new: 7, contacted: 4, qualified: 3, unqualified: 0, converted: 1 },
      qualificationRate: 0.2,
      conversionRate: 0.067,
      activeCampaigns: 2,
      callsCompletedToday: 9,
    }));
    expect(CallCampaign.countDocuments).toHaveBeenCalledWith(expect.objectContaining({
      isTest: false,
      status: { $in: ['scheduled', 'running', 'paused'] },
    }));
    expect(CallRecord.countDocuments).toHaveBeenCalledWith(expect.objectContaining({ isTest: false }));
  });

  test('normalizes analytics filters with safe defaults', () => {
    const filters = normalizeAnalyticsFilters(
      { range: 'unknown', granularity: 'hour' },
      new Date('2026-06-30T12:00:00.000Z'),
    );

    expect(filters.range).toBe('30d');
    expect(filters.granularity).toBe('day');
    expect(filters.startDate.getHours()).toBe(0);
    expect(filters.endDate.getHours()).toBe(23);
    expect(Math.ceil((filters.endDate - filters.startDate) / (24 * 60 * 60 * 1000))).toBe(30);
  });

  test('fills missing timeline buckets without dropping known values', () => {
    const filters = normalizeAnalyticsFilters(
      { range: '7d', granularity: 'day' },
      new Date('2026-06-30T12:00:00.000Z'),
    );

    const timeline = fillTimeline(
      [{ _id: '2026-06-30', revenue: 2500, invoices: 2 }],
      filters,
      ['revenue', 'invoices'],
    );

    expect(timeline).toHaveLength(7);
    expect(timeline.at(-1)).toEqual(expect.objectContaining({
      key: '2026-06-30',
      revenue: 2500,
      invoices: 2,
    }));
    expect(timeline[0]).toEqual(expect.objectContaining({ revenue: 0, invoices: 0 }));
  });

  test('calculates stable deltas for zero and non-zero previous values', () => {
    expect(calculateDelta(10, 0)).toBe(100);
    expect(calculateDelta(0, 0)).toBe(0);
    expect(calculateDelta(75, 100)).toBe(-25);
  });

  test('returns partial analytics with source warnings when one source fails', async () => {
    const snapshot = await getAnalyticsSnapshot(
      { range: '7d', granularity: 'day' },
      {
        now: new Date('2026-06-30T12:00:00.000Z'),
        models: buildModels({
          Customer: aggregateModel(EMPTY_FACET, new Error('customers unavailable')),
        }),
      },
    );

    expect(snapshot.warnings).toEqual([
      expect.objectContaining({ source: 'customers', message: 'customers unavailable' }),
    ]);
    expect(snapshot.overview.kpis).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'customers', value: 0 }),
    ]));
  });
});
