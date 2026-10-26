// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CallRecord } from '../types/ai-calling-types';

const call = (over: Partial<CallRecord> = {}): CallRecord => ({
  _id: 'c1', internalCallId: 'call_1', attemptNumber: 1, state: 'needs_reconcile', disposition: 'needs_review', qualification: null,
  durationSeconds: 14, answers: [], reviewRequired: true, provider: 'paired_phone',
  failureCode: 'GATEWAY_OUTCOME_UNKNOWN', failureMessage: 'ESP32 link lost: unplugged',
  reconciliation: { needed: true, note: null, resolvedAt: null, resolution: null },
  campaignId: { _id: 'k1', name: 'Paired run' },
  ...over,
});

const api = {
  getCall: vi.fn(async () => call()),
  reconcileCall: vi.fn(async () => call({ state: 'completed' })),
  reviewCall: vi.fn(async () => call()),
};
vi.mock('../services/ai-calling-api', () => ({ aiCallingApi: api }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));

const { CallReviewDrawer } = await import('../ui/call-review-drawer');

const wrap = (ui: ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>,
);

beforeEach(() => vi.clearAllMocks());

describe('CallReviewDrawer: unknown outcome', () => {
  it('explains the parked call and resolves it only after a choice (qualification only when reached)', async () => {
    const onClose = vi.fn();
    wrap(<CallReviewDrawer callId="c1" onClose={onClose} />);
    const panel = await screen.findByRole('region', { name: 'Resolve unknown outcome' });
    expect(within(panel).getByText(/ESP32 link lost: unplugged/)).toBeTruthy();
    expect(within(panel).getByText(/never called again automatically/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Save review/ })).toBeNull(); // no silent "clear flag" for a parked call
    const resolve = within(panel).getByRole('button', { name: /Resolve outcome/ });
    expect((resolve as HTMLButtonElement).disabled).toBe(true);
    expect(within(panel).queryByLabelText('Qualification')).toBeNull();

    fireEvent.click(within(panel).getByRole('radio', { name: /The lead was reached/ }));
    fireEvent.change(within(panel).getByLabelText('Qualification'), { target: { value: 'qualified' } });
    fireEvent.change(within(panel).getByLabelText('Note'), { target: { value: 'call log 0:42' } });
    fireEvent.click(resolve);
    await waitFor(() => expect(api.reconcileCall).toHaveBeenCalledWith('c1', { resolution: 'reached', qualification: 'qualified', note: 'call log 0:42' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('“call again” sends no qualification', async () => {
    wrap(<CallReviewDrawer callId="c1" onClose={() => {}} />);
    const panel = await screen.findByRole('region', { name: 'Resolve unknown outcome' });
    fireEvent.click(within(panel).getByRole('radio', { name: /call again/ }));
    fireEvent.click(within(panel).getByRole('button', { name: /Resolve outcome/ }));
    await waitFor(() => expect(api.reconcileCall).toHaveBeenCalledWith('c1', { resolution: 'retry', note: '' }));
  });

  it('a resolved or ordinary call shows the normal answer review', async () => {
    api.getCall.mockResolvedValueOnce(call({ state: 'completed', disposition: 'answered_partial', reconciliation: { needed: true, note: null, resolvedAt: '2026-10-24T08:00:00Z', resolution: 'reached' } }));
    wrap(<CallReviewDrawer callId="c1" onClose={() => {}} />);
    expect(await screen.findByRole('button', { name: /Save review/ })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Resolve unknown outcome' })).toBeNull();
  });
});
