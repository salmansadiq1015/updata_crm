import { describe, expect, it } from 'vitest';
import {
  calculateIntegrationSummary,
  filterIntegrations,
  getIntegrationOperationalState,
  normalizeIntegrationListResponse,
  normalizeSyncHistoryResponse,
} from '../utils/integration-dashboard-utils';

describe('integration dashboard utils', () => {
  const items = [
    { integrationKey: 'smtp_email', displayName: 'SMTP Email', provider: 'smtp', isEnabled: true, status: 'healthy', checksLast24h: 8, avgResponseTimeMs: 120, errorRate: 0 },
    { integrationKey: 'banking_camt', displayName: 'Banking CAMT', provider: 'camt', isEnabled: true, status: 'down', checksLast24h: 4, avgResponseTimeMs: 300, errorRate: 25, lastErrorMessage: 'Missing config' },
    { integrationKey: 'calendar_google', displayName: 'Google Calendar', provider: 'google', isEnabled: false, status: 'unknown', checksLast24h: 0, avgResponseTimeMs: 0, errorRate: 0 },
  ];

  it('normalizes list and sync API envelopes', () => {
    expect(normalizeIntegrationListResponse({ data: items })).toBe(items);
    expect(normalizeIntegrationListResponse(items)).toBe(items);
    expect(normalizeIntegrationListResponse({ data: { rows: items } })).toEqual([]);
    expect(normalizeSyncHistoryResponse({ data: [{ id: 's1' }], pagination: { hasNext: false } })).toEqual({
      items: [{ id: 's1' }],
      pagination: { hasNext: false },
    });
  });

  it('calculates operational summary metrics', () => {
    expect(calculateIntegrationSummary(items)).toEqual({
      total: 3,
      enabled: 2,
      healthy: 1,
      disabled: 1,
      issues: 1,
      unknown: 1,
      checksLast24h: 12,
      avgResponseTimeMs: 140,
      averageErrorRate: 8,
      uptimePercent: 33,
    });
  });

  it('filters by search, status, active, issues, and disabled', () => {
    expect(filterIntegrations(items, { search: 'smtp', status: 'all' })).toHaveLength(1);
    expect(filterIntegrations(items, { status: 'active' })).toHaveLength(2);
    expect(filterIntegrations(items, { status: 'issues' })).toHaveLength(1);
    expect(filterIntegrations(items, { status: 'disabled' })).toHaveLength(1);
    expect(filterIntegrations(items, { search: 'missing', status: 'issues' })[0].integrationKey).toBe('banking_camt');
  });

  it('maps operational states for visual treatment', () => {
    expect(getIntegrationOperationalState(items[0])).toBe('operational');
    expect(getIntegrationOperationalState(items[1])).toBe('attention');
    expect(getIntegrationOperationalState(items[2])).toBe('disabled');
    expect(getIntegrationOperationalState(null)).toBe('unknown');
  });
});
