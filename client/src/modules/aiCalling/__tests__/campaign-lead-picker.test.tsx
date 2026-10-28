// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Lead } from '@/modules/leads/types/lead-types';

const mocks = vi.hoisted(() => ({ listLeads: vi.fn(), getLead: vi.fn() }));
vi.mock('@/modules/leads/services/lead-api', () => ({
  leadApi: { listLeads: mocks.listLeads, getLead: mocks.getLead },
}));

const lead = (id: string, over: Partial<Lead> = {}): Lead => ({
  id, leadNumber: `L-${id}`, name: `Lead ${id}`, normalizedName: null, type: 'business', status: 'new',
  address: { street: 'Mall Road 1', addressSupplement: null, area: 'Gulberg', postalCode: null, city: 'Lahore', canton: null, region: null, country: 'PK', formatted: null },
  phone: '+92300000' + id.padStart(4, '0'), mobile: null, normalizedPhone: null, email: null, website: null, websiteDomain: null,
  location: null,
  providerMeta: { rating: null, reviewCount: null, priceLevel: null, ratingDistribution: null, businessStatus: null, openingHours: null, photos: [], mapsUrl: null },
  source: 'manual',
  sourceMetadata: { googlePlaceId: null, discoverySessionId: null, discoveryResultId: null, businessType: 'restaurant', keyword: null, discoveredAt: null },
  assignedTo: null, notes: null, tags: [], convertedCustomerId: null, convertedAt: null, createdBy: null,
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  ...over,
} as Lead);

const page = (data: Lead[], nextCursor: string | null = null, total?: number) => ({
  data, pagination: { hasNext: Boolean(nextCursor), nextCursor, limit: data.length, total },
});

async function renderPicker() {
  const { CampaignLeadPicker } = await import('../ui/campaign-lead-picker');
  const changes: Map<string, Lead>[] = [];
  function Harness() {
    const [selected, setSelected] = useState<Map<string, Lead>>(new Map());
    return <CampaignLeadPicker selected={selected} onChange={(next) => { changes.push(next); setSelected(next); }} />;
  }
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Harness />
    </QueryClientProvider>,
  );
  return changes;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('CampaignLeadPicker', () => {
  it('lists leads, selects reachable ones and blocks leads without a phone', async () => {
    mocks.listLeads.mockResolvedValue(page([lead('1'), lead('2', { phone: null, name: 'No Phone Bistro' })], null, 2));
    await renderPicker();

    expect(await screen.findByText('Lead 1')).toBeTruthy();
    expect(screen.getByText('2 matching')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Select No Phone Bistro' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lead 1' }));
    expect(screen.getByText('1 / 500 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lead 1' }));
    expect(screen.getByText('0 / 500 selected')).toBeTruthy();
  });

  it('opens a lead with everything on record and adds it from the details', async () => {
    mocks.listLeads.mockResolvedValue(page([lead('1')]));
    mocks.getLead.mockResolvedValue(lead('1', {
      email: 'owner@lead1.pk', website: 'https://lead1.pk', notes: 'Prefers mornings', tags: ['vip'],
      providerMeta: { rating: 4.6, reviewCount: 120, priceLevel: null, ratingDistribution: null, businessStatus: 'Open', openingHours: ['Mon: 9–5'], photos: [], mapsUrl: null },
    }));
    await renderPicker();

    fireEvent.click(await screen.findByRole('button', { name: 'Show details for Lead 1' }));
    const details = await screen.findByRole('region', { name: 'Lead details: Lead 1' });
    await waitFor(() => expect(details).toHaveTextContent('owner@lead1.pk'));
    expect(mocks.getLead).toHaveBeenCalledWith('1');
    expect(details).toHaveTextContent('4.6 (120 reviews) · Open');
    expect(details).toHaveTextContent('Prefers mornings');
    expect(details).toHaveTextContent('Mon: 9–5');

    fireEvent.click(screen.getByRole('button', { name: /Add to campaign/ }));
    expect(screen.getByText('1 / 500 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Remove from campaign/ })).toBeTruthy();
  });

  it('"Select all matching" pages through the list and stops at 500', async () => {
    const batch = (from: number, n: number) => Array.from({ length: n }, (_, i) => lead(String(from + i)));
    mocks.listLeads.mockImplementation(async ({ cursor, limit }: { cursor?: string | null; limit: number }) => {
      if (limit === 50) return page(batch(1, 50), 'c1', 700);
      const at = Number(cursor || 0);
      return page(batch(at * 100 + 1, 100), at < 6 ? String(at + 1) : null, 700);
    });
    const changes = await renderPicker();
    await screen.findByText('Lead 1');

    fireEvent.click(screen.getByRole('button', { name: /Select all matching/ }));
    await waitFor(() => expect(screen.getByText('500 / 500 selected')).toBeTruthy());
    expect(changes.at(-1)?.size).toBe(500);
    expect(screen.getByRole('status')).toHaveTextContent('stopped at the 500-lead limit');
    // Bulk paging stopped once the cap was reached (5 pages of 100), not at the end of the list.
    expect(mocks.listLeads.mock.calls.filter(([p]) => p.limit === 100)).toHaveLength(5);
    expect(screen.getByRole('checkbox', { name: 'Select Lead 1' })).toBeChecked();
  });
});
