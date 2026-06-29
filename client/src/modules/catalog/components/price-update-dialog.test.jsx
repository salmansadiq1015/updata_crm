import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi, beforeEach } from 'vitest';

const mutationMocks = vi.hoisted(() => ({
  preview: vi.fn(),
  update: vi.fn(),
  schedule: vi.fn(),
}));

vi.mock('../hooks/use-price-mutations', () => ({
  usePriceMutations: () => ({
    previewPrices: { mutateAsync: mutationMocks.preview, isPending: false, error: null },
    updatePrices: { mutateAsync: mutationMocks.update, isPending: false, error: null },
    schedulePrices: { mutateAsync: mutationMocks.schedule, isPending: false, error: null },
  }),
}));

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({
    t: (key, fallback, vars) => {
      const dict = {
        'catalog.article': 'Article',
        'catalog.prices.update': 'Update Prices',
        'catalog.prices.updateSubtitle': 'Review and apply price changes.',
        'catalog.prices.selectedCount': '{count} articles selected',
        'catalog.prices.affectedArticles': 'Affected articles',
        'catalog.prices.currentAverage': 'Current average',
        'catalog.prices.projectedAverage': 'Projected average',
        'catalog.prices.fixedPrice': 'Fixed price',
        'catalog.prices.percentage': 'Percentage',
        'catalog.prices.schedule': 'Schedule Price Change',
        'catalog.prices.fixedModeDescription': 'Set one price.',
        'catalog.prices.percentageModeDescription': 'Adjust by percent.',
        'catalog.prices.scheduleModeDescription': 'Schedule by percent.',
        'catalog.prices.previewRequired': 'Preview required',
        'catalog.prices.adjustmentDetails': 'Adjustment details',
        'catalog.prices.newPriceChf': 'New Price (CHF)',
        'catalog.prices.percentageValue': 'Percentage (%)',
        'catalog.prices.valueHelperFixed': 'Replace the base price.',
        'catalog.prices.valueHelperPercentage': 'Increase or reduce prices.',
        'catalog.prices.valueHelperSchedule': 'Apply on the date.',
        'catalog.prices.effectiveDate': 'Effective Date',
        'catalog.prices.effectiveDateHelper': 'Future date only.',
        'catalog.prices.impactSummary': 'Impact summary',
        'catalog.prices.mode': 'Mode',
        'catalog.prices.previewReady': 'Preview ready',
        'catalog.prices.pendingPreview': 'Not reviewed',
        'catalog.prices.previewDescription': 'Review calculated prices.',
        'catalog.prices.generatingPreview': 'Generating preview...',
        'catalog.prices.previewChanges': 'Preview changes',
        'catalog.prices.noPreviewTitle': 'No preview yet',
        'catalog.prices.noPreviewDescription': 'Generate a preview.',
        'catalog.prices.emptyPreview': 'No rows.',
        'catalog.prices.oldPrice': 'Old Price',
        'catalog.prices.newPrice': 'New Price',
        'catalog.prices.delta': 'Delta',
        'catalog.prices.previewReadyDescription': 'Preview is current.',
        'catalog.prices.previewRequiredDescription': 'Generate a preview first.',
        'catalog.prices.applyNow': 'Apply now',
        'catalog.prices.scheduleUpdate': 'Confirm schedule',
        'catalog.prices.applying': 'Applying...',
        'catalog.prices.operationFailed': 'Price action failed',
        'catalog.prices.operationFailedDescription': 'Try again.',
        'catalog.prices.errorPricePositive': 'Price must be greater than 0.',
        'catalog.prices.errorPercentageRange': 'Percentage must be between -99 and 999.',
        'catalog.prices.errorScheduledPercentage': 'Scheduled percentage is invalid.',
        'catalog.prices.errorEffectiveDateRequired': 'Effective date is required.',
        'catalog.prices.errorEffectiveDateFuture': 'Effective date must be in the future.',
        'common.cancel': 'Cancel',
        'common.preview': 'Preview',
      };
      const value = dict[key] || fallback || key;
      return vars ? value.replace(/\{(\w+)\}/g, (_, name) => String(vars[name])) : value;
    },
  }),
}));

import { PriceUpdateDialog } from './price-update-dialog';

const selectedArticles = [
  { _id: 'a1', articleNumber: 'A-1', basePrice: 10 },
  { _id: 'a2', articleNumber: 'A-2', basePrice: 20 },
];

describe('PriceUpdateDialog', () => {
  beforeAll(() => {
    vi.stubGlobal('ResizeObserver', class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
  });

  beforeEach(() => {
    mutationMocks.preview.mockReset();
    mutationMocks.update.mockReset();
    mutationMocks.schedule.mockReset();
    mutationMocks.preview.mockResolvedValue({
      data: {
        rows: [
          { articleId: 'a1', articleNumber: 'A-1', oldPrice: 10, newPrice: 25, delta: 15 },
        ],
      },
    });
  });

  it('renders the upgraded price workflow with computed averages', () => {
    render(<PriceUpdateDialog open onClose={() => {}} selectedArticles={selectedArticles} />);

    expect(screen.getByText('Update Prices')).toBeInTheDocument();
    expect(screen.getByText('2 articles selected')).toBeInTheDocument();
    expect(screen.getAllByText('Current average').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15.00 CHF').length).toBeGreaterThan(0);
    expect(screen.getByText('No preview yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply now/i })).toBeDisabled();
  });

  it('generates preview rows before enabling confirmation', async () => {
    const user = userEvent.setup();
    render(<PriceUpdateDialog open onClose={() => {}} selectedArticles={selectedArticles} />);

    await user.type(screen.getByLabelText('New Price (CHF)'), '25');
    await user.click(screen.getAllByRole('button', { name: /preview changes/i })[0]);

    await waitFor(() => expect(mutationMocks.preview).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('A-1')).toBeInTheDocument();
    expect(screen.getByText('+15.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /apply now/i })).toBeEnabled();
  });
});
