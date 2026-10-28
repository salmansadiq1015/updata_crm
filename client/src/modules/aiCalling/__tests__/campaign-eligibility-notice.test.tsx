// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ usePreviewEligibility: vi.fn(), useRecipients: vi.fn(), removeRecipients: vi.fn() }));
vi.mock('../hooks/use-ai-calling', () => ({
  usePreviewEligibility: (...a: unknown[]) => mocks.usePreviewEligibility(...a),
  useRecipients: (...a: unknown[]) => mocks.useRecipients(...a),
  useRemoveRecipients: () => ({ mutate: mocks.removeRecipients, isPending: false }),
}));
vi.mock('@/shared/components/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }: { open: boolean; onConfirm: () => void }) =>
    (open ? <button type="button" onClick={onConfirm}>Confirm remove</button> : null),
}));

async function renderEligibilityNotice(leadIds: string[]) {
  const { EligibilityNotice } = await import('../ui/campaign-eligibility-notice');
  return render(<EligibilityNotice leadIds={leadIds} channel="voice" />);
}

const recip = (id: string, over: Record<string, unknown> = {}) => ({
  _id: id, state: 'ineligible', attemptCount: 0, phoneSnapshot: '+41791234500',
  eligibility: { eligible: false, reasons: ['consent_required'] },
  leadId: { _id: `lead-${id}`, name: `Lead ${id}`, leadNumber: `L-${id}`, mobile: '+41791234500', phone: null }, ...over,
});

async function renderEnrolled() {
  const { EnrolledRecipientsList } = await import('../ui/campaign-eligibility-notice');
  return render(<EnrolledRecipientsList campaignId="c1" />);
}

beforeEach(() => vi.clearAllMocks());

describe('EligibilityNotice', () => {
  it('warns during creation when selected leads lack consent, with how to fix it', async () => {
    mocks.usePreviewEligibility.mockReturnValue({
      data: { total: 3, found: 3, unavailable: 0, eligible: 0, reasonCounts: { consent_required: 2, consent_expired: 1, duplicate_phone: 1 }, leads: [] },
      isLoading: false, isError: false,
    });
    await renderEligibilityNotice(['a', 'b', 'c']);
    expect(screen.getByRole('alert')).toHaveTextContent('None of your 3 selected leads can be called yet');
    expect(screen.getByText(/3 · Call consent not recorded — open each lead’s AI Calls tab and Record verified consent/)).toBeTruthy();
    expect(screen.getByText(/1 · Duplicate phone number/)).toBeTruthy();
    expect(screen.getByText(/save this as a draft/)).toBeTruthy();
  });

  it('confirms when every selected lead can be called', async () => {
    mocks.usePreviewEligibility.mockReturnValue({
      data: { total: 2, found: 2, unavailable: 0, eligible: 2, reasonCounts: {}, leads: [] },
      isLoading: false, isError: false,
    });
    await renderEligibilityNotice(['a', 'b']);
    expect(screen.getByText('All 2 selected leads can be called.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('EnrolledRecipientsList (edit wizard)', () => {
  it('lists enrolled leads with phone + reason, and removes selected ones (skipping mid-call)', async () => {
    mocks.useRecipients.mockReturnValue({
      data: { data: [recip('a'), recip('b', { state: 'in_progress' })], pagination: { total: 2, pages: 1 } },
      isLoading: false, isError: false, refetch: vi.fn(),
    });
    await renderEnrolled();
    expect(screen.getByText('Lead a')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /\+41791234500/ }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: /Call consent not recorded . record consent/ }).length).toBeGreaterThan(0);

    // The in-progress recipient cannot be selected.
    expect(screen.getByRole('checkbox', { name: 'Select Lead b' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Lead a' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove 1/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm remove' }));
    expect(mocks.removeRecipients).toHaveBeenCalledWith(['a'], expect.anything());
  });
});
