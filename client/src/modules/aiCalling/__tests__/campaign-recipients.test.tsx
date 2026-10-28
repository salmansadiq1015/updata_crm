// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ useRecipients: vi.fn(), removeRecipients: vi.fn() }));
vi.mock('../hooks/use-ai-calling', () => ({
  useRecipients: (...args: unknown[]) => mocks.useRecipients(...args),
  useRemoveRecipients: () => ({ mutate: mocks.removeRecipients, isPending: false }),
}));
// The call-review drawer is unrelated to this tab and pulls in heavy deps.
vi.mock('../ui/call-review-drawer', () => ({ CallReviewDrawer: () => null }));
vi.mock('@/shared/components/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm, title }: { open: boolean; onConfirm: () => void; title: string }) =>
    (open ? <div role="dialog" aria-label={title}><button type="button" onClick={onConfirm}>Confirm remove</button></div> : null),
}));

const recipient = (id: string, over: Record<string, unknown> = {}) => ({
  _id: id, state: 'ineligible', attemptCount: 0, qualification: null, finalDisposition: null, lastCallId: null,
  phoneSnapshot: '+41791234500', eligibility: { eligible: false, reasons: ['consent_required'] },
  leadId: { _id: `lead-${id}`, name: `Lead ${id}`, leadNumber: `L-${id}`, mobile: '+41791234500', phone: null, address: { city: 'Basel', country: 'CH' }, status: 'new' },
  ...over,
});

async function renderTab() {
  const { RecipientsTab } = await import('../ui/campaign-detail-drawer');
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <RecipientsTab campaignId="c1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RecipientsTab', () => {
  it('shows each recipient with phone, location and why it is ineligible', async () => {
    mocks.useRecipients.mockReturnValue({
      data: { data: [recipient('a')], pagination: { total: 1, pages: 1 } }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
    });
    await renderTab();
    expect(screen.getByText('Lead a')).toBeTruthy();
    expect(screen.getByRole('link', { name: /\+41791234500/ }).getAttribute('href')).toBe('tel:+41791234500');
    expect(screen.getByText(/Basel, CH/)).toBeTruthy();
    const consentLink = screen.getByRole('link', { name: /Call consent not recorded . record consent/ });
    expect(consentLink.getAttribute('href')).toBe('/leads?detail=lead-a');
  });

  it('multi-selects removable recipients, skips a mid-call one, and removes the selection', async () => {
    mocks.useRecipients.mockReturnValue({
      data: {
        data: [recipient('a'), recipient('b'), recipient('c', { state: 'in_progress', attemptCount: 1 })],
        pagination: { total: 3, pages: 1 },
      }, isLoading: false, isError: false, isFetching: false, refetch: vi.fn(),
    });
    await renderTab();

    // The in-progress recipient cannot be selected or removed.
    expect(screen.getByRole('checkbox', { name: 'Select Lead c' })).toBeDisabled();

    // Select-all only picks the two removable rows.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all removable recipients' }));
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Remove from campaign/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm remove' }));
    expect(mocks.removeRecipients).toHaveBeenCalledTimes(1);
    expect(mocks.removeRecipients.mock.calls[0][0].sort()).toEqual(['a', 'b']);
  });
});
