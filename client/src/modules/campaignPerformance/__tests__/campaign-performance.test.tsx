// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { makeT } from '@/modules/governance/__tests__/test-i18n';
import type { AttributionReport, AttributionRow } from '../types/attribution-types';

const mocks = vi.hoisted(() => ({ report: vi.fn(), exportCsv: vi.fn(), download: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: makeT(), locale: 'en' }) }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/api/download', () => ({ downloadBlob: mocks.download }));
vi.mock('../services/attribution-api', () => ({ attributionApi: mocks }));

const { CampaignPerformanceView, groupLabel } = await import('../ui/campaign-performance-view');

const excluded = (o: Partial<AttributionRow['excluded']> = {}) => ({ touchesCostNotRecorded: 0, conversionsRevenueNotRecorded: 0, currenciesWithoutRate: [], ...o });
const row = (o: Partial<AttributionRow>): AttributionRow => ({
  key: 'k', label: null, touches: 1, leadsTouched: 1, qualifiedLeads: 0, convertedLeads: 0, qualifiedCredit: 0, convertedCredit: 0,
  spend: 0, spendByCurrency: {}, revenue: 0, revenueByCurrency: {}, costPerQualifiedLead: null, costPerConversion: null,
  profit: 0, roi: null, excluded: excluded(), ...o,
});
const report: AttributionReport = {
  period: { from: '2026-10-01T00:00:00Z', to: '2026-10-30T00:00:00Z' }, groupBy: 'campaign', model: 'linear', currency: 'CHF',
  rows: [
    row({ key: 'ai_call:1', label: 'October AI wave', touches: 4, leadsTouched: 3, qualifiedCredit: 1.5, convertedCredit: 0.5, spend: 12.5, revenue: 500, costPerQualifiedLead: 8.33, costPerConversion: 25, profit: 487.5, roi: 39 }),
    row({ key: 'sim_sms:2', label: 'SMS wave', spend: null, revenue: null, profit: null, convertedCredit: 0.5, excluded: excluded({ touchesCostNotRecorded: 6, conversionsRevenueNotRecorded: 1 }) }),
  ],
  totals: row({ key: 'total', touches: 10, leadsTouched: 4, qualifiedLeads: 2, convertedLeads: 1, spend: 12.5, revenue: 500, profit: 487.5, roi: 39, costPerQualifiedLead: 6.25, costPerConversion: 12.5, excluded: excluded({ touchesCostNotRecorded: 6 }) }),
  timeline: [{ date: '2026-10-10', touches: 4, spend: 12.5, touchesCostNotRecorded: 0 }],
  excluded: { leadsTouchedOnlyAfterConversion: 1, touchesOutsideLeadScope: 0, truncatedSources: [] },
  exchangeRates: [{ from: 'USD', to: 'CHF', rate: null, missing: true }],
  assumptions: { leadAccessMode: 'company', simSmsCostRecorded: false, revenueBasis: 'invoice_subtotal_excl_vat' },
};

const renderIt = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><CampaignPerformanceView /></QueryClientProvider>);

beforeEach(() => { vi.clearAllMocks(); mocks.report.mockResolvedValue(report); mocks.exportCsv.mockResolvedValue(new Blob(['x'])); });

describe('campaign performance', () => {
  it('shows recorded figures and labels missing data as "not recorded" with counts', async () => {
    renderIt();
    const table = await screen.findByRole('table');
    const sms = within(table).getByText('SMS wave').closest('tr') as HTMLElement;
    expect(within(sms).getAllByText('not recorded').length).toBe(3);
    expect(within(sms).getByText('6 without cost · 1 without revenue')).toBeTruthy();
    expect(screen.getByText('6 touches without recorded cost')).toBeTruthy();
    expect(screen.getByText(/No recorded exchange rate for USD→CHF/)).toBeTruthy();
    expect(screen.getByText(/SIM SMS cost is not recorded/)).toBeTruthy();
    expect(screen.getByText(/1 converted lead\(s\) were only touched after converting/)).toBeTruthy();
  });

  it('re-queries when the grouping and model change, and exports CSV', async () => {
    renderIt();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('radio', { name: 'Channel' }));
    fireEvent.click(screen.getByRole('radio', { name: 'First touch' }));
    await waitFor(() => expect(mocks.report).toHaveBeenLastCalledWith(expect.objectContaining({ groupBy: 'channel', model: 'first', currency: 'CHF' })));
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalled());
  });

  it('labels unnamed groups readably', () => {
    const t = makeT();
    expect(groupLabel({ key: 'sim_sms', label: null }, 'channel', t)).toBe('SIM SMS campaign');
    expect(groupLabel({ key: 'manual', label: null }, 'campaign', t)).toBe('Manual contact (no campaign)');
    expect(groupLabel({ key: 'source:google_places', label: null }, 'campaign', t)).toBe('Lead source: google_places');
  });
});
