import { describe, expect, it } from 'vitest';
import {
  activeHistoryFilterCount, buildProviderHistoryParams, isHistoryDateRangeValid,
} from '../ui/provider-history-filters';

describe('provider history filters', () => {
  it('sends only explicit filters and preserves campaign scope', () => {
    expect(buildProviderHistoryParams({
      page: 2,
      channel: 'sms',
      status: 'delivered',
      provider: 'twilio',
      campaignId: '507f1f77bcf86cd799439011',
      from: '2026-09-01',
      to: '2026-09-30',
    })).toEqual({
      page: 2,
      channel: 'sms',
      status: 'delivered',
      provider: 'twilio',
      campaignId: '507f1f77bcf86cd799439011',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-30T23:59:59.999Z',
    });
  });

  it('never sends placeholder values as API filters', () => {
    expect(buildProviderHistoryParams({
      page: 1, channel: 'all', status: 'all', provider: 'all', campaignId: 'all', from: '', to: '',
    })).toEqual({ page: 1 });
  });

  it('counts active filters and rejects an inverted date range', () => {
    expect(activeHistoryFilterCount({
      channel: 'email', status: 'all', provider: 'existing_email', campaignId: 'all', from: '2026-10-01', to: '',
    })).toBe(3);
    expect(isHistoryDateRangeValid('2026-10-12', '2026-10-01')).toBe(false);
    expect(isHistoryDateRangeValid('2026-10-01', '2026-10-12')).toBe(true);
  });
});
