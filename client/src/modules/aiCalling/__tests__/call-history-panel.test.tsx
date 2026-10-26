// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CallRecord } from '../types/ai-calling-types';

const mocks = vi.hoisted(() => ({
  useCalls: vi.fn(),
}));

vi.mock('../hooks/use-ai-calling', () => ({ useCalls: mocks.useCalls }));
vi.mock('../ui/call-review-drawer', () => ({
  CallReviewDrawer: ({ callId, onClose }: { callId: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Call detail">
      <span>{callId}</span>
      <button type="button" onClick={onClose}>Close detail</button>
    </div>
  ),
}));

const record: CallRecord = {
  _id: 'record-1',
  internalCallId: 'call-prod-1',
  attemptNumber: 1,
  state: 'completed',
  disposition: 'answered_partial',
  qualification: 'review',
  durationSeconds: 74,
  answers: [],
  reviewRequired: true,
  createdAt: '2026-10-26T08:30:00.000Z',
  campaignId: { _id: 'campaign-1', name: 'Renewal outreach' },
  leadId: { _id: 'lead-1', name: 'Maya Chen', leadNumber: '+41 44 555 0101' },
};

function queryResult(overrides: Record<string, unknown> = {}) {
  return {
    data: { data: [record], pagination: { page: 1, limit: 10, total: 1, pages: 1 } },
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useCalls.mockReturnValue(queryResult());
});

describe('CallHistoryPanel', () => {
  it('renders server-backed attempts, filters review calls and opens details by keyboard', async () => {
    const { CallHistoryPanel } = await import('../ui/call-history-panel');
    render(<CallHistoryPanel />);

    expect(screen.getByText('Maya Chen')).toBeTruthy();
    expect(screen.getByText('Renewal outreach')).toBeTruthy();
    expect(screen.getByText('Review answers')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review only' }));
    expect(mocks.useCalls).toHaveBeenLastCalledWith(expect.objectContaining({ reviewRequired: true }));

    fireEvent.keyDown(screen.getByRole('button', { name: 'Open call details for Maya Chen' }), { key: 'Enter' });
    expect(screen.getByRole('dialog', { name: 'Call detail' })).toHaveTextContent('record-1');
  });

  it('shows honest loading, empty and error states with a working retry', async () => {
    const { CallHistoryPanel } = await import('../ui/call-history-panel');
    const retry = vi.fn();
    mocks.useCalls.mockReturnValue(queryResult({ data: undefined, isLoading: true }));
    const view = render(<CallHistoryPanel />);
    expect(screen.getByRole('status', { name: 'Loading call history' })).toBeTruthy();

    mocks.useCalls.mockReturnValue(queryResult({ data: { data: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } } }));
    view.rerender(<CallHistoryPanel />);
    expect(screen.getByText('No matching calls')).toBeTruthy();

    mocks.useCalls.mockReturnValue(queryResult({ data: undefined, isError: true, refetch: retry }));
    view.rerender(<CallHistoryPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(retry).toHaveBeenCalledOnce());
  });
});
