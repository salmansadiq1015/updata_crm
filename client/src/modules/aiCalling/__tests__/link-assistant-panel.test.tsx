// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LanguageProvider } from '@/lib/i18n/language-context';

const session = { id: 's1', campaignId: 'c1', leadId: 'l1', leadName: 'Bilal Traders', callId: 'x', callRecordId: 'r1', status: 'active', outcome: null, language: 'roman_ur', turns: 4, funnel: {}, isTest: false, reminders: { sent: 0, lastSentAt: null }, usage: { cost: 0, modelCalls: 0 }, expiresAt: '', lastActivityAt: '2026-10-22T10:00:00Z', createdAt: '', closedAt: null };
const api = {
  analytics: vi.fn(async () => ({
    campaignId: 'c1', sessions: 2,
    funnel: { link_issued: 2, sms_sent: 2, delivered: 1, link_opened: 2, chat_started: 2, completed: 1, opted_out: 0 },
    rates: { openRate: 100, startRate: 100, completionRate: 50, optOutRate: 0 },
    perQuestion: [{ fieldKey: 'bill', label: 'Monthly bill', answered: 1, unknown: 1, dropOff: 1, unknownRate: 50 }],
    averageCompletionSeconds: 150, cost: { total: 0.0004, perCompleted: 0.0004 },
  })),
  sessions: vi.fn(async (_params: Record<string, unknown>) => ({ data: [session], pagination: { page: 1, limit: 25, total: 1, pages: 1 } })),
  session: vi.fn(async () => ({
    ...session, campaignName: 'Solar', funnel: { link_issued: '2026-10-22T09:00:00Z', sms_sent: '2026-10-22T09:01:00Z' },
    answers: [
      { fieldKey: 'bill', label: 'Monthly bill', value: 18500, validation: 'valid', confirmed: true, unknown: false },
      { fieldKey: 'owner', label: 'Owner', value: null, validation: 'unknown', confirmed: false, unknown: true },
    ],
    transcript: [{ role: 'assistant', text: 'Assalam o Alaikum!', at: '2026-10-22T09:05:00Z', source: 'template' }, { role: 'customer', text: 'ji', at: '2026-10-22T09:06:00Z', source: 'customer' }],
    disposition: null, qualification: null, reviewRequired: true, openQuestions: [{ text: 'price kya hai?', at: '3' }],
  })),
  revoke: vi.fn(async () => ({ revoked: true })),
  preview: vi.fn(async () => ({ url: 'https://upd.example/c/AAAA', sessionId: 'p1' })),
  exportCsv: vi.fn(),
};
vi.mock('../services/link-assistant-api', () => ({ linkAssistantApi: api }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('../ui/call-review-drawer', () => ({ CallReviewDrawer: () => null }));

const { LinkAssistantPanel } = await import('../ui/link-assistant-panel');

const renderPanel = () => render(
  <LanguageProvider initialLocale="en">
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <LinkAssistantPanel campaignId="c1" />
    </QueryClientProvider>
  </LanguageProvider>,
);

beforeEach(() => vi.clearAllMocks());

describe('LinkAssistantPanel', () => {
  it('shows the funnel with step conversion, rates, per-question quality and conversations', async () => {
    renderPanel();
    const funnel = (await screen.findByRole('heading', { name: 'Funnel' })).closest('section')!;
    // Delivered is half of SMS sent; completed is half of chats started.
    expect(within(funnel).getAllByText('50%')).toHaveLength(2);
    expect(screen.getByText('Completion rate').nextSibling?.textContent).toBe('50%');
    const table = screen.getByRole('table');
    expect(within(table).getByRole('rowheader', { name: 'Monthly bill' })).toBeTruthy();
    expect(within(table).getByText('(50%)')).toBeTruthy();
    expect(await screen.findByText('Bilal Traders')).toBeTruthy();
  });

  it('filters conversations by status on the server and resets to page 1', async () => {
    renderPanel();
    await screen.findByText('Bilal Traders');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'completed' } });
    await waitFor(() => expect(api.sessions).toHaveBeenLastCalledWith({ campaignId: 'c1', status: 'completed', page: 1, limit: 25 }));
  });

  it('opens a transcript with answers, link activity and questions for the team', async () => {
    renderPanel();
    fireEvent.click(await screen.findByText('Bilal Traders'));
    const sheet = await screen.findByRole('dialog');
    expect(await within(sheet).findByText('18500')).toBeTruthy();
    expect(within(sheet).getByText('confirmed')).toBeTruthy();
    expect(within(sheet).getByText('Lead doesn’t know'.replace('’', "'"))).toBeTruthy();
    expect(within(sheet).getByText('price kya hai?')).toBeTruthy();
    expect(within(sheet).getByText('Assalam o Alaikum!')).toBeTruthy();
    expect(within(sheet).getByText('SMS sent')).toBeTruthy();
    // Delivery was never confirmed by the carrier, so it is not shown as reached.
    expect(within(sheet).queryByText('Delivered (carrier)')).toBeNull();
    expect(within(sheet).getByText(/need a human check/)).toBeTruthy();
  });

  it('revoking a link asks for confirmation first', async () => {
    renderPanel();
    fireEvent.click(await screen.findByText('Bilal Traders'));
    fireEvent.click(await screen.findByRole('button', { name: /Revoke link/ }));
    expect(api.revoke).not.toHaveBeenCalled();
    const confirm = await screen.findByRole('dialog', { name: 'Revoke this link?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep link' }));
    expect(api.revoke).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Revoke link/ }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Revoke this link?' })).getByRole('button', { name: 'Revoke link' }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('s1'));
  });

  it('"Preview as customer" opens the real page in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderPanel();
    fireEvent.click(screen.getByText('Preview as customer'));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://upd.example/c/AAAA', '_blank', 'noopener,noreferrer'));
  });

  it('shows a retryable error instead of an empty panel when loading fails', async () => {
    api.sessions.mockRejectedValueOnce(new Error('network'));
    renderPanel();
    const alert = await screen.findByText('Conversations could not be loaded.');
    fireEvent.click(within(alert.closest('[role=alert]') as HTMLElement).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Bilal Traders')).toBeTruthy();
  });
});
