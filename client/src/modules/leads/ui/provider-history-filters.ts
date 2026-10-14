import type { OutreachChannel } from '../services/messaging-api';

export type ProviderHistoryFilters = {
  page: number;
  channel: OutreachChannel | 'all';
  status: string;
  provider: string;
  campaignId: string;
  from: string;
  to: string;
};

export function isHistoryDateRangeValid(from: string, to: string) {
  return !from || !to || from <= to;
}

export function activeHistoryFilterCount(filters: Omit<ProviderHistoryFilters, 'page'>) {
  return [filters.channel, filters.status, filters.provider, filters.campaignId]
    .filter((value) => value !== 'all').length + Number(Boolean(filters.from)) + Number(Boolean(filters.to));
}

export function buildProviderHistoryParams(filters: ProviderHistoryFilters) {
  return {
    page: filters.page,
    ...(filters.channel !== 'all' ? { channel: filters.channel } : {}),
    ...(filters.status !== 'all' ? { status: filters.status } : {}),
    ...(filters.provider !== 'all' ? { provider: filters.provider } : {}),
    ...(filters.campaignId !== 'all' ? { campaignId: filters.campaignId } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
  };
}
